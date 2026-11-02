import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import {
  Course, CourseAssignment, CourseAssignmentDocument, CourseDocument, CourseLesson, CourseLessonDocument, CourseReflection,
  CourseReflectionDocument, LessonProgress, LessonProgressDocument, MurabbiPoint, MurabbiPointDocument,
} from '../course/course.schema';
import { ASAAS_KEY } from '../course/course.service';
import { JournalEntry, JournalEntryDocument, JournalMoment, JournalMomentDocument } from './journal.schema';
import { JOURNAL_PAGES, JOURNAL_POINTS, JournalPage, MOMENTS_LESSON } from './journal.pages';
import { AddMomentDto } from './journal.dto';

const MAX_ANSWER = 3000;
const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** A page is done once every writing box on it has something in it. */
function isDone(page: JournalPage, answers: Record<string, string>) {
  return page.fields.every((f) => !!answers[f.key]?.trim());
}

/**
 * The Noor Journal. Pages follow the Asaas training's writing activities and
 * open once their lesson has been heard. Everything written is private to the
 * murabbi; admins see only how far each murabbi has got (except the final
 * reflection, which the team reviews as before).
 */
@Injectable()
export class JournalService {
  constructor(
    @InjectModel(JournalEntry.name)     private readonly entryModel:      Model<JournalEntryDocument>,
    @InjectModel(JournalMoment.name)    private readonly momentModel:     Model<JournalMomentDocument>,
    @InjectModel(Course.name)           private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseLesson.name)     private readonly lessonModel:     Model<CourseLessonDocument>,
    @InjectModel(CourseAssignment.name) private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(LessonProgress.name)   private readonly progressModel:   Model<LessonProgressDocument>,
    @InjectModel(CourseReflection.name) private readonly reflectionModel: Model<CourseReflectionDocument>,
    @InjectModel(MurabbiPoint.name)     private readonly pointModel:      Model<MurabbiPointDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    @InjectModel(Circle.name)           private readonly circleModel:     Model<CircleDocument>,
  ) {}

  /** The Asaas course, its lessons by code, and which of them this murabbi has heard. */
  private async lessonState(userId: string) {
    const course = await this.courseModel.findOne({ key: ASAAS_KEY }).select('_id reflectionPrompt reflectionMinChars').lean();
    if (!course) return { course: null, assigned: false, byCode: new Map<string, { _id: Types.ObjectId; title: string }>(), heard: new Set<string>() };
    const uid = new Types.ObjectId(userId);
    const codes = [...JOURNAL_PAGES.map((p) => p.lessonCode), MOMENTS_LESSON];
    const [assigned, lessons, done] = await Promise.all([
      this.assignmentModel.exists({ course: course._id, user: uid }),
      this.lessonModel.find({ course: course._id, code: { $in: codes } }).select('code title').lean(),
      this.progressModel.find({ course: course._id, user: uid, completed: true }).select('lesson').lean(),
    ]);
    const doneIds = new Set(done.map((d) => String(d.lesson)));
    const byCode = new Map(lessons.map((l) => [l.code, { _id: l._id, title: l.title }]));
    const heard = new Set(lessons.filter((l) => doneIds.has(String(l._id))).map((l) => l.code));
    return { course, assigned: !!assigned, byCode, heard };
  }

  async journal(userId: string) {
    const { course, assigned, byCode, heard } = await this.lessonState(userId);
    const uid = new Types.ObjectId(userId);
    const [entries, reflection, moments, user] = await Promise.all([
      this.entryModel.find({ user: uid }).lean(),
      course ? this.reflectionModel.findOne({ course: course._id, user: uid }).select('text status feedback submittedAt').lean() : null,
      this.momentModel.find({ user: uid }).populate('circle', 'name').sort({ date: -1, createdAt: -1 }).limit(500).lean(),
      this.userModel.findById(uid).select('fullName').lean(),
    ]);
    const pages = JOURNAL_PAGES.map((p) => {
      const e = entries.find((x) => x.page === p.key);
      const lesson = byCode.get(p.lessonCode);
      const base = { ...p, lesson: lesson ? { _id: lesson._id, code: p.lessonCode, title: lesson.title } : null, open: heard.has(p.lessonCode) };
      if (p.kind === 'reflection') {
        return {
          ...base, prompt: course?.reflectionPrompt ?? '', minChars: course?.reflectionMinChars ?? 0,
          reflection: reflection ?? null, done: !!reflection, updatedAt: reflection?.submittedAt ?? null,
        };
      }
      return { ...base, answers: e?.answers ?? {}, done: !!e?.done, updatedAt: (e as any)?.updatedAt ?? null };
    });
    return {
      owner: user?.fullName ?? '',
      assigned,
      pages,
      progress: { done: pages.filter((p) => p.done).length, total: pages.length },
      moments: { open: heard.has(MOMENTS_LESSON), lesson: byCode.get(MOMENTS_LESSON) ?? null, list: moments },
    };
  }

  async save(userId: string, pageKey: string, raw: Record<string, unknown>) {
    const page = JOURNAL_PAGES.find((p) => p.key === pageKey);
    if (!page) throw new NotFoundException('Journal page not found.');
    if (page.kind === 'reflection') throw new BadRequestException('The final reflection is sent from the training page.');
    const { heard } = await this.lessonState(userId);
    if (!heard.has(page.lessonCode)) throw new ForbiddenException('Listen to this part of the training first; the page opens after it.');
    const answers: Record<string, string> = {};
    for (const f of page.fields) {
      const v = raw?.[f.key];
      if (typeof v !== 'string' || !v.trim()) continue;
      if (f.kind === 'choice' && !f.options?.some((o) => o.value === v)) throw new BadRequestException(`Choose one of the options for “${f.labelEn}”.`);
      answers[f.key] = v.slice(0, MAX_ANSWER);
    }
    const done = isDone(page, answers);
    const uid = new Types.ObjectId(userId);
    await this.entryModel.updateOne({ user: uid, page: page.key }, { $set: { answers, done } }, { upsert: true });
    let points = 0;
    if (done) {
      // Once per page (the unique index stops a second award).
      points = await this.pointModel.create({ user: uid, points: JOURNAL_POINTS, reason: 'journal', ref: page.key, label: `Noor Journal: ${page.titleEn}` })
        .then(() => JOURNAL_POINTS).catch(() => 0);
    }
    return { message: done ? 'Saved. This page is complete.' : 'Saved.', done, points };
  }

  async addMoment(userId: string, dto: AddMomentDto) {
    const { heard } = await this.lessonState(userId);
    if (!heard.has(MOMENTS_LESSON)) throw new ForbiddenException('Moments of light open with Module 6, lesson M6-02.');
    let circle: Types.ObjectId | null = null;
    if (dto.circleId) {
      const c = await this.circleModel.findOne({ _id: new Types.ObjectId(dto.circleId), murabbi: new Types.ObjectId(userId) }).select('_id').lean();
      if (!c) throw new NotFoundException('That isn’t one of your circles.');
      circle = c._id;
    }
    const date = dto.date ?? pkToday();
    if (date > pkToday()) throw new BadRequestException('A moment can’t be in the future.');
    const moment = await this.momentModel.create({ user: new Types.ObjectId(userId), date, text: dto.text.trim(), circle });
    return { message: 'Moment saved. May Allah keep it as light for you.', moment };
  }

  async deleteMoment(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const r = await this.momentModel.deleteOne({ _id: new Types.ObjectId(id), user: new Types.ObjectId(userId) });
    if (!r.deletedCount) throw new NotFoundException('Moment not found.');
    return { message: 'Moment removed.' };
  }

  /** Admins: how far each murabbi has got. Never the text. */
  async progress() {
    const course = await this.courseModel.findOne({ key: ASAAS_KEY }).select('_id').lean();
    const murabbis = await this.userModel.find({ role: UserRole.MURABBI }).select('fullName email').lean();
    const ids = murabbis.map((m) => m._id);
    const [entries, moments, reflections] = await Promise.all([
      this.entryModel.aggregate([{ $match: { user: { $in: ids }, done: true } }, { $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$updatedAt' } } }]),
      this.momentModel.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$createdAt' } } }]),
      course ? this.reflectionModel.find({ course: course._id, user: { $in: ids } }).select('user').lean() : [],
    ]);
    const by = (rows: any[]) => new Map<string, any>(rows.map((r) => [String(r._id), r]));
    const e = by(entries), m = by(moments);
    const refl = new Set(reflections.map((r) => String(r.user)));
    return murabbis.map((u) => {
      const id = String(u._id);
      const last = [e.get(id)?.last, m.get(id)?.last].filter(Boolean).sort().pop() ?? null;
      return {
        user: { _id: u._id, fullName: u.fullName, email: u.email },
        pagesDone: (e.get(id)?.n ?? 0) + (refl.has(id) ? 1 : 0), totalPages: JOURNAL_PAGES.length,
        moments: m.get(id)?.n ?? 0, lastWrittenAt: last,
      };
    }).sort((a, b) => b.pagesDone - a.pagesDone || a.user.fullName.localeCompare(b.user.fullName));
  }
}
