import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Course, CourseAssignment, CourseAssignmentDocument, CourseDocument, CourseLesson, CourseLessonDocument, CourseSection,
  CourseSectionDocument, FlipChartView, FlipChartViewDocument, LessonProgress, LessonProgressDocument, MurabbiPoint,
  MurabbiPointDocument,
} from '../course/course.schema';
import { CourseService, dayIndex, sectionOpen } from '../course/course.service';
import { User, UserDocument, UserRole } from '../user/user.schema';
import {
  PARENT_QUIZZES, ParentQuizAttempt, ParentQuizAttemptDocument, ParentQuizKey, ParentSelfCheck, ParentSelfCheckDocument,
  ParentTarget, ParentTargetDocument,
} from './parent-course.schema';
import { AssignParentsDto } from './parent-course.dto';
import content from './content/asaas-parents.json';
import quizzes from './content/quizzes.json';
import extras from './content/extras.json';
import flipCharts from './content/flipcharts.json';

export const PARENT_COURSE_KEY = 'asaas-parents';

/** Module checks: 7 of 10 to pass; the final: 14 of 20. One retake each. */
const PASS_MARK: Record<ParentQuizKey, number> = { m1: 7, m2: 7, m3: 7, m4: 7, m5: 7, m6: 7, m7: 7, m8: 7, final: 14 };
const MAX_ATTEMPTS = 2;
const POINTS = { quiz: 50, final: 100, target: 50 };
/** A module's check opens at the start of its second week. */
const QUIZ_AFTER_DAYS = 7;
/** The final check and the closing self-check open once this clip is heard. */
const CLOSING_GATE = 'PC-01';

type Target = (typeof extras.targets)[number];
const QUESTIONS = quizzes as Record<ParentQuizKey, { question: string; questionEn: string; options: string[]; correctIndex: number; explanation: string; sourceLesson: string; module: string }[]>;

const pkDate = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(new Date(d).getTime() + n * 24 * 3600_000);

@Injectable()
export class ParentCourseService implements OnModuleInit {
  private readonly logger = new Logger(ParentCourseService.name);

  constructor(
    @InjectModel(Course.name)            private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseSection.name)     private readonly sectionModel:    Model<CourseSectionDocument>,
    @InjectModel(CourseLesson.name)      private readonly lessonModel:     Model<CourseLessonDocument>,
    @InjectModel(CourseAssignment.name)  private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(LessonProgress.name)    private readonly progressModel:   Model<LessonProgressDocument>,
    @InjectModel(FlipChartView.name)     private readonly flipModel:       Model<FlipChartViewDocument>,
    @InjectModel(MurabbiPoint.name)      private readonly pointModel:      Model<MurabbiPointDocument>,
    @InjectModel(ParentQuizAttempt.name) private readonly attemptModel:    Model<ParentQuizAttemptDocument>,
    @InjectModel(ParentSelfCheck.name)   private readonly selfCheckModel:  Model<ParentSelfCheckDocument>,
    @InjectModel(ParentTarget.name)      private readonly targetModel:     Model<ParentTargetDocument>,
    @InjectModel(User.name)              private readonly userModel:       Model<UserDocument>,
    courses: CourseService,
  ) {
    courses.registerSeeder(PARENT_COURSE_KEY, () => this.seed());
  }

  // ══ Seeding ════════════════════════════════════════════════════════════════

  async onModuleInit() {
    try { await this.seed(); } catch (err) { this.logger.error(`Could not seed Asaas for Parents: ${(err as Error).message}`); }
  }

  /** Creates the course, its ten sections and 52 clips the first time; fills in anything missing later. */
  async seed() {
    const c = content as any;
    let course = await this.courseModel.findOne({ key: PARENT_COURSE_KEY });
    if (!course) {
      try {
        course = await this.courseModel.create({
          key: PARENT_COURSE_KEY, title: c.title, titleUr: c.titleUr, trainer: c.trainer, audience: 'parent', tier: null,
          sequential: false, completionThreshold: 0.9, badge: extras.certificate.badgeEn, flipCharts,
          reflectionPrompt: '', reflectionMinChars: 0,
        });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
        course = await this.courseModel.findOne({ key: PARENT_COURSE_KEY });
      }
    }
    if (!course) return;
    if (!course.flipCharts?.length) await this.courseModel.updateOne({ _id: course._id }, { $set: { flipCharts } });
    let order = 0;
    for (const s of c.sections) {
      const section = await this.sectionModel.findOneAndUpdate(
        { course: course._id, key: s.key },
        { $setOnInsert: { order: s.order, title: s.title, titleUr: s.titleUr, meta: s.meta, unlockDay: s.unlockDay } },
        { upsert: true, new: true },
      );
      const lessons = s.lessons.map((l: any) => ({
        course: course._id, section: section._id, code: l.code, order: ++order, title: l.title, topic: l.section,
        durationSec: l.durationSec, transcript: l.transcript, trainerNotes: l.trainerNotes,
      }));
      await this.lessonModel.insertMany(lessons, { ordered: false }).catch((err) => { if (err?.code !== 11000) throw err; });
    }
  }

  // ══ Helpers ════════════════════════════════════════════════════════════════

  private async course() {
    let c = await this.courseModel.findOne({ key: PARENT_COURSE_KEY }).lean();
    if (!c) { await this.seed(); c = await this.courseModel.findOne({ key: PARENT_COURSE_KEY }).lean(); }
    if (!c) throw new NotFoundException('Asaas for Parents isn’t set up yet.');
    return c;
  }

  private async assignmentFor(courseId: Types.ObjectId, userId: string) {
    const a = await this.assignmentModel.findOne({ course: courseId, user: new Types.ObjectId(userId) }).lean();
    if (!a) throw new ForbiddenException('Asaas for Parents hasn’t been opened for your account yet. Please ask the Noor Circles team.');
    return a as typeof a & { createdAt: Date };
  }

  private async sections(courseId: Types.ObjectId) {
    return this.sectionModel.find({ course: courseId }).sort({ order: 1 }).lean();
  }

  /** When each module's check opens: the start of its second week. */
  private quizOpensOn(section: { unlockDay?: number }, a: { createdAt: Date }) {
    return addDays(a.createdAt, (section.unlockDay ?? 0) + QUIZ_AFTER_DAYS);
  }

  private quizOpen(key: ParentQuizKey, sectionsByKey: Map<string, any>, a: any, closingHeard: boolean, now = new Date()) {
    if (key === 'final') return closingHeard;
    const s = sectionsByKey.get(key);
    if (!s) return false;
    return !!a.allOpen || dayIndex(a.createdAt, now) >= (s.unlockDay ?? 0) + QUIZ_AFTER_DAYS;
  }

  private async award(userId: string, reason: string, ref: string, points: number, label: string) {
    try { await this.pointModel.create({ user: new Types.ObjectId(userId), reason, ref, points, label }); }
    catch (err: any) { if (err?.code !== 11000) throw err; }
  }

  private targetMet(t: Target, row: { ticks: number[]; lighter: boolean } | null) {
    if (!row) return false;
    const need = row.lighter && t.lighterNeeded ? t.lighterNeeded : t.needed;
    return row.ticks.length >= need;
  }

  private async lessonState(courseId: Types.ObjectId, uid: Types.ObjectId) {
    const [lessons, progress] = await Promise.all([
      this.lessonModel.find({ course: courseId }).select('section code order title durationSec audio').sort({ order: 1 }).lean(),
      this.progressModel.find({ course: courseId, user: uid }).select('lesson percent completed lastPosition').lean(),
    ]);
    const byLesson = new Map(progress.map((p) => [p.lesson.toString(), p]));
    return { lessons, byLesson };
  }

  // ══ Certificate ════════════════════════════════════════════════════════════

  /** Every clip heard, the 8 module checks and the final passed, and the closing self-check done. */
  private async checkCertificate(courseId: Types.ObjectId, userId: string) {
    const uid = new Types.ObjectId(userId);
    const [lessonCount, heard, passed, endCheck, a] = await Promise.all([
      this.lessonModel.countDocuments({ course: courseId }),
      this.progressModel.countDocuments({ course: courseId, user: uid, completed: true }),
      this.attemptModel.distinct('quiz', { course: courseId, user: uid, passed: true }),
      this.selfCheckModel.exists({ course: courseId, user: uid, stage: 'end' }),
      this.assignmentModel.findOne({ course: courseId, user: uid }).select('certificateNumber').lean(),
    ]);
    if (!a || a.certificateNumber) return a?.certificateNumber ?? null;
    if (heard < lessonCount || passed.length < PARENT_QUIZZES.length || !endCheck) return null;
    const number = `NCP-${new Date().getFullYear()}-${userId.slice(-6).toUpperCase()}`;
    await this.assignmentModel.updateOne({ course: courseId, user: uid, certificateNumber: null }, { $set: { certificateNumber: number, certifiedAt: new Date() } });
    return number;
  }

  // ══ Parent: the course page ════════════════════════════════════════════════

  async me(userId: string) {
    const course = await this.course();
    const a = await this.assignmentFor(course._id, userId);
    const uid = new Types.ObjectId(userId);
    const now = new Date();
    const day = dayIndex(a.createdAt, now);
    const [sections, { lessons, byLesson }, attempts, selfChecks, targets, flips, user, pointsAgg] = await Promise.all([
      this.sections(course._id),
      this.lessonState(course._id, uid),
      this.attemptModel.find({ course: course._id, user: uid }).select('quiz correct total passed createdAt').sort({ createdAt: 1 }).lean(),
      this.selfCheckModel.find({ course: course._id, user: uid }).select('stage answers createdAt').lean(),
      this.targetModel.find({ course: course._id, user: uid }).lean(),
      this.flipModel.find({ course: course._id, user: uid }).select('chart studiedAt').lean(),
      this.userModel.findById(uid).select('fullName').lean(),
      this.pointModel.aggregate([{ $match: { user: uid } }, { $group: { _id: null, t: { $sum: '$points' } } }]),
    ]);
    const byKey = new Map(sections.map((s) => [s.key, s]));
    const done = (code: string) => {
      const l = lessons.find((x) => x.code === code);
      return !!(l && byLesson.get(l._id.toString())?.completed);
    };
    const closingHeard = done(CLOSING_GATE);
    const lessonIdByCode = new Map(lessons.map((l) => [l.code, l._id.toString()]));
    const openSection = new Map(sections.map((s) => [s._id.toString(), sectionOpen(s, a, now)]));
    const completed = lessons.filter((l) => byLesson.get(l._id.toString())?.completed).length;

    const quizState = (key: ParentQuizKey) => {
      const mine = attempts.filter((x) => x.quiz === key);
      const passed = mine.some((x) => x.passed);
      const s = key === 'final' ? byKey.get('closing') : byKey.get(key);
      return {
        key, questions: QUESTIONS[key].length, passMark: PASS_MARK[key],
        open: this.quizOpen(key, byKey, a, closingHeard, now),
        opensOn: key === 'final' || !s ? null : pkDate(a.allOpen ? now : this.quizOpensOn(s, a)),
        attempts: mine.length, passed,
        best: mine.reduce((m, x) => Math.max(m, x.correct), 0) || null,
        attemptsLeft: passed ? 0 : Math.max(0, MAX_ATTEMPTS - mine.length),
      };
    };

    const startCheck = selfChecks.find((x) => x.stage === 'start');
    const endCheck = selfChecks.find((x) => x.stage === 'end');
    const certificateNumber = a.certificateNumber ?? null;

    return {
      course: { key: course.key, title: course.title, titleUr: course.titleUr, trainer: course.trainer, completionThreshold: course.completionThreshold },
      parent: { name: user?.fullName ?? '' },
      startedOn: pkDate(a.createdAt), day, allOpen: !!a.allOpen,
      privacy: extras.privacy,
      points: pointsAgg[0]?.t ?? 0,
      progress: { lessonsCompleted: completed, lessonsTotal: lessons.length },
      sections: sections.map((s) => {
        const ls = lessons.filter((l) => l.section.toString() === s._id.toString());
        const isOpen = openSection.get(s._id.toString()) ?? false;
        const moduleNo = /^m(\d)$/.exec(s.key)?.[1];
        return {
          _id: s._id, key: s.key, title: s.title, titleUr: s.titleUr, meta: s.meta,
          open: isOpen, opensOn: pkDate(addDays(a.createdAt, s.unlockDay ?? 0)),
          completed: ls.filter((l) => byLesson.get(l._id.toString())?.completed).length, total: ls.length,
          lessons: ls.map((l) => {
            const p = byLesson.get(l._id.toString());
            return {
              _id: l._id, code: l.code, title: l.title, durationSec: l.durationSec, hasAudio: !!l.audio?.fileId,
              locked: !isOpen, percent: p?.percent ?? 0, completed: !!p?.completed,
            };
          }),
          quiz: moduleNo ? quizState(s.key as ParentQuizKey) : null,
          target: moduleNo ? this.targetView(Number(moduleNo), targets, s, a, now) : null,
        };
      }),
      finalQuiz: quizState('final'),
      selfCheck: {
        intro: extras.selfCheck.intro, scale: extras.selfCheck.scale, endNote: extras.selfCheck.endNote,
        items: extras.selfCheck.items.map((i) => i.text),
        start: startCheck ? { answers: startCheck.answers, on: pkDate((startCheck as any).createdAt) } : null,
        end: endCheck ? { answers: endCheck.answers, on: pkDate((endCheck as any).createdAt) } : null,
        endOpen: closingHeard,
      },
      flipCharts: (course.flipCharts ?? []).map((c) => {
        const ids = c.lessonCodes.map((code) => lessonIdByCode.get(code)).filter((x): x is string => !!x);
        const ls = lessons.filter((l) => ids.includes(l._id.toString()));
        return {
          key: c.key, number: c.number, module: c.module, title: c.title, subtitle: c.subtitle, printable: !!(c as any).printable,
          lessons: ls.map((l) => ({ _id: l._id, code: l.code, title: l.title, durationSec: l.durationSec })),
          locked: !ls.some((l) => openSection.get(l.section.toString())),
          studied: flips.some((f) => f.chart === c.key && f.studiedAt),
        };
      }),
      pledge: closingHeard ? extras.pledge : null,
      certificate: {
        number: certificateNumber, issuedOn: a.certifiedAt ? pkDate(a.certifiedAt) : null,
        ...extras.certificate,
        requirements: {
          lessons: completed === lessons.length,
          quizzes: PARENT_QUIZZES.filter((k) => k !== 'final').every((k) => attempts.some((x) => x.quiz === k && x.passed)),
          final: attempts.some((x) => x.quiz === 'final' && x.passed),
          selfCheck: !!endCheck,
        },
      },
    };
  }

  private targetView(module: number, rows: any[], section: any, a: any, now: Date) {
    const t = extras.targets.find((x) => x.module === module)!;
    const row = rows.find((r) => r.module === module) ?? null;
    const daysIn = dayIndex(a.createdAt, now) - (section.unlockDay ?? 0);
    return {
      module, title: t.title, what: t.what, kind: t.kind, slots: t.slots, needed: t.needed, lighterNeeded: t.lighterNeeded,
      lighterText: t.lighter, tickLabel: t.tickLabel, flipChart: t.flipChart,
      ticks: row?.ticks ?? [], lighter: !!row?.lighter, met: this.targetMet(t, row),
      // For daily cards: which day of the fortnight it is (boxes after today can't be ticked yet).
      today: t.kind === 'daily' ? (a.allOpen ? t.slots - 1 : Math.max(-1, Math.min(t.slots - 1, daysIn))) : null,
    };
  }

  // ══ Parent: checks, self-check, targets ════════════════════════════════════

  private async quizGate(userId: string, key: ParentQuizKey) {
    const course = await this.course();
    const a = await this.assignmentFor(course._id, userId);
    const uid = new Types.ObjectId(userId);
    const sections = await this.sections(course._id);
    const byKey = new Map(sections.map((s) => [s.key, s]));
    const gate = await this.lessonModel.findOne({ course: course._id, code: CLOSING_GATE }).select('_id').lean();
    const closingHeard = !!gate && !!(await this.progressModel.exists({ lesson: gate._id, user: uid, completed: true }));
    if (!this.quizOpen(key, byKey, a, closingHeard)) {
      throw new ForbiddenException(key === 'final'
        ? 'The final check opens after you hear the first closing clip.'
        : 'This knowledge check opens at the start of the module’s second week.');
    }
    const mine = await this.attemptModel.find({ course: course._id, user: uid, quiz: key }).select('passed').lean();
    return { course, uid, mine };
  }

  async quiz(userId: string, key: ParentQuizKey) {
    const { mine } = await this.quizGate(userId, key);
    if (mine.some((x) => x.passed)) throw new BadRequestException('You’ve already passed this check.');
    if (mine.length >= MAX_ATTEMPTS) throw new BadRequestException('You’ve used both tries for this check.');
    return {
      key, passMark: PASS_MARK[key], attempt: mine.length + 1, maxAttempts: MAX_ATTEMPTS,
      questions: QUESTIONS[key].map((q, i) => ({ index: i, question: q.question, options: q.options })),
    };
  }

  async submitQuiz(userId: string, key: ParentQuizKey, answers: number[]) {
    const { course, uid, mine } = await this.quizGate(userId, key);
    const qs = QUESTIONS[key];
    if (mine.some((x) => x.passed)) throw new BadRequestException('You’ve already passed this check.');
    if (mine.length >= MAX_ATTEMPTS) throw new BadRequestException('You’ve used both tries for this check.');
    if (answers.length !== qs.length) throw new BadRequestException(`Answer all ${qs.length} questions.`);
    const correct = qs.filter((q, i) => answers[i] === q.correctIndex).length;
    const passed = correct >= PASS_MARK[key];
    await this.attemptModel.create({ course: course._id, user: uid, quiz: key, answers, correct, total: qs.length, passed });
    if (passed) await this.award(userId, 'parent-quiz', `${course._id}:${key}`, key === 'final' ? POINTS.final : POINTS.quiz, `Passed check ${key}`);
    const certificate = passed ? await this.checkCertificate(course._id, userId) : null;
    return {
      correct, total: qs.length, passMark: PASS_MARK[key], passed,
      retakeLeft: !passed && mine.length + 1 < MAX_ATTEMPTS,
      certificate,
      // As the audio promises: every question's right answer is explained after each try.
      review: qs.map((q, i) => ({ yourAnswer: answers[i], correctIndex: q.correctIndex, explanation: q.explanation })),
    };
  }

  async submitSelfCheck(userId: string, stage: 'start' | 'end', answers: number[]) {
    const course = await this.course();
    await this.assignmentFor(course._id, userId);
    const uid = new Types.ObjectId(userId);
    if (answers.length !== extras.selfCheck.items.length) throw new BadRequestException(`Answer all ${extras.selfCheck.items.length} statements.`);
    if (stage === 'end') {
      const gate = await this.lessonModel.findOne({ course: course._id, code: CLOSING_GATE }).select('_id').lean();
      if (!gate || !(await this.progressModel.exists({ lesson: gate._id, user: uid, completed: true }))) {
        throw new ForbiddenException('The closing self-check opens after you hear the first closing clip.');
      }
    }
    try {
      await this.selfCheckModel.create({ course: course._id, user: uid, stage, answers });
    } catch (err: any) {
      if (err?.code === 11000) throw new BadRequestException('You’ve already filled in this self-check.');
      throw err;
    }
    const start = stage === 'end' ? await this.selfCheckModel.findOne({ course: course._id, user: uid, stage: 'start' }).select('answers').lean() : null;
    const certificate = stage === 'end' ? await this.checkCertificate(course._id, userId) : null;
    return { message: 'Self-check saved. JazakAllah khair.', start: start?.answers ?? null, certificate };
  }

  private async targetGate(userId: string, module: number) {
    const t = extras.targets.find((x) => x.module === module);
    if (!t) throw new NotFoundException('Target not found.');
    const course = await this.course();
    const a = await this.assignmentFor(course._id, userId);
    const section = await this.sectionModel.findOne({ course: course._id, key: `m${module}` }).lean();
    if (!section || !sectionOpen(section, a)) throw new ForbiddenException('This module hasn’t opened yet.');
    return { t, course, a, section, uid: new Types.ObjectId(userId) };
  }

  async tick(userId: string, module: number, slot: number, on: boolean) {
    const { t, course, a, section, uid } = await this.targetGate(userId, module);
    if (slot >= t.slots) throw new BadRequestException('That box isn’t on this card.');
    if (t.kind === 'daily' && on && !a.allOpen && slot > dayIndex(a.createdAt) - (section.unlockDay ?? 0)) {
      throw new BadRequestException('That day hasn’t come yet.');
    }
    const row = await this.targetModel.findOneAndUpdate(
      { course: course._id, user: uid, module },
      on ? { $addToSet: { ticks: slot } } : { $pull: { ticks: slot } },
      { upsert: true, new: true },
    ).lean();
    return this.afterTargetChange(userId, course._id, t, row!);
  }

  async setLighter(userId: string, module: number, lighter: boolean) {
    const { t, course, uid } = await this.targetGate(userId, module);
    if (lighter && !t.lighterNeeded) throw new BadRequestException('This target has no lighter version.');
    const row = await this.targetModel.findOneAndUpdate({ course: course._id, user: uid, module }, { $set: { lighter } }, { upsert: true, new: true }).lean();
    return this.afterTargetChange(userId, course._id, t, row!);
  }

  private async afterTargetChange(userId: string, courseId: Types.ObjectId, t: Target, row: { _id: any; ticks: number[]; lighter: boolean; metAt: Date | null }) {
    const met = this.targetMet(t, row);
    if (met && !row.metAt) {
      await this.targetModel.updateOne({ _id: row._id }, { $set: { metAt: new Date() } });
      await this.award(userId, 'parent-target', `${courseId}:${t.module}`, POINTS.target, `Target met: module ${t.module}`);
    }
    return { ticks: [...row.ticks].sort((x, y) => x - y), lighter: row.lighter, met };
  }

  // ══ Admin ══════════════════════════════════════════════════════════════════

  /** Opens the course for parent accounts (all of them, or the ones chosen). Already-enrolled parents are left as they are. */
  async assign(adminId: string, dto: AssignParentsDto) {
    const course = await this.course();
    if (!dto.all && !dto.userIds?.length) throw new BadRequestException('Choose parents, or all parents.');
    const filter: Record<string, unknown> = { role: UserRole.PARENT, isActive: true };
    if (!dto.all) filter._id = { $in: dto.userIds!.map((id) => new Types.ObjectId(id)) };
    const parents = await this.userModel.find(filter).select('_id').lean();
    if (!dto.all && parents.length !== new Set(dto.userIds).size) throw new BadRequestException('Asaas for Parents can only be opened for active parent accounts.');
    let added = 0;
    for (const p of parents) {
      const r = await this.assignmentModel.updateOne(
        { course: course._id, user: p._id },
        { $setOnInsert: { assignedBy: new Types.ObjectId(adminId) } },
        { upsert: true },
      );
      if (r.upsertedCount) added++;
    }
    return { message: added ? `Opened for ${added} parent${added === 1 ? '' : 's'}. Their first fortnight starts today.` : 'Every chosen parent already has it.', added };
  }

  /** Called when a parent account is created: the Welcome opens straight away. */
  async enrol(userId: string, byId: string) {
    const course = await this.course();
    await this.assignmentModel.updateOne(
      { course: course._id, user: new Types.ObjectId(userId) },
      { $setOnInsert: { assignedBy: new Types.ObjectId(byId) } },
      { upsert: true },
    );
  }

  async setAccess(userId: string, allOpen: boolean) {
    const course = await this.course();
    const r = await this.assignmentModel.updateOne({ course: course._id, user: new Types.ObjectId(userId) }, { $set: { allOpen } });
    if (!r.matchedCount) throw new NotFoundException('This parent isn’t enrolled.');
    return { message: allOpen ? 'Every module is now open for this parent.' : 'Modules open fortnight by fortnight again.' };
  }

  async unassign(userId: string) {
    const course = await this.course();
    const r = await this.assignmentModel.deleteOne({ course: course._id, user: new Types.ObjectId(userId) });
    if (!r.deletedCount) throw new NotFoundException('This parent isn’t enrolled.');
    return { message: 'Removed from Asaas for Parents. Their listening and answers are kept.' };
  }

  async progress() {
    const course = await this.course();
    const [assignments, lessonCount, sections] = await Promise.all([
      this.assignmentModel.find({ course: course._id }).populate('user', 'fullName email phone isActive').lean(),
      this.lessonModel.countDocuments({ course: course._id }),
      this.sections(course._id),
    ]);
    const ids = assignments.map((a) => (a.user as any)?._id).filter(Boolean);
    const [heard, passes, checks, targets] = await Promise.all([
      this.progressModel.aggregate([
        { $match: { course: course._id, user: { $in: ids } } },
        { $group: { _id: '$user', done: { $sum: { $cond: ['$completed', 1, 0] } }, last: { $max: '$lastBeatAt' } } },
      ]),
      this.attemptModel.find({ course: course._id, user: { $in: ids }, passed: true }).select('user quiz').lean(),
      this.selfCheckModel.find({ course: course._id, user: { $in: ids } }).select('user stage').lean(),
      this.targetModel.find({ course: course._id, user: { $in: ids }, metAt: { $ne: null } }).select('user module').lean(),
    ]);
    const now = new Date();
    const moduleSections = sections.filter((s) => /^m\d$/.test(s.key));
    const rows = assignments.filter((a) => a.user).map((a: any) => {
      const u = a.user;
      const id = u._id.toString();
      const h = heard.find((x) => x._id.toString() === id);
      const mine = (rows: any[]) => rows.filter((r) => r.user.toString() === id);
      const quizzesPassed = new Set(mine(passes).map((p) => p.quiz));
      const openModules = moduleSections.filter((s) => sectionOpen(s, a, now)).length;
      const status = a.certificateNumber ? 'certified'
        : (h?.done ?? 0) === 0 ? 'not-started'
        : (h?.done ?? 0) === lessonCount ? 'heard-all' : 'in-progress';
      return {
        user: { _id: id, fullName: u.fullName, email: u.email, phone: u.phone, isActive: u.isActive },
        startedOn: pkDate(a.createdAt), day: dayIndex(a.createdAt, now), allOpen: !!a.allOpen,
        currentModule: Math.min(8, openModules), lessonsCompleted: h?.done ?? 0, lessonsTotal: lessonCount, lastActive: h?.last ?? null,
        quizzesPassed: [...quizzesPassed].filter((k) => k !== 'final').length, finalPassed: quizzesPassed.has('final'),
        targetsMet: mine(targets).length,
        selfCheck: { start: mine(checks).some((c) => c.stage === 'start'), end: mine(checks).some((c) => c.stage === 'end') },
        certificate: a.certificateNumber ? { number: a.certificateNumber, issuedOn: a.certifiedAt ? pkDate(a.certifiedAt) : null } : null,
        status,
      };
    }).sort((x, y) => y.lessonsCompleted - x.lessonsCompleted);
    const by = (s: string) => rows.filter((r) => r.status === s).length;
    return {
      course: { key: course.key, title: course.title, titleUr: course.titleUr },
      stats: { enrolled: rows.length, notStarted: by('not-started'), inProgress: by('in-progress'), heardAll: by('heard-all'), certified: by('certified') },
      rows,
    };
  }

  /** One parent: clips, check results, self-check before and after, targets. */
  async detail(userId: string) {
    const course = await this.course();
    const uid = new Types.ObjectId(userId);
    const a = await this.assignmentModel.findOne({ course: course._id, user: uid }).lean();
    if (!a) throw new NotFoundException('This parent isn’t enrolled.');
    const [user, sections, { lessons, byLesson }, attempts, checks, targets] = await Promise.all([
      this.userModel.findById(uid).select('fullName email phone').lean(),
      this.sections(course._id),
      this.lessonState(course._id, uid),
      this.attemptModel.find({ course: course._id, user: uid }).select('quiz correct total passed createdAt').sort({ createdAt: 1 }).lean(),
      this.selfCheckModel.find({ course: course._id, user: uid }).select('stage answers createdAt').lean(),
      this.targetModel.find({ course: course._id, user: uid }).lean(),
    ]);
    return {
      user, startedOn: pkDate((a as any).createdAt), allOpen: !!a.allOpen,
      certificate: a.certificateNumber
        ? { ...extras.certificate, name: user?.fullName ?? '', number: a.certificateNumber, issuedOn: a.certifiedAt ? pkDate(a.certifiedAt) : null }
        : null,
      sections: sections.map((s) => ({
        key: s.key, title: s.title, titleUr: s.titleUr, open: sectionOpen(s, a as any),
        lessons: lessons.filter((l) => l.section.toString() === s._id.toString()).map((l) => {
          const p = byLesson.get(l._id.toString());
          return { code: l.code, title: l.title, percent: p?.percent ?? 0, completed: !!p?.completed };
        }),
      })),
      quizzes: PARENT_QUIZZES.map((k) => ({
        key: k, passMark: PASS_MARK[k], total: QUESTIONS[k].length,
        attempts: attempts.filter((x) => x.quiz === k).map((x) => ({ correct: x.correct, passed: x.passed, on: pkDate((x as any).createdAt) })),
      })),
      selfCheck: {
        items: extras.selfCheck.items.map((i) => ({ text: i.text, en: i.en, module: i.module })),
        scale: extras.selfCheck.scale,
        start: checks.find((c) => c.stage === 'start')?.answers ?? null,
        end: checks.find((c) => c.stage === 'end')?.answers ?? null,
      },
      targets: extras.targets.map((t) => {
        const row = targets.find((r) => r.module === t.module);
        return { module: t.module, title: t.titleEn, needed: t.needed, slots: t.slots, ticks: row?.ticks.length ?? 0, lighter: !!row?.lighter, met: this.targetMet(t, row ?? null) };
      }),
    };
  }
}
