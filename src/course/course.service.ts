import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
  OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Course, CourseAssignment, CourseAssignmentDocument, CourseAttempt, CourseAttemptDocument, CourseDocument,
  CourseLesson, CourseLessonDocument, CoursePractical, CoursePracticalDocument, CourseReflection,
  CourseReflectionDocument, CourseSection, CourseSectionDocument, FLIP_CHART_STUDIED_SEC, FlipChartView,
  FlipChartViewDocument, LessonProgress, LessonProgressDocument, MurabbiPoint, MurabbiPointDocument, PRACTICAL_CRITERIA,
  practicalBand,
} from './course.schema';
import {
  AssignCourseDto, CourseLessonDto, CourseSectionDto, CreateCourseDto, FlipChartViewDto, HeartbeatDto, PracticalDto, ReflectionDto,
  ReviewReflectionDto, SetQuestionsDto, SubmitAnswersDto, UpdateCourseLessonDto, UpdateCourseSectionDto, UpdateCourseSettingsDto,
} from './course.dto';
import { AudioStoreService, looksLikeMp3 } from './audio-store.service';
import { mp3DurationSec } from './mp3-duration';
import { Range, applyBeat } from './listening.util';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { TrainingService } from '../training/training.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';
import { EmailService } from '../email/email.service';
import asaasContent from './content/asaas-tier1.json';
import asaasQuestions from './content/asaas-questions.json';
import asaasFlipCharts from './content/asaas-flipcharts.json';

export const ASAAS_KEY = 'asaas-tier1';
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const DAY_MS = 24 * 3600_000;

type Requester = { id: string; role: string };

/** One thing a person has to do to finish a training (shown in the marketplace). */
export interface TrainingStep { label: string; done: boolean; detail?: string }
/** A training with its own rules (Asaas for Parents) says what finishing it means. */
export type StepsProvider = (userId: string) => Promise<TrainingStep[]>;

/** Lesson length used until its audio is uploaded (the real length is read from the MP3). */
const PLACEHOLDER_SEC = 60;
const portalPath = (role?: string | null) => (role === UserRole.PARENT ? '/parent' : '/murabbi');

/** Whole days (Pakistan time) from `start` to `now`: 0 on the first day. */
export function dayIndex(start: Date, now = new Date()) {
  const pk = (d: Date) => Math.floor((d.getTime() + 5 * 3600_000) / DAY_MS);
  return pk(now) - pk(new Date(start));
}

/** Parents' course: a section opens `unlockDay` days after the person's start (or now, if an admin opened everything). */
export function sectionOpen(section: { unlockDay?: number }, assignment: { createdAt?: Date; allOpen?: boolean } | null, now = new Date()) {
  if (!assignment) return false;
  return !!assignment.allOpen || dayIndex(assignment.createdAt ?? now, now) >= (section.unlockDay ?? 0);
}

@Injectable()
export class CourseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    @InjectModel(Course.name)           private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseSection.name)    private readonly sectionModel:    Model<CourseSectionDocument>,
    @InjectModel(CourseLesson.name)     private readonly lessonModel:     Model<CourseLessonDocument>,
    @InjectModel(CourseAssignment.name) private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(LessonProgress.name)   private readonly progressModel:   Model<LessonProgressDocument>,
    @InjectModel(CourseAttempt.name)    private readonly attemptModel:    Model<CourseAttemptDocument>,
    @InjectModel(CourseReflection.name) private readonly reflectionModel: Model<CourseReflectionDocument>,
    @InjectModel(CoursePractical.name)  private readonly practicalModel:  Model<CoursePracticalDocument>,
    @InjectModel(MurabbiPoint.name)     private readonly pointModel:      Model<MurabbiPointDocument>,
    @InjectModel(FlipChartView.name)    private readonly flipModel:       Model<FlipChartViewDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    private readonly audio: AudioStoreService,
    private readonly training: TrainingService,
    private readonly notif: NotificationService,
    private readonly email: EmailService,
  ) {}

  // ══ Seeding ════════════════════════════════════════════════════════════════

  private reminderTimer: NodeJS.Timeout | null = null;

  /** Creates the Asaas course (sections, lessons, transcripts) the first time the app starts. */
  async onModuleInit() {
    try {
      await this.seedAsaas();
      // The trainings that existed before the marketplace are open in it.
      await this.courseModel.updateMany({ published: { $exists: false } }, { $set: { published: true } });
    } catch (err) {
      this.logger.error(`Could not seed the Asaas course: ${(err as Error).message}`);
    }
    // Training reminders: checked every hour; each one is sent once.
    if (process.env.NODE_ENV !== 'test') {
      this.reminderTimer = setInterval(() => { this.sendReminders().catch((e) => this.logger.error(`Reminders: ${(e as Error).message}`)); }, 3600_000);
      this.reminderTimer.unref?.();
    }
  }

  onModuleDestroy() {
    if (this.reminderTimer) clearInterval(this.reminderTimer);
  }

  async seedAsaas() {
    const c = asaasContent as any;
    let course = await this.courseModel.findOne({ key: ASAAS_KEY });
    if (!course) {
      const fa04 = c.sections.flatMap((s: any) => s.lessons).find((l: any) => l.code === 'FA-04');
      const prompt = fa04?.transcript?.find((p: any) => p.t.startsWith('"'))?.t?.replace(/^"|"$/g, '') ?? '';
      try {
        course = await this.courseModel.create({
          key: ASAAS_KEY, title: c.title, titleUr: c.titleUr, tier: c.tier, trainer: c.trainer,
          reflectionPrompt: prompt, published: true, position: 10,
        });
      } catch (err: any) {
        if (err?.code !== 11000) throw err; // another instance seeded it first
        course = await this.courseModel.findOne({ key: ASAAS_KEY });
      }
    }
    if (!course) return;

    if (!(await this.lessonModel.exists({ course: course._id }))) {
      let order = 0;
      for (const s of c.sections) {
        const section = await this.sectionModel.findOneAndUpdate(
          { course: course._id, key: s.key },
          { $setOnInsert: { order: s.order, title: s.title, titleUr: s.titleUr, meta: s.meta } },
          { upsert: true, new: true },
        );
        await this.lessonModel.insertMany(s.lessons.map((l: any) => ({
          course: course._id, section: section._id, code: l.code, order: ++order, title: l.title, topic: l.section,
          durationSec: l.durationSec, transcript: l.transcript, trainerNotes: l.trainerNotes,
        })), { ordered: false }).catch((err) => { if (err?.code !== 11000) throw err; });
      }
      this.logger.log(`Seeded the Asaas course: ${order} lessons.`);
    }
    if (!course.questions?.length && (asaasQuestions as any[]).length) {
      await this.courseModel.updateOne({ _id: course._id, 'questions.0': { $exists: false } }, { $set: { questions: asaasQuestions } });
    }
    if (!course.flipCharts?.length) {
      await this.courseModel.updateOne({ _id: course._id, 'flipCharts.0': { $exists: false } }, { $set: { flipCharts: asaasFlipCharts } });
    }
  }

  // ══ Helpers ════════════════════════════════════════════════════════════════

  /** Other courses (e.g. Asaas for Parents) register how to seed themselves, for the retry below. */
  private readonly seeders = new Map<string, () => Promise<void>>();
  registerSeeder(key: string, seed: () => Promise<void>) { this.seeders.set(key, seed); }

  /** Trainings with their own certificate rules (and so their own completion checks). */
  private readonly stepProviders = new Map<string, StepsProvider>();
  registerSteps(key: string, steps: StepsProvider) { this.stepProviders.set(key, steps); }
  isCustom(key: string) { return this.stepProviders.has(key); }

  private async course(key: string) {
    let c = await this.courseModel.findOne({ key }).lean();
    const seed = key === ASAAS_KEY ? () => this.seedAsaas() : this.seeders.get(key);
    if (!c && seed) {
      // Seeding at startup can fail (e.g. the database was briefly unreachable); retry on first use.
      await seed();
      c = await this.courseModel.findOne({ key }).lean();
    }
    if (!c) throw new NotFoundException('Course not found.');
    return c;
  }

  private lessons(courseId: Types.ObjectId) {
    return this.lessonModel.find({ course: courseId }).select('-transcript -trainerNotes').sort({ order: 1 }).lean();
  }

  private async assignment(courseId: Types.ObjectId, userId: string) {
    return this.assignmentModel.findOne({ course: courseId, user: new Types.ObjectId(userId) }).lean();
  }

  private async requireAssignment(courseId: Types.ObjectId, userId: string) {
    const a = await this.assignment(courseId, userId);
    if (!a) throw new ForbiddenException('This training hasn’t been assigned to you yet.');
    return a;
  }

  private async progressByLesson(courseId: Types.ObjectId, userId: string) {
    const rows = await this.progressModel.find({ course: courseId, user: new Types.ObjectId(userId) })
      .select('lesson percent completed lastPosition listenSec heardSec lastBeatAt').lean();
    return new Map(rows.map((r) => [r.lesson.toString(), r]));
  }

  /** Which lessons are open: all of them, or in order (each after the previous is completed). */
  private unlocked(course: Course, lessons: { _id: any }[], progress: Map<string, { completed: boolean }>) {
    const open = new Set<string>();
    for (let i = 0; i < lessons.length; i++) {
      const id = lessons[i]._id.toString();
      if (!course.sequential || i === 0 || progress.get(lessons[i - 1]._id.toString())?.completed) open.add(id);
      else break;
    }
    return course.sequential ? open : new Set(lessons.map((l) => l._id.toString()));
  }

  private async award(userId: string, reason: string, ref: string, points: number, label: string) {
    if (!points) return;
    try {
      await this.pointModel.create({ user: new Types.ObjectId(userId), reason, ref, points, label });
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // already awarded
    }
  }

  private async pointsTotal(userId: string) {
    const [r] = await this.pointModel.aggregate([{ $match: { user: new Types.ObjectId(userId) } }, { $group: { _id: null, t: { $sum: '$points' } } }]);
    return r?.t ?? 0;
  }

  private async recentFailures(courseId: Types.ObjectId, userId: string) {
    return this.attemptModel.find({ course: courseId, user: new Types.ObjectId(userId), passed: false, createdAt: { $gte: new Date(Date.now() - DAY_MS) } })
      .select('createdAt').sort({ createdAt: 1 }).lean<{ createdAt: Date }[]>();
  }

  private notify(recipient: string, sender: string | undefined, title: string, message: string, payload: Record<string, unknown> = {}) {
    this.notif.create({ recipient, sender, type: NotificationType.TRAINING, title, message, payload }).catch(() => {});
  }

  // ══ Admin: content, audio, settings, questions ═════════════════════════════

  async outline(key: string) {
    const course = await this.course(key);
    const [sections, lessons, assigned] = await Promise.all([
      this.sectionModel.find({ course: course._id }).sort({ order: 1 }).lean(),
      this.lessonModel.find({ course: course._id }).select('-transcript').sort({ order: 1 }).lean(),
      this.assignmentModel.countDocuments({ course: course._id }),
    ]);
    return {
      course,
      criteria: PRACTICAL_CRITERIA,
      stats: {
        lessons: lessons.length,
        withAudio: lessons.filter((l) => l.audio?.fileId).length,
        totalMinutes: Math.round(lessons.reduce((s, l) => s + l.durationSec, 0) / 60),
        assigned,
      },
      sections: sections.map((s) => ({
        ...s,
        lessons: lessons.filter((l) => l.section.toString() === s._id.toString()).map((l) => ({
          _id: l._id, code: l.code, order: l.order, title: l.title, topic: l.topic, durationSec: l.durationSec,
          trainerNotes: l.trainerNotes, hasAudio: !!l.audio?.fileId, audioSize: l.audio?.size ?? 0, audioUploadedAt: l.audio?.uploadedAt ?? null,
        })),
      })),
    };
  }

  async updateSettings(key: string, dto: UpdateCourseSettingsDto) {
    const course = await this.course(key);
    const $set: Record<string, unknown> = {};
    for (const k of [
      'completionThreshold', 'sequential', 'passingScore', 'maxFailedAttemptsPerDay', 'requirePractical', 'reflectionPrompt', 'reflectionMinChars',
      'title', 'titleUr', 'summary', 'summaryUr', 'category', 'trainer', 'badge', 'published', 'position', 'tier',
    ] as const) {
      if (dto[k] !== undefined) $set[k] = dto[k];
    }
    if (dto.prerequisites !== undefined) {
      const keys = [...new Set(dto.prerequisites)].filter((k) => k !== course.key);
      // Looked up one by one so a training that's created on first use (Asaas) is ready.
      const found = await Promise.all(keys.map((k) => this.course(k).catch(() => {
        throw new BadRequestException('A required training no longer exists.');
      })));
      if (found.some((f) => f.audience !== course.audience)) throw new BadRequestException('Required trainings must be for the same people (murabbis or parents).');
      // No loops: none of the required trainings may (indirectly) require this one.
      const all = await this.courseModel.find().select('key prerequisites').lean();
      const needs = new Map(all.map((c) => [c.key, c.prerequisites ?? []]));
      const seen = new Set<string>();
      const stack = [...keys];
      while (stack.length) {
        const k = stack.pop()!;
        if (k === course.key) throw new BadRequestException('That would make the trainings require each other.');
        if (seen.has(k)) continue;
        seen.add(k);
        stack.push(...(needs.get(k) ?? []));
      }
      $set.prerequisites = keys;
    }
    if (dto.published && !course.published && !(await this.lessonModel.exists({ course: course._id, 'audio.fileId': { $ne: null } }))) {
      throw new BadRequestException('Add at least one lesson with audio before publishing.');
    }
    if (dto.points) for (const [k, v] of Object.entries(dto.points)) if (v !== undefined) $set[`points.${k}`] = v;
    const updated = await this.courseModel.findByIdAndUpdate(course._id, { $set }, { new: true, runValidators: true }).lean();
    return { message: 'Training settings saved.', course: updated };
  }

  async setQuestions(key: string, dto: SetQuestionsDto) {
    const course = await this.course(key);
    dto.questions.forEach((q, i) => {
      if (q.correctIndex >= q.options.length) {
        throw new BadRequestException(`Question ${i + 1}: the correct answer must be one of its ${q.options.length} options.`);
      }
    });
    await this.courseModel.updateOne({ _id: course._id }, { $set: { questions: dto.questions } });
    return { message: `${dto.questions.length} question${dto.questions.length === 1 ? '' : 's'} saved.`, count: dto.questions.length };
  }

  /** Bulk upload: each file is matched to its lesson by name ("m4-01.mp3" → M4-01). */
  async uploadAudio(key: string, files: Express.Multer.File[]) {
    const course = await this.course(key);
    if (!files?.length) throw new BadRequestException('Choose the lesson audio files (MP3) to upload.');
    const lessons = await this.lessonModel.find({ course: course._id }).select('code audio').lean();
    const byCode = new Map(lessons.map((l) => [l.code.toLowerCase(), l]));
    const matched: string[] = [];
    const unmatched: string[] = [];
    const rejected: { file: string; reason: string }[] = [];

    for (const f of files) {
      const code = f.originalname.toLowerCase().replace(/\.mp3$/, '').replace(/^[0-9a-f]{8}-/, '').trim();
      const lesson = byCode.get(code);
      if (!lesson) { unmatched.push(f.originalname); continue; }
      if (f.size > MAX_AUDIO_BYTES) { rejected.push({ file: f.originalname, reason: 'larger than 15 MB' }); continue; }
      if (!looksLikeMp3(f.buffer)) { rejected.push({ file: f.originalname, reason: 'not an MP3 file' }); continue; }
      const fileId = await this.audio.save(f.buffer, `${course.key}/${lesson.code}.mp3`);
      const seconds = mp3DurationSec(f.buffer);
      await this.lessonModel.updateOne({ _id: lesson._id }, { $set: {
        audio: { fileId, size: f.size, uploadedAt: new Date() }, ...(seconds >= 1 && { durationSec: seconds }),
      } });
      await this.audio.remove(lesson.audio?.fileId);
      matched.push(lesson.code);
    }
    const missing = (await this.lessonModel.find({ course: course._id, 'audio.fileId': null }).select('code').sort({ order: 1 }).lean()).map((l) => l.code);
    return {
      message: `${matched.length} audio file${matched.length === 1 ? '' : 's'} uploaded.${missing.length ? ` ${missing.length} lesson${missing.length === 1 ? '' : 's'} still without audio.` : ' Every lesson has audio.'}`,
      matched, unmatched, rejected, missing,
    };
  }

  // ══ Admin: building a training ═════════════════════════════════════════════

  async createCourse(dto: CreateCourseDto) {
    const base = dto.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'training';
    let key = base;
    for (let n = 2; await this.courseModel.exists({ key }); n++) key = `${base}-${n}`;
    const last = await this.courseModel.findOne().sort({ position: -1 }).select('position').lean();
    const course = await this.courseModel.create({
      key, title: dto.title, titleUr: dto.titleUr ?? '', audience: dto.audience, summary: dto.summary ?? '', category: dto.category ?? '',
      badge: dto.title, published: false, position: (last?.position ?? 0) + 10,
    });
    return { message: 'Training created. Add its modules and lessons, then publish it.', course };
  }

  async deleteCourse(key: string) {
    const course = await this.course(key);
    if (course.key === ASAAS_KEY || this.isCustom(course.key)) throw new BadRequestException('The Asaas trainings can’t be deleted.');
    if (await this.assignmentModel.exists({ course: course._id })) {
      throw new BadRequestException('People are enrolled in this training. Unpublish it instead, or unassign everyone first.');
    }
    const lessons = await this.lessonModel.find({ course: course._id }).select('audio').lean();
    await Promise.all(lessons.map((l) => this.audio.remove(l.audio?.fileId)));
    await Promise.all([
      this.lessonModel.deleteMany({ course: course._id }), this.sectionModel.deleteMany({ course: course._id }),
      this.progressModel.deleteMany({ course: course._id }), this.courseModel.deleteOne({ _id: course._id }),
    ]);
    await this.courseModel.updateMany({ prerequisites: course.key }, { $pull: { prerequisites: course.key } });
    return { message: 'Training deleted.' };
  }

  /** Lessons are numbered through the whole training in module order (sequential unlocking follows it). */
  private async renumber(courseId: Types.ObjectId) {
    const sections = await this.sectionModel.find({ course: courseId }).sort({ order: 1 }).select('_id').lean();
    const lessons = await this.lessonModel.find({ course: courseId }).sort({ order: 1 }).select('section order').lean();
    let n = 0;
    const ops = sections.flatMap((sec) => lessons.filter((l) => String(l.section) === String(sec._id)))
      .map((l) => ({ updateOne: { filter: { _id: l._id }, update: { $set: { order: ++n } } } }));
    if (ops.length) await this.lessonModel.bulkWrite(ops);
  }

  private async swap<T extends { _id: any; order: number }>(model: Model<any>, filter: Record<string, unknown>, item: T, move: 'up' | 'down') {
    const neighbour = await model.findOne({ ...filter, order: move === 'up' ? { $lt: item.order } : { $gt: item.order } })
      .sort({ order: move === 'up' ? -1 : 1 }).select('order').lean() as { _id: any; order: number } | null;
    if (!neighbour) return;
    await model.updateOne({ _id: item._id }, { $set: { order: neighbour.order } });
    await model.updateOne({ _id: neighbour._id }, { $set: { order: item.order } });
  }

  private async editable(courseId: Types.ObjectId) {
    const course = await this.courseModel.findById(courseId).select('key').lean();
    if (!course) throw new NotFoundException('Training not found.');
    if (course.key === ASAAS_KEY || this.isCustom(course.key)) {
      throw new BadRequestException('The Asaas lessons come from the recorded course; replace their audio instead of editing them.');
    }
    return course;
  }

  async addSection(key: string, dto: CourseSectionDto) {
    const course = await this.course(key);
    await this.editable(course._id);
    const last = await this.sectionModel.findOne({ course: course._id }).sort({ order: -1 }).select('order').lean();
    const order = (last?.order ?? 0) + 1;
    let skey = `s${order}`;
    for (let n = order + 1; await this.sectionModel.exists({ course: course._id, key: skey }); n++) skey = `s${n}`;
    const section = await this.sectionModel.create({ course: course._id, key: skey, order, title: dto.title, titleUr: dto.titleUr ?? '', meta: dto.meta ?? '' });
    return { message: 'Module added.', section };
  }

  async updateSection(id: string, dto: UpdateCourseSectionDto) {
    const section = await this.sectionModel.findById(id).lean();
    if (!section) throw new NotFoundException('Module not found.');
    await this.editable(section.course);
    const $set: Record<string, unknown> = {};
    for (const k of ['title', 'titleUr', 'meta'] as const) if (dto[k] !== undefined) $set[k] = dto[k];
    if (Object.keys($set).length) await this.sectionModel.updateOne({ _id: section._id }, { $set });
    if (dto.move) {
      await this.swap(this.sectionModel, { course: section.course }, section, dto.move);
      await this.renumber(section.course);
    }
    return { message: 'Module saved.' };
  }

  async deleteSection(id: string) {
    const section = await this.sectionModel.findById(id).lean();
    if (!section) throw new NotFoundException('Module not found.');
    await this.editable(section.course);
    if (await this.lessonModel.exists({ section: section._id })) throw new BadRequestException('Move or delete this module’s lessons first.');
    await this.sectionModel.deleteOne({ _id: section._id });
    return { message: 'Module deleted.' };
  }

  private paragraphs(text?: string) {
    return (text ?? '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => ({ k: 'p', t }));
  }

  async addLesson(key: string, dto: CourseLessonDto) {
    const course = await this.course(key);
    await this.editable(course._id);
    const section = await this.sectionModel.findOne({ _id: new Types.ObjectId(dto.sectionId), course: course._id }).lean();
    if (!section) throw new NotFoundException('Module not found.');
    const count = await this.lessonModel.countDocuments({ course: course._id });
    let n = count + 1;
    let code = `L${String(n).padStart(2, '0')}`;
    while (await this.lessonModel.exists({ course: course._id, code })) code = `L${String(++n).padStart(2, '0')}`;
    const lesson = await this.lessonModel.create({
      course: course._id, section: section._id, code, order: 100000 + count, title: dto.title, topic: dto.topic ?? '',
      durationSec: PLACEHOLDER_SEC, transcript: this.paragraphs(dto.transcript),
    });
    await this.renumber(course._id);
    return { message: `Lesson ${code} added. Upload its audio as ${code.toLowerCase()}.mp3, or from the lesson itself.`, lesson };
  }

  async lessonForEdit(id: string) {
    const lesson = await this.lessonModel.findById(id).lean();
    if (!lesson) throw new NotFoundException('Lesson not found.');
    return { ...lesson, transcriptText: lesson.transcript.map((p) => p.t).join('\n\n') };
  }

  async updateLesson(id: string, dto: UpdateCourseLessonDto) {
    const lesson = await this.lessonModel.findById(id).lean();
    if (!lesson) throw new NotFoundException('Lesson not found.');
    await this.editable(lesson.course);
    const $set: Record<string, unknown> = {};
    if (dto.title !== undefined) $set.title = dto.title;
    if (dto.topic !== undefined) $set.topic = dto.topic;
    if (dto.transcript !== undefined) $set.transcript = this.paragraphs(dto.transcript);
    if (dto.sectionId && dto.sectionId !== String(lesson.section)) {
      const section = await this.sectionModel.findOne({ _id: new Types.ObjectId(dto.sectionId), course: lesson.course }).lean();
      if (!section) throw new NotFoundException('Module not found.');
      $set.section = section._id;
      $set.order = 100000; // goes to the end of its new module
    }
    if (Object.keys($set).length) await this.lessonModel.updateOne({ _id: lesson._id }, { $set });
    if (dto.move) await this.swap(this.lessonModel, { course: lesson.course, section: lesson.section }, lesson, dto.move);
    if (dto.move || $set.section) await this.renumber(lesson.course);
    return { message: 'Lesson saved.' };
  }

  async deleteLesson(id: string) {
    const lesson = await this.lessonModel.findById(id).lean();
    if (!lesson) throw new NotFoundException('Lesson not found.');
    await this.editable(lesson.course);
    await this.audio.remove(lesson.audio?.fileId);
    await Promise.all([this.lessonModel.deleteOne({ _id: lesson._id }), this.progressModel.deleteMany({ lesson: lesson._id })]);
    await this.renumber(lesson.course);
    return { message: 'Lesson deleted.' };
  }

  /** One lesson's audio (any training, Asaas included); its length is read from the file. */
  async uploadLessonAudio(id: string, file: Express.Multer.File | undefined) {
    const lesson = await this.lessonModel.findById(id).lean();
    if (!lesson) throw new NotFoundException('Lesson not found.');
    if (!file) throw new BadRequestException('Choose the MP3 file.');
    if (file.size > MAX_AUDIO_BYTES) throw new BadRequestException('The file is larger than 15 MB.');
    if (!looksLikeMp3(file.buffer)) throw new BadRequestException('That isn’t an MP3 file.');
    const course = await this.courseModel.findById(lesson.course).select('key').lean();
    const fileId = await this.audio.save(file.buffer, `${course?.key}/${lesson.code}.mp3`);
    const seconds = mp3DurationSec(file.buffer);
    await this.lessonModel.updateOne({ _id: lesson._id }, { $set: {
      audio: { fileId, size: file.size, uploadedAt: new Date() }, ...(seconds >= 1 && { durationSec: seconds }),
    } });
    await this.audio.remove(lesson.audio?.fileId);
    return { message: `Audio uploaded (${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}).`, durationSec: seconds >= 1 ? seconds : lesson.durationSec };
  }

  // ══ Admin: assignments and progress ════════════════════════════════════════

  async assign(key: string, adminId: string, dto: AssignCourseDto) {
    const course = await this.course(key);
    const ids = [...new Set(dto.userIds)].map((id) => new Types.ObjectId(id));
    const role = course.audience === 'parent' ? UserRole.PARENT : UserRole.MURABBI;
    const murabbis = await this.userModel.find({ _id: { $in: ids }, role }).select('_id fullName email role').lean();
    if (murabbis.length !== ids.length) throw new BadRequestException(`This training can only be assigned to ${role} accounts.`);
    const existing = new Set((await this.assignmentModel.find({ course: course._id, user: { $in: ids } }).select('user').lean()).map((a) => a.user.toString()));
    const lessonDocs = await this.lessonModel.find({ course: course._id }).select('durationSec').lean();
    const lessonCount = lessonDocs.length;
    const totalSec = lessonDocs.reduce((s, l) => s + l.durationSec, 0);
    for (const m of murabbis) {
      await this.assignmentModel.updateOne(
        { course: course._id, user: m._id },
        { $set: { dueDate: dto.dueDate ?? null, note: dto.note ?? '' }, $setOnInsert: { assignedBy: new Types.ObjectId(adminId) } },
        { upsert: true },
      );
      if (!existing.has(m._id.toString())) {
        this.notify(m._id.toString(), adminId, `New training: ${course.title}`,
          `You've been given the ${course.title}${dto.dueDate ? `, to complete by ${dto.dueDate}` : ''}. Open Trainings to start listening.`,
          { courseKey: course.key });
        void this.email.queue('training.assigned', { email: m.email, name: m.fullName, userId: m._id }, {
          courseTitle: course.title, badge: course.badge, dueDate: dto.dueDate ?? null, note: dto.note ?? '', role: m.role,
          lessons: lessonCount, minutes: Math.round(totalSec / 60), url: this.email.link(portalPath(m.role)),
        });
      }
    }
    const added = murabbis.length - existing.size;
    const who = role === UserRole.PARENT ? (added === 1 ? 'parent' : 'parents') : (added === 1 ? 'murabbi' : 'murabbis');
    return { message: `Assigned to ${added} ${who}${existing.size ? ` (${existing.size} already had it; due date updated)` : ''}.`, added, updated: existing.size };
  }

  async unassign(key: string, userId: string) {
    const course = await this.course(key);
    const r = await this.assignmentModel.deleteOne({ course: course._id, user: new Types.ObjectId(userId) });
    if (!r.deletedCount) throw new NotFoundException('That person doesn’t have this training.');
    return { message: 'Training unassigned. Their listening history is kept.' };
  }

  async progressReport(key: string) {
    const course = await this.course(key);
    const [assignments, lessons] = await Promise.all([
      this.assignmentModel.find({ course: course._id }).populate('user', 'fullName email image tier isActive').lean(),
      this.lessons(course._id),
    ]);
    const userIds = assignments.map((a) => (a.user as any)?._id).filter(Boolean);
    const [progress, attempts, reflections, practicals, certs, flips] = await Promise.all([
      this.progressModel.aggregate([
        { $match: { course: course._id, user: { $in: userIds } } },
        { $group: { _id: '$user', completed: { $sum: { $cond: ['$completed', 1, 0] } }, heardSec: { $sum: '$heardSec' }, listenSec: { $sum: '$listenSec' }, last: { $max: '$lastBeatAt' } } },
      ]),
      this.attemptModel.aggregate([
        { $match: { course: course._id, user: { $in: userIds } } },
        { $group: { _id: '$user', attempts: { $sum: 1 }, best: { $max: '$scorePercent' }, passed: { $max: { $cond: ['$passed', 1, 0] } } } },
      ]),
      this.reflectionModel.find({ course: course._id, user: { $in: userIds } }).select('user status submittedAt').lean(),
      this.practicalModel.find({ course: course._id, user: { $in: userIds } }).select('user total').lean(),
      this.training.certificatesFor(userIds, course.tier),
      this.flipModel.find({ course: course._id, user: { $in: userIds } }).select('user chart seconds studiedAt').lean(),
    ]);
    const chartKeys = new Set((course.flipCharts ?? []).map((c) => c.key));
    const studied = flips.filter((f) => f.studiedAt && chartKeys.has(f.chart));
    const totalSec = lessons.reduce((s, l) => s + l.durationSec, 0);
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const find = <T extends { _id?: any; user?: any }>(rows: T[], id: string, key: '_id' | 'user' = '_id') => rows.find((r) => r[key]?.toString() === id);

    const rows = assignments.filter((a) => a.user).map((a) => {
      const u = a.user as any;
      const id = u._id.toString();
      const p = find(progress, id);
      const at = find(attempts, id);
      const ref = find(reflections, id, 'user');
      const pr = find(practicals, id, 'user');
      const cert = certs.find((c) => c.user.toString() === id);
      const completed = p?.completed ?? 0;
      const status = cert ? 'certified'
        : completed === lessons.length ? (at?.passed ? 'assessment-passed' : 'listened')
        : completed > 0 || p?.heardSec ? 'in-progress' : 'not-started';
      return {
        user: { _id: id, fullName: u.fullName, email: u.email, image: u.image, isActive: u.isActive },
        assignedAt: (a as any).createdAt, dueDate: a.dueDate, overdue: !!a.dueDate && a.dueDate < today && !cert,
        lessonsCompleted: completed, lessonsTotal: lessons.length,
        percentHeard: totalSec ? Math.round(((p?.heardSec ?? 0) / totalSec) * 100) : 0,
        listenMinutes: Math.round((p?.listenSec ?? 0) / 60),
        lastActive: p?.last ?? null,
        assessment: at ? { attempts: at.attempts, best: at.best, passed: !!at.passed } : null,
        reflection: ref ? ref.status : null,
        practical: pr ? { total: pr.total, band: practicalBand(pr.total) } : null,
        certificate: cert ? { number: cert.certificateNumber, issuedAt: cert.issuedAt } : null,
        flipCharts: { studied: studied.filter((f) => f.user.toString() === id).length, total: chartKeys.size },
        status,
      };
    }).sort((x, y) => y.lessonsCompleted - x.lessonsCompleted);

    const by = (s: string) => rows.filter((r) => r.status === s).length;
    return {
      course: { key: course.key, title: course.title, badge: course.badge, requirePractical: course.requirePractical },
      stats: {
        assigned: rows.length, notStarted: by('not-started'), inProgress: by('in-progress'),
        listened: by('listened') + by('assessment-passed'), certified: by('certified'),
        overdue: rows.filter((r) => r.overdue).length,
        reflectionsToReview: reflections.filter((r) => r.status === 'submitted').length,
        flipChartsAllStudied: rows.filter((r) => chartKeys.size && r.flipCharts.studied === chartKeys.size).length,
      },
      rows,
      // Per chart: who has studied it (only assigned murabbis count).
      flipCharts: (course.flipCharts ?? []).map((c) => {
        const views = flips.filter((f) => f.chart === c.key);
        return {
          key: c.key, number: c.number, module: c.module, title: c.title, subtitle: c.subtitle, lessonCodes: c.lessonCodes,
          studied: views.filter((f) => f.studiedAt).length,
          studiedBy: views.filter((f) => f.studiedAt).map((f) => f.user.toString()),
          opened: views.length,
          minutes: Math.round(views.reduce((s, f) => s + f.seconds, 0) / 60),
        };
      }),
    };
  }

  /** One murabbi's lesson-by-lesson listening, attempts, reflection and practical. */
  async userDetail(key: string, userId: string) {
    const course = await this.course(key);
    const user = await this.userModel.findById(userId).select('fullName email').lean();
    if (!user) throw new NotFoundException('Murabbi not found.');
    const [lessons, progress, attempts, reflection, practical, sections, flips] = await Promise.all([
      this.lessons(course._id),
      this.progressByLesson(course._id, userId),
      this.attemptModel.find({ course: course._id, user: user._id }).select('scorePercent correct total passed createdAt').sort({ createdAt: -1 }).lean(),
      this.reflectionModel.findOne({ course: course._id, user: user._id }).populate('reviewedBy', 'fullName').lean(),
      this.practicalModel.findOne({ course: course._id, user: user._id }).populate('assessedBy', 'fullName').lean(),
      this.sectionModel.find({ course: course._id }).sort({ order: 1 }).lean(),
      this.flipModel.find({ course: course._id, user: user._id }).select('chart seconds opens studiedAt lastViewedAt').lean(),
    ]);
    return {
      user, criteria: PRACTICAL_CRITERIA,
      flipCharts: (course.flipCharts ?? []).map((c) => {
        const v = flips.find((f) => f.chart === c.key);
        return {
          key: c.key, number: c.number, title: c.title, subtitle: c.subtitle,
          studied: !!v?.studiedAt, seconds: Math.round(v?.seconds ?? 0), opens: v?.opens ?? 0, lastViewedAt: v?.lastViewedAt ?? null,
        };
      }),
      sections: sections.map((s) => ({
        _id: s._id, title: s.title, titleUr: s.titleUr,
        lessons: lessons.filter((l) => l.section.toString() === s._id.toString()).map((l) => {
          const p = progress.get(l._id.toString());
          return {
            _id: l._id, code: l.code, title: l.title, durationSec: l.durationSec,
            percent: p?.percent ?? 0, completed: !!p?.completed, listenSec: Math.round(p?.listenSec ?? 0), lastActive: p?.lastBeatAt ?? null,
          };
        }),
      })),
      attempts, reflection,
      practical: practical && { ...practical, band: practicalBand(practical.total) },
    };
  }

  // ══ Reflections and practical (admin) ══════════════════════════════════════

  listReflections(key: string, status?: string) {
    return this.course(key).then((course) => this.reflectionModel
      .find({ course: course._id, ...(status && { status }) })
      .populate('user', 'fullName email image').populate('reviewedBy', 'fullName')
      .sort({ submittedAt: -1 }).lean());
  }

  async reviewReflection(id: string, adminId: string, dto: ReviewReflectionDto) {
    const r = await this.reflectionModel.findById(id);
    if (!r) throw new NotFoundException('Reflection not found.');
    if (dto.status === 'revision' && !dto.feedback) throw new BadRequestException('Say what should be revised.');
    r.status = dto.status;
    r.feedback = dto.feedback ?? '';
    r.reviewedBy = new Types.ObjectId(adminId);
    r.reviewedAt = new Date();
    await r.save();
    const course = await this.courseModel.findById(r.course).lean();
    this.notify(r.user.toString(), adminId,
      dto.status === 'approved' ? 'Your reflection was approved' : 'Please revise your reflection',
      dto.status === 'approved' ? 'Jazak Allahu khayran. Your training reflection has been approved.' : `Feedback: ${dto.feedback}`,
      { courseKey: course?.key });
    void this.emailMurabbi(r.user.toString(), 'training.reflection', { approved: dto.status === 'approved', feedback: dto.feedback ?? '' });
    const certificate = course && dto.status === 'approved' ? await this.checkCertification(course, r.user.toString(), adminId) : null;
    return { message: dto.status === 'approved' ? 'Reflection approved.' : 'Sent back for revision.', certificate };
  }

  async setPractical(key: string, userId: string, adminId: string, dto: PracticalDto) {
    const course = await this.course(key);
    await this.requireAssignment(course._id, userId);
    const total = dto.scores.reduce((a, b) => a + b, 0);
    await this.practicalModel.updateOne(
      { course: course._id, user: new Types.ObjectId(userId) },
      { $set: { scores: dto.scores, total, notes: dto.notes ?? '', assessedBy: new Types.ObjectId(adminId) } },
      { upsert: true },
    );
    const band = practicalBand(total);
    void this.emailMurabbi(userId, 'training.practical', { total, band, notes: dto.notes ?? '' });
    const certificate = await this.checkCertification(course, userId, adminId);
    return { message: `Practical score saved: ${total}/18 (${band === 'pass' ? 'pass' : band === 'conditional' ? 'conditional pass' : 'one more practice session'}).`, total, band, certificate };
  }

  // ══ Emails ═════════════════════════════════════════════════════════════════

  private async emailMurabbi(userId: string, kind: string, data: Record<string, unknown>, opts: { dedupeKey?: string; attachment?: any } = {}) {
    const u = await this.userModel.findById(userId).select('fullName email role').lean();
    if (!u) return;
    await this.email.queue(kind, { email: u.email, name: u.fullName, userId: u._id }, {
      courseTitle: 'Asaas Murabbi Training', url: this.email.link(portalPath(u.role)), role: u.role, ...data,
    }, opts);
  }

  /**
   * Reminders for murabbis who haven't certified yet, each sent once:
   * not started 3 days after assignment; no listening for 7 days; due in
   * 7 days and in 1 day; overdue.
   */
  async sendReminders(now = new Date()) {
    const today = new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
    const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS);
    let sent = 0;
    for (const course of await this.courseModel.find().select('key title audience').lean()) {
      if (this.isCustom(course.key)) continue; // Asaas for Parents sends its own module emails
      const total = await this.lessonModel.countDocuments({ course: course._id });
      const assignments = await this.assignmentModel.find({ course: course._id, certifiedAt: null }).populate('user', 'fullName email isActive').lean();
      for (const a of assignments) {
        const u = a.user as any;
        if (!u?.isActive) continue;
        const [done, last] = await Promise.all([
          this.progressModel.countDocuments({ course: course._id, user: u._id, completed: true }),
          this.progressModel.findOne({ course: course._id, user: u._id }).sort({ lastBeatAt: -1 }).select('lastBeatAt').lean(),
        ]);
        if (done === total) continue; // listening is done; results emails take over
        const id = String(a._id);
        const candidates: [string, string, Record<string, unknown>][] = [];
        if (a.dueDate) {
          const left = dayDiff(a.dueDate, today);
          if (left < 0) candidates.push(['overdue', `rem:overdue:${id}:${a.dueDate}`, {}]);
          else if (left <= 1) candidates.push(['due-soon', `rem:due1:${id}:${a.dueDate}`, { days: 1 }]);
          else if (left <= 7) candidates.push(['due-soon', `rem:due7:${id}:${a.dueDate}`, { days: 7 }]);
        }
        const assignedAt = new Date((a as any).createdAt);
        if (!last && now.getTime() - assignedAt.getTime() >= 3 * DAY_MS) candidates.push(['not-started', `rem:start:${id}`, {}]);
        if (last?.lastBeatAt && now.getTime() - new Date(last.lastBeatAt).getTime() >= 7 * DAY_MS) {
          candidates.push(['idle', `rem:idle:${id}:${new Date(last.lastBeatAt).toISOString().slice(0, 10)}`, {}]);
        }
        // At most one reminder per person per run: the most pressing first.
        for (const [variant, dedupeKey, extra] of candidates) {
          const r = await this.email.queue('training.reminder', { email: u.email, name: u.fullName, userId: u._id }, {
            variant, courseTitle: course.title, dueDate: a.dueDate, done, total, url: this.email.link(portalPath(course.audience === 'parent' ? UserRole.PARENT : UserRole.MURABBI)),
            role: course.audience === 'parent' ? 'parent' : 'murabbi', ...extra,
          }, { dedupeKey });
          if (r === 'queued') { sent++; break; }
          if (r === 'skipped') break;
        }
      }
    }
    return sent;
  }

  // ══ Certification ══════════════════════════════════════════════════════════

  /**
   * Issues the tier certificate (and with it the badge) once everything is
   * done: every lesson heard, assessment passed, reflection approved, and
   * — if required — a practical score of at least a conditional pass.
   */
  private async checkCertification(course: Course & { _id: any }, userId: string, actorId?: string) {
    const uid = new Types.ObjectId(userId);
    if (this.isCustom(course.key)) return null;
    const [lessonCount, completed, passed, reflection, practical, assignment] = await Promise.all([
      this.lessonModel.countDocuments({ course: course._id }),
      this.progressModel.countDocuments({ course: course._id, user: uid, completed: true }),
      this.attemptModel.exists({ course: course._id, user: uid, passed: true }),
      this.reflectionModel.findOne({ course: course._id, user: uid }).select('status').lean(),
      this.practicalModel.findOne({ course: course._id, user: uid }).select('total').lean(),
      this.assignmentModel.findOne({ course: course._id, user: uid }).select('certificateNumber certifiedAt').lean(),
    ]);
    if (!assignment || !lessonCount || completed < lessonCount) return null;
    if (course.questions.length && !passed) return null;
    if (course.reflectionPrompt?.trim() && reflection?.status !== 'approved') return null;
    if (course.requirePractical && (!practical || practicalBand(practical.total) === 'practice')) return null;

    // Tier trainings issue the tier certificate; any other training gets its own number.
    const cert = course.tier
      ? await this.training.issueCertificateIfNeeded(userId, course.tier)
      : { certificateNumber: assignment.certificateNumber ?? `NCT-${new Date().getFullYear()}-${userId.slice(-4).toUpperCase()}${String(course._id).slice(-4).toUpperCase()}`, issuedAt: assignment.certifiedAt ?? new Date() };
    const res = await this.assignmentModel.updateOne(
      { course: course._id, user: uid, certifiedAt: null },
      { $set: { certifiedAt: new Date(), ...(!course.tier && { certificateNumber: cert.certificateNumber }) } },
    );
    if (res.modifiedCount) {
      this.notify(userId, actorId, course.tier ? `MashaAllah! You are a ${course.badge}` : `MashaAllah! You've completed the ${course.title}`,
        `Your certificate (${cert.certificateNumber}) is ready to download${course.badge ? `, and the ${course.badge} badge is now on your profile` : ''}.`,
        { courseKey: course.key, certificateNumber: cert.certificateNumber });
      void this.emailMurabbi(userId, 'training.certified', { badge: course.badge, courseTitle: course.title, number: cert.certificateNumber, attached: !!course.tier }, {
        dedupeKey: `certified:${String(course._id)}:${userId}`,
        ...(course.tier && { attachment: { type: 'certificate', userId, tier: course.tier } }),
      });
    }
    return { number: cert.certificateNumber, issuedAt: cert.issuedAt };
  }

  /** Badges for a set of murabbis (admin lists, profiles). */
  async badges(userIds?: Types.ObjectId[]) {
    const courses = await this.courseModel.find({ audience: { $ne: 'parent' } }).select('key tier badge title').lean();
    const certs = await this.training.certificatesFor(userIds, undefined);
    return certs.flatMap((c) => courses.filter((k) => k.tier === c.tier).map((k) => ({
      user: c.user.toString(), badge: k.badge, courseKey: k.key, certificateNumber: c.certificateNumber, issuedAt: c.issuedAt,
    })));
  }

  // ══ Murabbi: course, lessons, listening ════════════════════════════════════

  async myCourses(userId: string) {
    const assignments = await this.assignmentModel.find({ user: new Types.ObjectId(userId) })
      .populate('course', 'key title titleUr tier badge summary summaryUr category audience').sort({ createdAt: 1 }).lean();
    return Promise.all(assignments.filter((a) => a.course).map(async (a) => {
      const course = a.course as any;
      const [total, done] = await Promise.all([
        this.lessonModel.countDocuments({ course: course._id }),
        this.progressModel.countDocuments({ course: course._id, user: new Types.ObjectId(userId), completed: true }),
      ]);
      return {
        key: course.key, title: course.title, titleUr: course.titleUr, badge: course.badge, summary: course.summary, summaryUr: course.summaryUr,
        category: course.category, audience: course.audience, custom: this.isCustom(course.key),
        dueDate: a.dueDate, certifiedAt: a.certifiedAt, certificateNumber: a.certificateNumber, assignedAt: (a as any).createdAt,
        lessonsCompleted: done, lessonsTotal: total,
      };
    }));
  }

  /**
   * What finishing a training means for this person, step by step: every
   * lesson heard, the assessment passed, the reflection shared (and
   * approved), the practical, and the certificate.
   */
  async steps(courseOrKey: string | (Course & { _id: any }), userId: string): Promise<TrainingStep[]> {
    const course = typeof courseOrKey === 'string' ? await this.course(courseOrKey) : courseOrKey;
    const custom = this.stepProviders.get(course.key);
    if (custom) return custom(userId);
    const uid = new Types.ObjectId(userId);
    const [total, done, passed, reflection, practical, assignment] = await Promise.all([
      this.lessonModel.countDocuments({ course: course._id }),
      this.progressModel.countDocuments({ course: course._id, user: uid, completed: true }),
      this.attemptModel.exists({ course: course._id, user: uid, passed: true }),
      this.reflectionModel.findOne({ course: course._id, user: uid }).select('status').lean(),
      this.practicalModel.findOne({ course: course._id, user: uid }).select('total').lean(),
      this.assignmentModel.findOne({ course: course._id, user: uid }).select('certifiedAt').lean(),
    ]);
    const steps: TrainingStep[] = [{ label: 'Listen to every lesson', done: !!total && done >= total, detail: `${done} of ${total}` }];
    if (course.questions.length) steps.push({ label: 'Pass the assessment', done: !!passed });
    if (course.reflectionPrompt?.trim()) {
      steps.push({
        label: 'Share your reflection', done: reflection?.status === 'approved',
        detail: !reflection ? 'not shared yet' : reflection.status === 'approved' ? 'approved' : reflection.status === 'revision' ? 'asked to revise' : 'waiting for review',
      });
    }
    if (course.requirePractical) steps.push({ label: 'Practical assessment', done: !!practical && practicalBand(practical.total) !== 'practice' });
    steps.push({ label: 'Certified', done: !!assignment?.certifiedAt });
    return steps;
  }

  /** Everything the murabbi's course page needs (no answers, no trainer notes). */
  async myCourse(key: string, user: Requester) {
    const course = await this.course(key);
    const assignment = user.role === UserRole.ADMIN ? null : await this.requireAssignment(course._id, user.id);
    const [sections, lessons, progress, attempts, reflection, practical, points, certs, failures, flips] = await Promise.all([
      this.sectionModel.find({ course: course._id }).sort({ order: 1 }).lean(),
      this.lessons(course._id),
      this.progressByLesson(course._id, user.id),
      this.attemptModel.find({ course: course._id, user: new Types.ObjectId(user.id) }).select('scorePercent passed createdAt').sort({ createdAt: -1 }).lean(),
      this.reflectionModel.findOne({ course: course._id, user: new Types.ObjectId(user.id) }).select('text status feedback submittedAt reviewedAt').lean(),
      this.practicalModel.findOne({ course: course._id, user: new Types.ObjectId(user.id) }).select('scores total notes').lean(),
      this.pointsTotal(user.id),
      course.tier ? this.training.certificatesFor([new Types.ObjectId(user.id)], course.tier) : Promise.resolve([] as any[]),
      this.recentFailures(course._id, user.id),
      this.flipModel.find({ course: course._id, user: new Types.ObjectId(user.id) }).select('chart seconds studiedAt').lean(),
    ]);
    const open = this.unlocked(course, lessons, progress);
    const lessonByCode = new Map(lessons.map((l) => [l.code, l]));
    const completed = lessons.filter((l) => progress.get(l._id.toString())?.completed).length;
    const totalSec = lessons.reduce((s, l) => s + l.durationSec, 0);
    const heardSec = [...progress.values()].reduce((s, p) => s + (p.heardSec ?? 0), 0);
    const allHeard = completed === lessons.length;
    const passed = attempts.some((a) => a.passed);
    const next = lessons.find((l) => open.has(l._id.toString()) && !progress.get(l._id.toString())?.completed);

    return {
      course: {
        key: course.key, title: course.title, titleUr: course.titleUr, trainer: course.trainer, badge: course.badge,
        completionThreshold: course.completionThreshold, sequential: course.sequential, passingScore: course.passingScore,
        requirePractical: course.requirePractical, points: course.points, audience: course.audience,
        summary: course.summary, summaryUr: course.summaryUr,
        hasAssessment: course.questions.length > 0, hasReflection: !!course.reflectionPrompt?.trim(),
      },
      assignment: assignment && { dueDate: assignment.dueDate, note: assignment.note, certifiedAt: assignment.certifiedAt },
      progress: {
        lessonsCompleted: completed, lessonsTotal: lessons.length,
        percentHeard: totalSec ? Math.round((heardSec / totalSec) * 100) : 0,
        totalMinutes: Math.round(totalSec / 60),
        listenMinutes: Math.round([...progress.values()].reduce((s, p) => s + (p.listenSec ?? 0), 0) / 60),
        nextLessonId: next?._id ?? null,
      },
      points,
      sections: sections.map((s) => {
        const ls = lessons.filter((l) => l.section.toString() === s._id.toString());
        return {
          _id: s._id, title: s.title, titleUr: s.titleUr, meta: s.meta,
          completed: ls.filter((l) => progress.get(l._id.toString())?.completed).length, total: ls.length,
          lessons: ls.map((l) => {
            const p = progress.get(l._id.toString());
            return {
              _id: l._id, code: l.code, order: l.order, title: l.title, topic: l.topic, durationSec: l.durationSec,
              hasAudio: !!l.audio?.fileId, locked: !open.has(l._id.toString()),
              percent: p?.percent ?? 0, completed: !!p?.completed, lastPosition: p?.lastPosition ?? 0,
            };
          }),
        };
      }),
      assessment: {
        unlocked: allHeard, questionCount: course.questions.length, passed,
        best: attempts.reduce((m, a) => Math.max(m, a.scorePercent), 0) || null,
        attempts: attempts.length,
        attemptsLeftToday: passed ? null : Math.max(0, course.maxFailedAttemptsPerDay - failures.length),
        retryAt: !passed && failures.length >= course.maxFailedAttemptsPerDay ? new Date(failures[0].createdAt.getTime() + DAY_MS) : null,
      },
      reflection: {
        unlocked: allHeard, prompt: course.reflectionPrompt, minChars: course.reflectionMinChars,
        ...(reflection && { text: reflection.text, status: reflection.status, feedback: reflection.feedback, submittedAt: reflection.submittedAt }),
      },
      practical: practical && { scores: practical.scores, total: practical.total, band: practicalBand(practical.total), notes: practical.notes, criteria: PRACTICAL_CRITERIA },
      certificate: course.tier
        ? (certs[0] ? { number: certs[0].certificateNumber, issuedAt: certs[0].issuedAt, tier: course.tier } : null)
        : (assignment?.certificateNumber ? { number: assignment.certificateNumber, issuedAt: assignment.certifiedAt, tier: null } : null),
      // A chart opens with the first lesson that explains it.
      flipCharts: (course.flipCharts ?? []).map((c) => {
        const linked = c.lessonCodes.map((code) => lessonByCode.get(code)).filter((l) => !!l);
        const v = flips.find((f) => f.chart === c.key);
        return {
          key: c.key, number: c.number, module: c.module, title: c.title, subtitle: c.subtitle, when: c.when, live: c.live,
          lessons: linked.map((l) => ({ _id: l._id, code: l.code, title: l.title, durationSec: l.durationSec })),
          locked: !linked.some((l) => open.has(l._id.toString())),
          studied: !!v?.studiedAt, seconds: Math.round(v?.seconds ?? 0),
        };
      }),
    };
  }

  private async lessonFor(lessonId: string, user: Requester) {
    const lesson = await this.lessonModel.findById(lessonId).lean();
    if (!lesson) throw new NotFoundException('Lesson not found.');
    const course = await this.courseModel.findById(lesson.course).lean();
    if (!course) throw new NotFoundException('Course not found.');
    if (user.role !== UserRole.ADMIN) {
      const assignment = await this.requireAssignment(course._id, user.id);
      if (course.audience === 'parent') {
        const section = await this.sectionModel.findById(lesson.section).select('unlockDay').lean();
        if (!section || !sectionOpen(section, assignment as any)) throw new ForbiddenException('This module hasn’t opened yet.');
      }
      if (course.sequential && lesson.order > 1) {
        const prev = await this.lessonModel.findOne({ course: course._id, order: lesson.order - 1 }).select('_id').lean();
        const done = prev && await this.progressModel.exists({ lesson: prev._id, user: new Types.ObjectId(user.id), completed: true });
        if (!done) throw new ForbiddenException('Finish the previous lesson first.');
      }
    }
    return { lesson, course };
  }

  /** Lesson transcript, where to resume, and a short-lived link to the audio. */
  async play(lessonId: string, user: Requester, apiBase: string) {
    const { lesson } = await this.lessonFor(lessonId, user);
    if (!lesson.audio?.fileId) throw new BadRequestException('The audio for this lesson hasn’t been uploaded yet.');
    const p = await this.progressModel.findOne({ lesson: lesson._id, user: new Types.ObjectId(user.id) }).select('percent completed lastPosition heard').lean();
    const { token, expiresAt } = this.audio.issueToken(lesson._id.toString(), user.id);
    return {
      lesson: { _id: lesson._id, code: lesson.code, title: lesson.title, topic: lesson.topic, durationSec: lesson.durationSec, transcript: lesson.transcript },
      progress: { percent: p?.percent ?? 0, completed: !!p?.completed, lastPosition: p?.completed ? 0 : (p?.lastPosition ?? 0), heard: p?.heard ?? [] },
      audioUrl: `${apiBase}/course/lessons/${lesson._id.toString()}/audio?token=${encodeURIComponent(token)}`,
      expiresAt,
    };
  }

  async heartbeat(lessonId: string, user: Requester, dto: HeartbeatDto) {
    const { lesson, course } = await this.lessonFor(lessonId, user);
    const segments = dto.segments.filter((s) => Array.isArray(s) && s.length === 2 && s.every(Number.isFinite)).map((s) => [s[0], s[1]] as Range);
    const uid = new Types.ObjectId(user.id);
    const prev = await this.progressModel.findOne({ lesson: lesson._id, user: uid }).lean();
    const now = new Date();
    const elapsed = prev?.lastBeatAt ? (now.getTime() - new Date(prev.lastBeatAt).getTime()) / 1000 : null;
    const r = applyBeat((prev?.heard ?? []) as Range[], segments, lesson.durationSec, elapsed);
    const percent = Math.min(100, Math.round((r.heardSec / lesson.durationSec) * 100));
    const nowCompleted = r.heardSec / lesson.durationSec >= course.completionThreshold;
    const justCompleted = nowCompleted && !prev?.completed;

    await this.progressModel.updateOne(
      { lesson: lesson._id, user: uid },
      {
        $set: {
          course: course._id, heard: r.heard, heardSec: r.heardSec, percent,
          lastPosition: Math.min(dto.position, lesson.durationSec), lastBeatAt: now,
          ...(justCompleted && { completed: true, completedAt: now }),
        },
        $inc: { listenSec: r.playedSec },
      },
      { upsert: true },
    );

    let sectionDone = false;
    if (justCompleted && user.role !== UserRole.ADMIN) {
      await this.award(user.id, 'lesson', lesson._id.toString(), course.points?.lesson ?? 10, `Heard ${lesson.code}`);
      const sectionLessons = await this.lessonModel.find({ section: lesson.section }).select('_id').lean();
      const doneInSection = await this.progressModel.countDocuments({ user: uid, completed: true, lesson: { $in: sectionLessons.map((l) => l._id) } });
      if (doneInSection === sectionLessons.length) {
        sectionDone = true;
        await this.award(user.id, 'section', lesson.section.toString(), course.points?.section ?? 25, 'Completed a module');
      }
      const [total, done] = await Promise.all([
        this.lessonModel.countDocuments({ course: course._id }),
        this.progressModel.countDocuments({ course: course._id, user: uid, completed: true }),
      ]);
      if (done === total && !this.isCustom(course.key)) {
        void this.emailMurabbi(user.id, 'training.lessons-done', {
          courseTitle: course.title, total, questions: course.questions.length, passingScore: course.passingScore,
        }, { dedupeKey: `lessons-done:${String(course._id)}:${user.id}` });
        await this.checkCertification(course, user.id);
      }
    }
    return { percent, completed: nowCompleted, justCompleted, sectionCompleted: sectionDone };
  }

  /** Streams lesson audio for a valid short-lived link, honouring Range requests. */
  async audioFor(lessonId: string, token: string, rangeHeader?: string) {
    if (!/^[a-f\d]{24}$/i.test(lessonId) || !this.audio.verifyToken(lessonId, token)) {
      throw new ForbiddenException('This audio link has expired. Reopen the lesson.');
    }
    const lesson = await this.lessonModel.findById(lessonId).select('audio').lean();
    if (!lesson?.audio?.fileId) throw new NotFoundException('Audio not found.');
    const head = await this.audio.open(lesson.audio.fileId);
    head.stream.destroy();
    const size = head.size;
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      let end = m[1] && m[2] ? Number(m[2]) : size - 1;
      end = Math.min(end, size - 1);
      if (start > end || start >= size) throw new HttpException('Range not satisfiable', HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
      start = Math.max(0, start);
      const { stream } = await this.audio.open(lesson.audio.fileId, { start, end });
      return { stream, size, start, end, partial: true };
    }
    const { stream } = await this.audio.open(lesson.audio.fileId);
    return { stream, size, start: 0, end: size - 1, partial: false };
  }

  // ══ Murabbi: flip charts ═══════════════════════════════════════════════════

  /** Time a flip chart was on screen. It counts as studied after FLIP_CHART_STUDIED_SEC in total. */
  async viewFlipChart(key: string, chartKey: string, user: Requester, dto: FlipChartViewDto) {
    const course = await this.course(key);
    const chart = (course.flipCharts ?? []).find((c) => c.key === chartKey);
    if (!chart) throw new NotFoundException('Flip chart not found.');
    if (user.role === UserRole.ADMIN) return { studied: false, seconds: 0 }; // admins previewing aren't tracked
    await this.requireAssignment(course._id, user.id);

    const uid = new Types.ObjectId(user.id);
    const now = new Date();
    const prev = await this.flipModel.findOne({ course: course._id, user: uid, chart: chart.key }).select('seconds lastViewedAt studiedAt').lean();
    // Credit no more time than has passed since the last report (plus slack), like lesson listening.
    const since = prev?.lastViewedAt ? (now.getTime() - new Date(prev.lastViewedAt).getTime()) / 1000 : null;
    const seconds = Math.min(dto.seconds, since == null ? 60 : since + 5, 120);
    const total = (prev?.seconds ?? 0) + seconds;
    const studiedNow = !prev?.studiedAt && total >= FLIP_CHART_STUDIED_SEC;
    await this.flipModel.updateOne(
      { course: course._id, user: uid, chart: chart.key },
      {
        $inc: { seconds, opens: since == null || since > 600 ? 1 : 0 },
        $set: { lastViewedAt: now, ...(studiedNow && { studiedAt: now }) },
      },
      { upsert: true },
    );
    return { studied: !!prev?.studiedAt || studiedNow, seconds: Math.round(total), justStudied: studiedNow };
  }

  // ══ Murabbi: assessment and reflection ═════════════════════════════════════

  private async requireAllHeard(course: Course & { _id: any }, userId: string) {
    const [total, done] = await Promise.all([
      this.lessonModel.countDocuments({ course: course._id }),
      this.progressModel.countDocuments({ course: course._id, user: new Types.ObjectId(userId), completed: true }),
    ]);
    if (done < total) throw new ForbiddenException(`Listen to every lesson first (${done} of ${total} done).`);
  }

  async assessment(key: string, user: Requester) {
    const course = await this.course(key);
    if (user.role !== UserRole.ADMIN) {
      await this.requireAssignment(course._id, user.id);
      await this.requireAllHeard(course, user.id);
    }
    if (!course.questions.length) throw new BadRequestException('The assessment questions haven’t been set up yet.');
    return {
      passingScore: course.passingScore,
      questions: course.questions.map((q, i) => ({ index: i, question: q.question, options: q.options, module: q.module })),
    };
  }

  async submitAssessment(key: string, user: Requester, dto: SubmitAnswersDto) {
    const course = await this.course(key);
    await this.requireAssignment(course._id, user.id);
    await this.requireAllHeard(course, user.id);
    if (!course.questions.length) throw new BadRequestException('The assessment questions haven’t been set up yet.');
    if (dto.answers.length !== course.questions.length) {
      throw new BadRequestException(`Answer all ${course.questions.length} questions.`);
    }
    const uid = new Types.ObjectId(user.id);
    const alreadyPassed = await this.attemptModel.exists({ course: course._id, user: uid, passed: true });
    const failures = await this.recentFailures(course._id, user.id);
    if (!alreadyPassed && failures.length >= course.maxFailedAttemptsPerDay) {
      const retry = new Date(failures[0].createdAt.getTime() + DAY_MS);
      throw new HttpException(
        `You've used today's ${course.maxFailedAttemptsPerDay} attempts. Listen again to the lessons you were unsure about, then try after ${retry.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const correct = course.questions.filter((q, i) => dto.answers[i] === q.correctIndex).length;
    const scorePercent = Math.round((correct / course.questions.length) * 100);
    const passed = scorePercent >= course.passingScore;
    await this.attemptModel.create({ course: course._id, user: uid, answers: dto.answers, correct, total: course.questions.length, scorePercent, passed });

    let certificate = null;
    if (passed) {
      await this.award(user.id, 'assessment', course._id.toString(), course.points?.assessment ?? 100, `Passed the ${course.title} assessment`);
      certificate = await this.checkCertification(course, user.id);
    }
    if (!alreadyPassed) {
      const left = passed ? null : Math.max(0, course.maxFailedAttemptsPerDay - failures.length - 1);
      const retry = !passed && !left ? new Date((failures[0]?.createdAt ?? new Date()).getTime() + DAY_MS) : null;
      void this.emailMurabbi(user.id, 'training.assessment', {
        passed, score: scorePercent, passingScore: course.passingScore, certified: !!certificate, attemptsLeft: left,
        retryAt: retry?.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }),
      });
    }
    return {
      scorePercent, passed, correct, total: course.questions.length, passingScore: course.passingScore, certificate,
      attemptsLeftToday: passed || alreadyPassed ? null : Math.max(0, course.maxFailedAttemptsPerDay - failures.length - 1),
      // Answers are only explained after passing, so the quiz can't be learned by guessing.
      review: passed ? course.questions.map((q, i) => ({ yourAnswer: dto.answers[i], correctIndex: q.correctIndex, explanation: q.explanation })) : null,
    };
  }

  async submitReflection(key: string, user: Requester, dto: ReflectionDto) {
    const course = await this.course(key);
    if (!course.reflectionPrompt?.trim()) throw new BadRequestException('This training has no reflection.');
    await this.requireAssignment(course._id, user.id);
    await this.requireAllHeard(course, user.id);
    const text = dto.text.trim();
    if (text.length < course.reflectionMinChars) {
      throw new BadRequestException(`Please write a little more: at least ${course.reflectionMinChars} characters (you have ${text.length}).`);
    }
    const uid = new Types.ObjectId(user.id);
    const existing = await this.reflectionModel.findOne({ course: course._id, user: uid }).select('status').lean();
    if (existing?.status === 'approved') throw new BadRequestException('Your reflection has already been approved.');
    await this.reflectionModel.updateOne(
      { course: course._id, user: uid },
      { $set: { text, status: 'submitted', submittedAt: new Date(), feedback: '' } },
      { upsert: true },
    );
    const admins = await this.userModel.find({ role: UserRole.ADMIN, isActive: true }).select('_id').lean();
    const me = await this.userModel.findById(uid).select('fullName').lean();
    for (const a of admins) {
      this.notify(a._id.toString(), user.id, 'Training reflection to review',
        `${me?.fullName ?? 'Someone'} submitted their ${course.title} reflection.`, { courseKey: course.key });
    }
    return { message: 'Reflection submitted. An admin will review it.' };
  }
}
