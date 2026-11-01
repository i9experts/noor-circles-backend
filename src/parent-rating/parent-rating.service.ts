import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import {
  CourseAssignment, CourseAssignmentDocument, CourseLesson, CourseLessonDocument, CourseReflection, CourseReflectionDocument,
  CourseSection, CourseSectionDocument, LessonProgress, LessonProgressDocument,
} from '../course/course.schema';
import { sectionOpen } from '../course/course.service';
import { ParentCourseService } from '../parent-course/parent-course.service';
import { currentMonth, monthRange } from '../common/utils/month.util';
import {
  ParentActivity, ParentActivityDocument, ParentRating, ParentRatingComponent, ParentRatingDocument,
} from './parent-rating.schema';

/** Nominal weights (sum 100). Parts with nothing to measure are dropped and the rest rescaled. */
export const PARENT_RATING_WEIGHTS = { attendance: 25, training: 25, targets: 20, reflections: 15, engagement: 15 } as const;
/** Active on this many days in a month counts as full engagement. */
const ACTIVE_DAYS_FOR_FULL = 4;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

@Injectable()
export class ParentRatingService {
  constructor(
    @InjectModel(ParentRating.name)     private readonly ratingModel:     Model<ParentRatingDocument>,
    @InjectModel(ParentActivity.name)   private readonly activityModel:   Model<ParentActivityDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    @InjectModel(Parent.name)           private readonly parentModel:     Model<ParentDocument>,
    @InjectModel(Attendance.name)       private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(CourseAssignment.name) private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(CourseSection.name)    private readonly sectionModel:    Model<CourseSectionDocument>,
    @InjectModel(CourseLesson.name)     private readonly lessonModel:     Model<CourseLessonDocument>,
    @InjectModel(LessonProgress.name)   private readonly progressModel:   Model<LessonProgressDocument>,
    @InjectModel(CourseReflection.name) private readonly reflectionModel: Model<CourseReflectionDocument>,
    private readonly parentCourse: ParentCourseService,
  ) {}

  /** The five parts of one parent's rating for a month (no writes). */
  async computeComponents(userId: string, month: string): Promise<ParentRatingComponent[]> {
    const uid = new Types.ObjectId(userId);
    const { start, end } = monthRange(month);
    const family = await this.parentModel.findOne({ account: uid }).select('students feedback').lean();
    const W = PARENT_RATING_WEIGHTS;

    // 1. Their children's attendance this month
    let present = 0, total = 0;
    if (family?.students?.length) {
      const sessions = await this.attendanceModel.find({ sessionDate: { $gte: start, $lt: end }, 'records.student': { $in: family.students } }).select('records').lean();
      const kids = new Set(family.students.map(String));
      for (const s of sessions) for (const r of s.records) {
        if (!kids.has(String(r.student))) continue;
        total++;
        if (r.status === 'present') present++;
      }
    }
    const attendance: ParentRatingComponent = {
      key: 'attendance', label: 'Child’s attendance', weight: W.attendance,
      score: total ? Math.round((present / total) * 100) : null,
      detail: total ? `${present} of ${total} sessions attended` : 'No sessions this month',
    };

    // 2. Training: lessons heard out of those open to them (certified trainings count in full)
    const assignments = await this.assignmentModel.find({ user: uid }).populate('course', 'title audience').lean();
    let open = 0, heard = 0;
    for (const a of assignments.filter((x) => (x.course as any)?.audience === 'parent')) {
      const courseId = (a.course as any)._id;
      const [sections, lessons, done] = await Promise.all([
        this.sectionModel.find({ course: courseId }).select('unlockDay').lean(),
        this.lessonModel.find({ course: courseId }).select('section').lean(),
        this.progressModel.countDocuments({ course: courseId, user: uid, completed: true }),
      ]);
      const openSections = new Set(sections.filter((s) => sectionOpen(s, a as any)).map((s) => String(s._id)));
      const available = lessons.filter((l) => openSections.has(String(l.section))).length;
      open += available;
      heard += a.certifiedAt ? available : Math.min(done, available);
    }
    const training: ParentRatingComponent = {
      key: 'training', label: 'Training progress', weight: W.training,
      score: open ? Math.round((heard / open) * 100) : null,
      detail: open ? `${heard} of ${open} open lessons heard` : 'No training open yet',
    };

    // 3. Home target cards (Asaas for Parents)
    const parts = await this.parentCourse.ratingParts(userId, start, end);
    const targets: ParentRatingComponent = {
      key: 'targets', label: 'Home target cards', weight: W.targets,
      score: parts?.targets?.score ?? null, detail: parts?.targets?.detail ?? 'No target card this month',
    };

    // 4. Reflections and self-checks shared this month (0 if one is waiting and none was shared)
    const reflections = await this.reflectionModel.countDocuments({ user: uid, submittedAt: { $gte: start, $lt: end } });
    const shared = reflections + (parts?.selfChecksShared ?? 0);
    const due = parts?.selfCheckDue ?? false;
    const reflections_: ParentRatingComponent = {
      key: 'reflections', label: 'Reflections shared', weight: W.reflections,
      score: shared ? 100 : due ? 0 : null,
      detail: shared ? `${shared} shared this month` : due ? 'A self-check or reflection is waiting' : 'Nothing due this month',
    };

    // 5. Engagement: days the family page or portal was opened, and feedback given
    const ms = month.slice(0, 7);
    const days = family ? await this.activityModel.countDocuments({ parent: family._id, date: { $gte: `${ms}-01`, $lte: `${ms}-31` } }) : 0;
    const feedback = (family?.feedback ?? []).filter((f) => { const d = new Date(f.date); return d >= start && d < end; }).length;
    const engagement: ParentRatingComponent = {
      key: 'engagement', label: 'Staying connected', weight: W.engagement,
      score: clamp(((days + feedback) / ACTIVE_DAYS_FOR_FULL) * 100),
      detail: `Active on ${days} day${days === 1 ? '' : 's'}${feedback ? ` · ${feedback} feedback` : ''}`,
    };

    return [attendance, training, targets, reflections_, engagement];
  }

  static autoScore(components: ParentRatingComponent[]) {
    const withData = components.filter((c) => c.score !== null);
    const w = withData.reduce((s, c) => s + c.weight, 0);
    return w ? Math.round(withData.reduce((s, c) => s + (c.score ?? 0) * c.weight, 0) / w) : 0;
  }

  async refresh(userId: string, month: string) {
    const components = await this.computeComponents(userId, month);
    const autoScore = ParentRatingService.autoScore(components);
    const existing = await this.ratingModel.findOne({ user: new Types.ObjectId(userId), month }).select('adjustment').lean();
    return this.ratingModel.findOneAndUpdate(
      { user: new Types.ObjectId(userId), month },
      { $set: { components, autoScore, finalScore: clamp(autoScore + (existing?.adjustment ?? 0)), computedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
  }

  /** Every active parent account for a month, freshly computed, best first. */
  async ratingsForMonth(month: string = currentMonth()) {
    const parents = await this.userModel.find({ role: UserRole.PARENT, isActive: true }).select('fullName email').lean();
    const families = await this.parentModel.find({ account: { $in: parents.map((p) => p._id) } })
      .select('account students').populate({ path: 'students', select: 'fullName circle', populate: { path: 'circle', select: 'name' } }).lean();
    const ratings = await Promise.all(parents.map((p) => this.refresh(String(p._id), month)));
    const byId = new Map(parents.map((p) => [String(p._id), p]));
    return ratings
      .map((r) => {
        const fam = families.find((f) => String(f.account) === String(r.user));
        return {
          ...r, parent: byId.get(String(r.user)), stars: Math.round(r.finalScore / 10) / 2,
          children: (fam?.students ?? []).map((s: any) => ({ fullName: s.fullName, circle: s.circle?.name ?? null })),
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  async adjust(userId: string, month: string, adjustment: number, note: string, adminId: string) {
    if (!Types.ObjectId.isValid(userId) || !(await this.userModel.exists({ _id: userId, role: UserRole.PARENT }))) {
      throw new NotFoundException('Parent account not found.');
    }
    const r = await this.refresh(userId, month);
    const rating = await this.ratingModel.findOneAndUpdate(
      { _id: r._id },
      { $set: { adjustment, adjustmentNote: note, adjustedBy: new Types.ObjectId(adminId), finalScore: clamp(r.autoScore + adjustment) } },
      { new: true },
    ).lean();
    return { message: 'Rating adjusted.', rating };
  }

  async myRating(userId: string, month: string = currentMonth()) {
    const r = await this.refresh(userId, month);
    // The parent sees their own score and its parts, not the admin's note.
    const { adjustmentNote: _note, adjustedBy: _by, ...rest } = r as any;
    return { ...rest, stars: Math.round(r.finalScore / 10) / 2 };
  }
}
