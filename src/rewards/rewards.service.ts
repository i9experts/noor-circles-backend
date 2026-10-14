import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RewardAllocation, RewardAllocationDocument, RewardPool, RewardPoolDocument,
} from './rewards.schema';
import { AddAllocationDto, CreatePoolDto, PayAllocationDto, UpdateAllocationDto, UpdatePoolDto } from './rewards.dto';
import { ContributionService } from '../contribution/contribution.service';
import { EngagementService } from '../engagement/engagement.service';
import { Incentive, IncentiveDocument } from '../incentive/incentive.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';
import { monthRange } from '../common/utils/month.util';

/** Split `budget` proportionally to `weights`, rounding each share down to 10 PKR. */
export function proportional(budget: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total || budget <= 0) return weights.map(() => 0);
  return weights.map((w) => Math.floor(((w / total) * budget) / 10) * 10);
}

@Injectable()
export class RewardsService {
  constructor(
    @InjectModel(RewardPool.name)       private readonly poolModel:      Model<RewardPoolDocument>,
    @InjectModel(RewardAllocation.name) private readonly allocModel:     Model<RewardAllocationDocument>,
    @InjectModel(Incentive.name)        private readonly incentiveModel: Model<IncentiveDocument>,
    @InjectModel(Student.name)          private readonly studentModel:   Model<StudentDocument>,
    @InjectModel(User.name)             private readonly userModel:      Model<UserDocument>,
    private readonly contributions: ContributionService,
    private readonly engagement   : EngagementService,
    private readonly notifService : NotificationService,
  ) {}

  // ══ Budget ═════════════════════════════════════════════════════════════════

  private async computeBudget(month: string, mode: string, value: number) {
    if (mode === 'percent' && value > 100) throw new BadRequestException('A percentage budget must be between 0 and 100.');
    const collected = await this.contributions.collectedInMonth(month);
    const budget = mode === 'fixed' ? value : Math.floor((collected * value) / 100);
    return { collected, budget };
  }

  // ══ Proposal ═══════════════════════════════════════════════════════════════

  /** Top students by points earned in the month (active students only). */
  async studentPoints(month: string, limit: number) {
    const { start, end } = monthRange(month);
    const rows = await this.incentiveModel.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$student', points: { $sum: '$points' } } },
      { $sort: { points: -1 } },
    ]);
    const active = new Set(
      (await this.studentModel.find({ _id: { $in: rows.map((r) => r._id) }, isActive: true }).select('_id').lean())
        .map((s) => s._id.toString()),
    );
    return rows.filter((r) => r.points > 0 && active.has(r._id.toString())).slice(0, limit);
  }

  private async propose(pool: RewardPoolDocument) {
    await this.allocModel.deleteMany({ pool: pool._id, manual: false });
    // Recipients the admin added by hand keep their manual reward and aren't proposed twice.
    const manual = await this.allocModel.find({ pool: pool._id, manual: true, status: { $ne: 'cancelled' } }).select('student murabbi').lean();
    const manualIds = new Set(manual.map((a) => (a.student ?? a.murabbi)?.toString()));
    const studentBudget = Math.floor((pool.budget * pool.studentSharePct) / 100);
    const murabbiBudget = pool.budget - studentBudget;

    const students = (await this.studentPoints(pool.month, pool.maxStudents + manualIds.size))
      .filter((s) => !manualIds.has(s._id.toString()))
      .slice(0, pool.maxStudents);
    const sAmounts = proportional(studentBudget, students.map((s) => s.points));

    const ratings = (await this.engagement.ratingsForMonth(pool.month))
      .filter((r) => r.finalScore >= pool.minMurabbiScore && !manualIds.has((r.murabbi as any)._id.toString()))
      .slice(0, pool.maxMurabbis);
    const mAmounts = proportional(murabbiBudget, ratings.map((r) => r.finalScore));

    const docs = [
      ...students.map((s, i) => ({
        pool: pool._id, month: pool.month, recipientType: 'student', student: s._id,
        basisValue: s.points, rank: i + 1, amount: sAmounts[i],
      })),
      ...ratings.map((r, i) => ({
        pool: pool._id, month: pool.month, recipientType: 'murabbi', murabbi: (r.murabbi as any)._id,
        basisValue: r.finalScore, rank: i + 1, amount: mAmounts[i],
      })),
    ].filter((d) => d.amount > 0);
    if (docs.length) await this.allocModel.insertMany(docs);
  }

  // ══ Pools ══════════════════════════════════════════════════════════════════

  async createPool(dto: CreatePoolDto, adminId: string) {
    if (await this.poolModel.exists({ month: dto.month })) {
      throw new ConflictException(`A reward pool for ${dto.month} already exists.`);
    }
    const { collected, budget } = await this.computeBudget(dto.month, dto.budgetMode, dto.budgetValue);
    const pool = await this.poolModel.create({
      month: dto.month, budgetMode: dto.budgetMode, budgetValue: dto.budgetValue,
      contributionsCollected: collected, budget,
      studentSharePct: dto.studentSharePct ?? 60, maxStudents: dto.maxStudents ?? 10,
      maxMurabbis: dto.maxMurabbis ?? 5, minMurabbiScore: dto.minMurabbiScore ?? 60,
      createdBy: new Types.ObjectId(adminId), notes: dto.notes ?? '',
    });
    await this.propose(pool);
    return { message: 'Reward pool created with proposed rewards.', ...(await this.getPool(dto.month)) };
  }

  async listPools() {
    const pools = await this.poolModel.find().sort({ month: -1 }).lean();
    const allocs = await this.allocModel.find({ pool: { $in: pools.map((p) => p._id) }, status: { $ne: 'cancelled' } })
      .select('pool amount status').lean();
    return pools.map((p) => {
      const mine = allocs.filter((a) => a.pool.toString() === p._id.toString());
      return {
        ...p,
        allocated : mine.reduce((s, a) => s + a.amount, 0),
        paid      : mine.filter((a) => a.status === 'paid').reduce((s, a) => s + a.amount, 0),
        recipients: mine.length,
      };
    });
  }

  private async findPool(month: string) {
    const pool = await this.poolModel.findOne({ month });
    if (!pool) throw new NotFoundException(`No reward pool for ${month}.`);
    return pool;
  }

  async getPool(month: string) {
    const pool = await this.findPool(month);
    const allocations = await this.allocModel.find({ pool: pool._id })
      .populate({ path: 'student', select: 'fullName circle', populate: { path: 'circle', select: 'name' } })
      .populate('murabbi', 'fullName email image')
      .populate('paidBy', 'fullName')
      .sort({ recipientType: 1, rank: 1 })
      .lean();
    const live = allocations.filter((a) => a.status !== 'cancelled');
    const allocated = live.reduce((s, a) => s + a.amount, 0);
    const studentBudget = Math.floor((pool.budget * pool.studentSharePct) / 100);
    return {
      pool: pool.toObject(),
      allocations,
      totals: {
        budget        : pool.budget,
        studentBudget,
        murabbiBudget : pool.budget - studentBudget,
        allocated,
        remaining     : pool.budget - allocated,
        paid          : live.filter((a) => a.status === 'paid').reduce((s, a) => s + a.amount, 0),
        toStudents    : live.filter((a) => a.recipientType === 'student').reduce((s, a) => s + a.amount, 0),
        toMurabbis    : live.filter((a) => a.recipientType === 'murabbi').reduce((s, a) => s + a.amount, 0),
      },
    };
  }

  private assertDraft(pool: RewardPoolDocument) {
    if (pool.status !== 'draft') throw new BadRequestException('This pool is already approved — it can no longer be changed.');
  }

  async updatePool(month: string, dto: UpdatePoolDto) {
    const pool = await this.findPool(month);
    this.assertDraft(pool);
    Object.assign(pool, dto);
    const { collected, budget } = await this.computeBudget(month, pool.budgetMode, pool.budgetValue);
    pool.contributionsCollected = collected;
    pool.budget = budget;
    await pool.save();
    return { message: 'Pool updated.', ...(await this.getPool(month)) };
  }

  async regenerate(month: string) {
    const pool = await this.findPool(month);
    this.assertDraft(pool);
    const { collected, budget } = await this.computeBudget(month, pool.budgetMode, pool.budgetValue);
    pool.contributionsCollected = collected;
    pool.budget = budget;
    await pool.save();
    await this.propose(pool);
    return { message: 'Proposal regenerated from the latest points and ratings.', ...(await this.getPool(month)) };
  }

  async deletePool(month: string) {
    const pool = await this.findPool(month);
    this.assertDraft(pool);
    await this.allocModel.deleteMany({ pool: pool._id });
    await pool.deleteOne();
    return { message: 'Draft pool deleted.' };
  }

  async approve(month: string, adminId: string) {
    const pool = await this.findPool(month);
    this.assertDraft(pool);
    const { totals } = await this.getPool(month);
    if (totals.allocated > pool.budget) {
      throw new BadRequestException(
        `Rewards total PKR ${totals.allocated.toLocaleString('en-PK')}, which exceeds the budget of PKR ${pool.budget.toLocaleString('en-PK')}.`,
      );
    }
    if (totals.allocated === 0) throw new BadRequestException('There are no rewards to approve.');
    await this.allocModel.updateMany({ pool: pool._id, status: 'proposed' }, { $set: { status: 'approved' } });
    pool.status = 'approved';
    pool.approvedBy = new Types.ObjectId(adminId);
    pool.approvedAt = new Date();
    await pool.save();
    return { message: 'Reward pool approved. Mark each reward as paid once given.', ...(await this.getPool(month)) };
  }

  // ══ Allocations ════════════════════════════════════════════════════════════

  async addAllocation(month: string, dto: AddAllocationDto) {
    const pool = await this.findPool(month);
    this.assertDraft(pool);
    const isStudent = dto.recipientType === 'student';
    const exists = isStudent
      ? await this.studentModel.exists({ _id: dto.recipientId })
      : await this.userModel.exists({ _id: dto.recipientId, role: UserRole.MURABBI });
    if (!exists) throw new NotFoundException(isStudent ? 'Student not found.' : 'Murabbi not found.');
    const field = isStudent ? 'student' : 'murabbi';
    const recipient = new Types.ObjectId(dto.recipientId);
    if (await this.allocModel.exists({ pool: pool._id, [field]: recipient, status: { $ne: 'cancelled' } })) {
      throw new ConflictException('This recipient already has a reward in this pool — edit that one instead.');
    }
    await this.allocModel.create({
      pool: pool._id, month, recipientType: dto.recipientType, [field]: recipient,
      amount: dto.amount, manual: true, notes: dto.notes ?? '',
    });
    return { message: 'Reward added.', ...(await this.getPool(month)) };
  }

  async updateAllocation(id: string, dto: UpdateAllocationDto) {
    const a = await this.allocModel.findById(id);
    if (!a) throw new NotFoundException('Reward not found.');
    const pool = await this.poolModel.findById(a.pool);
    if (!pool) throw new NotFoundException('Reward pool not found.');
    this.assertDraft(pool);
    if (dto.amount !== undefined) a.amount = dto.amount;
    if (dto.status)               a.status = dto.status as 'proposed' | 'cancelled';
    if (dto.notes !== undefined)  a.notes = dto.notes;
    await a.save();
    return { message: 'Reward updated.', ...(await this.getPool(pool.month)) };
  }

  async pay(id: string, dto: PayAllocationDto, adminId: string) {
    const a = await this.allocModel.findById(id);
    if (!a) throw new NotFoundException('Reward not found.');
    if (a.status !== 'approved') {
      throw new BadRequestException(a.status === 'paid' ? 'This reward is already marked paid.' : 'Approve the pool before paying rewards.');
    }
    a.status = 'paid';
    a.method = dto.method;
    a.reference = dto.reference ?? '';
    a.paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    a.paidBy = new Types.ObjectId(adminId);
    if (dto.notes) a.notes = dto.notes;
    await a.save();

    const pool = await this.poolModel.findById(a.pool);
    if (pool && !(await this.allocModel.exists({ pool: pool._id, status: 'approved' }))) {
      pool.status = 'completed';
      await pool.save();
    }

    if (a.recipientType === 'murabbi' && a.murabbi) {
      this.notifService.create({
        recipient: a.murabbi.toString(),
        sender   : adminId,
        type     : NotificationType.REWARD,
        title    : 'You received a reward',
        message  : `Jazak Allahu khayran! You received a reward of PKR ${a.amount.toLocaleString('en-PK')} for ${a.month}, in recognition of your engagement.`,
        payload  : { allocationId: a._id.toString(), amount: a.amount, month: a.month },
      }).catch(() => {});
    }
    return { message: 'Reward marked as paid.', ...(await this.getPool(a.month)) };
  }

  // ══ Murabbi view ═══════════════════════════════════════════════════════════

  myRewards(murabbiId: string) {
    return this.allocModel
      .find({ murabbi: new Types.ObjectId(murabbiId), status: { $in: ['approved', 'paid'] } })
      .select('month amount status paidAt method basisValue rank')
      .sort({ month: -1 })
      .lean();
  }
}
