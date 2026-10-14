import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MurabbiRating, MurabbiRatingDocument, RatingComponent } from './engagement.schema';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { Performance, PerformanceDocument } from '../performance/performance.schema';
import {
  TrainingModule, TrainingModuleDocument, TrainingProgress, TrainingProgressDocument,
} from '../training/training.schema';
import { currentMonth, elapsedDays, monthRange } from '../common/utils/month.util';

/** Nominal weights (sum 100). Missing components are dropped and the rest rescaled. */
export const RATING_WEIGHTS = { sessions: 25, attendance: 25, reviews: 20, feedback: 15, training: 15 } as const;

const REVIEW_FIELDS = ['honestyScore', 'gratitudeScore', 'empathyScore', 'identityScore', 'familyScore', 'consistencyScore'] as const;

@Injectable()
export class EngagementService {
  constructor(
    @InjectModel(MurabbiRating.name)    private readonly ratingModel:     Model<MurabbiRatingDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    @InjectModel(Circle.name)           private readonly circleModel:     Model<CircleDocument>,
    @InjectModel(Student.name)          private readonly studentModel:    Model<StudentDocument>,
    @InjectModel(Attendance.name)       private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Parent.name)           private readonly parentModel:     Model<ParentDocument>,
    @InjectModel(Performance.name)      private readonly reviewModel:     Model<PerformanceDocument>,
    @InjectModel(TrainingModule.name)   private readonly moduleModel:     Model<TrainingModuleDocument>,
    @InjectModel(TrainingProgress.name) private readonly progressModel:   Model<TrainingProgressDocument>,
  ) {}

  /** Computes the auto components for one murabbi and month (no writes). */
  async computeComponents(murabbiId: string, month: string): Promise<RatingComponent[]> {
    const mid = new Types.ObjectId(murabbiId);
    const { start, end } = monthRange(month);
    const inMonth = { $gte: start, $lt: end };

    const [user, circles, sessions, reviews, students] = await Promise.all([
      this.userModel.findById(mid).select('tier').lean(),
      this.circleModel.find({ murabbi: mid, isActive: true }).select('_id').lean(),
      this.attendanceModel.find({ submittedBy: mid, sessionDate: inMonth }).select('records').lean(),
      this.reviewModel.find({ murabbi: mid, createdAt: inMonth }).lean(),
      this.studentModel.find({ murabbi: mid }).select('_id').lean(),
    ]);

    // 1. Sessions submitted vs. expected (one per circle per week, prorated for the current month)
    const weeks = Math.max(1, Math.round(elapsedDays(month) / 7));
    const expected = circles.length * weeks;
    const sessions_: RatingComponent = {
      key: 'sessions', label: 'Sessions submitted', weight: RATING_WEIGHTS.sessions,
      score : expected ? Math.min(100, Math.round((sessions.length / expected) * 100)) : null,
      detail: expected ? `${sessions.length} of ${expected} expected (${circles.length} circle${circles.length === 1 ? '' : 's'} × ${weeks} week${weeks === 1 ? '' : 's'})` : 'No active circles',
    };

    // 2. Student attendance in those sessions
    let present = 0, total = 0;
    for (const s of sessions) for (const r of s.records) { total++; if (r.status === 'present') present++; }
    const attendance: RatingComponent = {
      key: 'attendance', label: 'Student attendance', weight: RATING_WEIGHTS.attendance,
      score : total ? Math.round((present / total) * 100) : null,
      detail: total ? `${present} of ${total} present` : 'No attendance recorded this month',
    };

    // 3. Performance reviews (average of the six indicators, else stars)
    let reviewScore: number | null = null;
    if (reviews.length) {
      const perReview = reviews.map((r: any) => {
        const vals = REVIEW_FIELDS.map((f) => Number(r[f]) || 0);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return avg > 0 ? avg : (Number(r.stars) || 0) * 20;
      });
      reviewScore = Math.round(perReview.reduce((a, b) => a + b, 0) / perReview.length);
    }
    const reviews_: RatingComponent = {
      key: 'reviews', label: 'Performance reviews', weight: RATING_WEIGHTS.reviews,
      score : reviewScore,
      detail: reviews.length ? `${reviews.length} review${reviews.length === 1 ? '' : 's'}` : 'No reviews this month',
    };

    // 4. Parent feedback for this murabbi's students, given this month
    const parents = students.length
      ? await this.parentModel.find({ students: { $in: students.map((s) => s._id) } }).select('feedback').lean()
      : [];
    const stars: number[] = [];
    for (const p of parents) for (const f of p.feedback ?? []) {
      const d = new Date(f.date);
      if (d >= start && d < end && f.stars) stars.push(f.stars);
    }
    const feedback: RatingComponent = {
      key: 'feedback', label: 'Parent feedback', weight: RATING_WEIGHTS.feedback,
      score : stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 20) : null,
      detail: stars.length ? `${(stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(1)}★ from ${stars.length} response${stars.length === 1 ? '' : 's'}` : 'No parent feedback this month',
    };

    // 5. Training progress across the modules their tier can see
    const tier = user?.tier ?? 1;
    const modules = await this.moduleModel.find({ minTier: { $lte: tier } }).select('_id').lean();
    let trainingScore: number | null = null;
    let done = 0;
    if (modules.length) {
      const prog = await this.progressModel.find({ user: mid, module: { $in: modules.map((m) => m._id) } }).lean();
      const sum = prog.reduce((s, p) => s + (p.progressPercent ?? 0), 0);
      done = prog.filter((p) => p.completed).length;
      trainingScore = Math.round(sum / modules.length);
    }
    const training: RatingComponent = {
      key: 'training', label: 'Training progress', weight: RATING_WEIGHTS.training,
      score : trainingScore,
      detail: modules.length ? `${done} of ${modules.length} modules complete` : 'No training modules',
    };

    return [sessions_, attendance, reviews_, feedback, training];
  }

  static autoScore(components: RatingComponent[]): number {
    const withData = components.filter((c) => c.score !== null);
    const w = withData.reduce((s, c) => s + c.weight, 0);
    if (!w) return 0;
    return Math.round(withData.reduce((s, c) => s + (c.score as number) * c.weight, 0) / w);
  }

  /** Recompute and store one murabbi's rating, keeping any admin adjustment. */
  async refresh(murabbiId: string, month: string) {
    const components = await this.computeComponents(murabbiId, month);
    const autoScore  = EngagementService.autoScore(components);
    const existing   = await this.ratingModel.findOne({ murabbi: murabbiId, month }).lean();
    const adjustment = existing?.adjustment ?? 0;
    return this.ratingModel.findOneAndUpdate(
      { murabbi: new Types.ObjectId(murabbiId), month },
      { $set: { components, autoScore, finalScore: clamp(autoScore + adjustment), computedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
  }

  /** All active murabbis for a month, freshly computed, best first. */
  async ratingsForMonth(month: string = currentMonth()) {
    const murabbis = await this.userModel
      .find({ role: UserRole.MURABBI, isEmailVerified: true, isActive: true })
      .select('fullName email image tier')
      .lean();
    const ratings = await Promise.all(murabbis.map((m) => this.refresh(m._id.toString(), month)));
    const byId = new Map(murabbis.map((m) => [m._id.toString(), m]));
    return ratings
      .map((r) => ({ ...r, murabbi: byId.get(r.murabbi.toString()), stars: Math.round(r.finalScore / 10) / 2 }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  async adjust(murabbiId: string, month: string, adjustment: number, note: string, adminId: string) {
    const murabbi = await this.userModel.findOne({ _id: murabbiId, role: UserRole.MURABBI }).select('_id').lean();
    if (!murabbi) throw new NotFoundException('Murabbi not found.');
    const r = await this.refresh(murabbiId, month);
    const updated = await this.ratingModel.findOneAndUpdate(
      { _id: r._id },
      { $set: { adjustment, adjustmentNote: note, adjustedBy: new Types.ObjectId(adminId), finalScore: clamp(r.autoScore + adjustment) } },
      { new: true },
    ).lean();
    return { message: 'Rating adjusted.', rating: updated };
  }

  async myRating(murabbiId: string, month: string = currentMonth()) {
    const r = await this.refresh(murabbiId, month);
    return { ...r, stars: Math.round(r.finalScore / 10) / 2 };
  }
}

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }
