import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import {
  Course, CourseAssignment, CourseAssignmentDocument, CourseDocument, CourseLesson, CourseLessonDocument,
  LessonProgress, LessonProgressDocument, MurabbiPoint, MurabbiPointDocument,
} from '../course/course.schema';
import { PARENT_COURSE_KEY } from '../parent-course/parent-course.service';
import {
  ParentJournalEntry, ParentJournalEntryDocument, ParentJournalMoment, ParentJournalMomentDocument,
} from './parent-journal.schema';
import { PARENT_JOURNAL_PAGES, PARENT_JOURNAL_POINTS, PARENT_MOMENTS_LESSON, ParentJournalPage } from './parent-journal.pages';
import { AddParentMomentDto } from './parent-journal.dto';

const MAX_ANSWER = 3000;
const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** A page is written once every required box has something in it. */
function isDone(page: ParentJournalPage, answers: Record<string, string>) {
  return page.fields.filter((f) => !f.optional).every((f) => !!answers[f.key]?.trim());
}

/**
 * The Parent Journal. Pages follow the at-home activities of Asaas for
 * Parents and open once their lesson has been heard. It is private, as the
 * audio promises ("only for you"): parents read and write it; the team sees
 * only how many pages are written.
 */
@Injectable()
export class ParentJournalService {
  constructor(
    @InjectModel(ParentJournalEntry.name)  private readonly entryModel:      Model<ParentJournalEntryDocument>,
    @InjectModel(ParentJournalMoment.name) private readonly momentModel:     Model<ParentJournalMomentDocument>,
    @InjectModel(Course.name)              private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseLesson.name)        private readonly lessonModel:     Model<CourseLessonDocument>,
    @InjectModel(CourseAssignment.name)    private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(LessonProgress.name)      private readonly progressModel:   Model<LessonProgressDocument>,
    @InjectModel(MurabbiPoint.name)        private readonly pointModel:      Model<MurabbiPointDocument>,
    @InjectModel(User.name)                private readonly userModel:       Model<UserDocument>,
  ) {}

  /** The parents' course, the journal's lessons by code, and which of them this parent has heard. */
  private async lessonState(userId: string) {
    const course = await this.courseModel.findOne({ key: PARENT_COURSE_KEY }).select('_id').lean();
    const byCode = new Map<string, { _id: Types.ObjectId; title: string }>();
    if (!course) return { assigned: false, byCode, heard: new Set<string>() };
    const uid = new Types.ObjectId(userId);
    const codes = [...PARENT_JOURNAL_PAGES.map((p) => p.lessonCode), PARENT_MOMENTS_LESSON];
    const [assigned, lessons, done] = await Promise.all([
      this.assignmentModel.exists({ course: course._id, user: uid }),
      this.lessonModel.find({ course: course._id, code: { $in: codes } }).select('code title').lean(),
      this.progressModel.find({ course: course._id, user: uid, completed: true }).select('lesson').lean(),
    ]);
    const doneIds = new Set(done.map((d) => String(d.lesson)));
    for (const l of lessons) byCode.set(l.code, { _id: l._id, title: l.title });
    const heard = new Set(lessons.filter((l) => doneIds.has(String(l._id))).map((l) => l.code));
    return { assigned: !!assigned, byCode, heard };
  }

  async journal(userId: string) {
    const { assigned, byCode, heard } = await this.lessonState(userId);
    const uid = new Types.ObjectId(userId);
    const [entries, moments, user] = await Promise.all([
      this.entryModel.find({ user: uid }).lean(),
      this.momentModel.find({ user: uid }).sort({ date: -1, createdAt: -1 }).limit(500).lean(),
      this.userModel.findById(uid).select('fullName').lean(),
    ]);
    const pages = PARENT_JOURNAL_PAGES.map((p) => {
      const e = entries.find((x) => x.page === p.key);
      const lesson = byCode.get(p.lessonCode);
      return {
        ...p,
        lesson: lesson ? { _id: lesson._id, code: p.lessonCode, title: lesson.title } : null,
        open: heard.has(p.lessonCode),
        answers: e?.answers ?? {},
        done: !!e?.done,
        updatedAt: (e as any)?.updatedAt ?? null,
      };
    });
    return {
      owner: user?.fullName ?? '',
      assigned,
      pages,
      progress: { done: pages.filter((p) => p.done).length, total: pages.length },
      moments: { open: heard.has(PARENT_MOMENTS_LESSON), lesson: byCode.get(PARENT_MOMENTS_LESSON) ?? null, list: moments },
    };
  }

  async save(userId: string, pageKey: string, raw: Record<string, unknown>) {
    const page = PARENT_JOURNAL_PAGES.find((p) => p.key === pageKey);
    if (!page) throw new NotFoundException('Journal page not found.');
    const { heard } = await this.lessonState(userId);
    if (!heard.has(page.lessonCode)) throw new ForbiddenException('Listen to this part of Asaas for Parents first; the page opens after it.');
    const answers: Record<string, string> = {};
    for (const f of page.fields) {
      const v = raw?.[f.key];
      if (typeof v === 'string' && v.trim()) answers[f.key] = v.slice(0, MAX_ANSWER);
    }
    const done = isDone(page, answers);
    const uid = new Types.ObjectId(userId);
    await this.entryModel.updateOne({ user: uid, page: page.key }, { $set: { answers, done } }, { upsert: true });
    let points = 0;
    if (done) {
      // Once per page (the unique index on user + reason + ref stops a second award).
      points = await this.pointModel.create({ user: uid, points: PARENT_JOURNAL_POINTS, reason: 'parent-journal', ref: page.key, label: `Parent Journal: ${page.titleEn}` })
        .then(() => PARENT_JOURNAL_POINTS).catch(() => 0);
    }
    return { message: done ? 'Saved. This page is complete.' : 'Saved.', done, points };
  }

  async addMoment(userId: string, dto: AddParentMomentDto) {
    const { heard } = await this.lessonState(userId);
    if (!heard.has(PARENT_MOMENTS_LESSON)) throw new ForbiddenException('Moments at home open after the welcome lesson PW-02.');
    const date = dto.date ?? pkToday();
    if (date > pkToday()) throw new BadRequestException('A moment can’t be in the future.');
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Write the moment first.');
    const moment = await this.momentModel.create({ user: new Types.ObjectId(userId), date, text });
    return { message: 'Moment saved. May Allah fill your home with light.', moment };
  }

  async deleteMoment(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const r = await this.momentModel.deleteOne({ _id: new Types.ObjectId(id), user: new Types.ObjectId(userId) });
    if (!r.deletedCount) throw new NotFoundException('Moment not found.');
    return { message: 'Moment removed.' };
  }

  // ══ Team (counts only) ═════════════════════════════════════════════════════

  /** Pages written and moments per parent, never the words themselves. */
  async progress() {
    const parents = await this.userModel.find({ role: UserRole.PARENT }).select('fullName email').lean();
    const ids = parents.map((p) => p._id);
    const [entries, moments] = await Promise.all([
      this.entryModel.aggregate([{ $match: { user: { $in: ids }, done: true } }, { $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$updatedAt' } } }]),
      this.momentModel.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$createdAt' } } }]),
    ]);
    const by = (rows: any[]) => new Map<string, any>(rows.map((r) => [String(r._id), r]));
    const e = by(entries), m = by(moments);
    return parents.map((u) => {
      const id = String(u._id);
      const last = [e.get(id)?.last, m.get(id)?.last].filter(Boolean).sort((a, b) => +new Date(a) - +new Date(b)).pop() ?? null;
      return {
        user: { _id: u._id, fullName: u.fullName, email: u.email },
        pagesDone: e.get(id)?.n ?? 0, totalPages: PARENT_JOURNAL_PAGES.length,
        moments: m.get(id)?.n ?? 0, lastWrittenAt: last,
      };
    });
  }
}
