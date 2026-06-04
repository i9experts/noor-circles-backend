import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TrainingModule, TrainingModuleDocument,
  TrainingProgress, TrainingProgressDocument,
  TrainingBatch, TrainingBatchDocument,
} from './training.schema';
import { User, UserDocument, UserRole } from '../user/user.schema';

import {
  IsArray, IsDateString, IsEnum, IsInt, IsMongoId,
  IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

export class CreateBatchDto {
  @IsInt() @Min(1)
  batchNumber: number;

  @IsOptional()
  @IsDateString()
  day1Date?: string;

  @IsOptional()
  @IsDateString()
  day2Date?: string;

  @IsOptional() @IsString() @MaxLength(100) day1Title?: string;
  @IsOptional() @IsString() @MaxLength(100) day2Title?: string;
  @IsOptional() @IsString() @MaxLength(200) day1Meta?: string;
  @IsOptional() @IsString() @MaxLength(200) day2Meta?: string;

  @IsOptional()
  @IsEnum(['upcoming', 'active', 'completed'])
  status?: string;
}

export class UpdateBatchDto {
  @IsOptional() @IsDateString() day1Date?: string;
  @IsOptional() @IsDateString() day2Date?: string;
  @IsOptional() @IsString() @MaxLength(100) day1Title?: string;
  @IsOptional() @IsString() @MaxLength(100) day2Title?: string;
  @IsOptional() @IsString() @MaxLength(200) day1Meta?: string;
  @IsOptional() @IsString() @MaxLength(200) day2Meta?: string;
  @IsOptional() @IsEnum(['upcoming', 'active', 'completed']) status?: string;
}

export class AddCandidatesDto {
  @IsArray()
  @IsMongoId({ each: true })
  userIds: string[];
}

@Injectable()
export class TrainingService {
  constructor(
    @InjectModel(TrainingModule.name)  private readonly moduleModel:   Model<TrainingModuleDocument>,
    @InjectModel(TrainingProgress.name) private readonly progressModel: Model<TrainingProgressDocument>,
    @InjectModel(TrainingBatch.name)    private readonly batchModel:    Model<TrainingBatchDocument>,
    @InjectModel(User.name)             private readonly userModel:     Model<UserDocument>,
  ) {}

  // ── Module methods ────────────────────────────────────────────────────────────

  async getModules(userId: string) {
    const [modules, progresses] = await Promise.all([
      this.moduleModel.find().sort({ order: 1 }).lean(),
      this.progressModel.find({ user: new Types.ObjectId(userId) }).lean(),
    ]);
    const progressMap = new Map(progresses.map((p) => [p.module.toString(), p]));
    return modules.map((m) => {
      const p = progressMap.get(m._id.toString());
      return { ...m, progressPercent: p?.progressPercent ?? 0, completed: p?.completed ?? false };
    });
  }

  async getProgressSummary(userId: string) {
    const [total, progresses] = await Promise.all([
      this.moduleModel.countDocuments(),
      this.progressModel.find({ user: new Types.ObjectId(userId) }).lean(),
    ]);
    const completed     = progresses.filter((p) => p.completed).length;
    const inProgress    = progresses.filter((p) => !p.completed && p.progressPercent > 0).length;
    const overallPercent = total > 0
      ? Math.round(progresses.reduce((s, p) => s + p.progressPercent, 0) / total)
      : 0;
    return { total, completed, inProgress, overallPercent };
  }

  async updateProgress(userId: string, moduleId: string, progressPercent: number) {
    const mod = await this.moduleModel.findById(moduleId);
    if (!mod) throw new NotFoundException('Module not found');
    const clamped = Math.max(0, Math.min(100, progressPercent));
    return this.progressModel.findOneAndUpdate(
      { user: new Types.ObjectId(userId), module: new Types.ObjectId(moduleId) },
      { progressPercent: clamped, completed: clamped === 100 },
      { upsert: true, new: true },
    );
  }

  async createModule(data: Partial<TrainingModule>) {
    return this.moduleModel.create(data);
  }

  async updateModule(id: string, data: Partial<TrainingModule>) {
    const mod = await this.moduleModel.findByIdAndUpdate(id, data, { new: true });
    if (!mod) throw new NotFoundException('Module not found');
    return mod;
  }

  async deleteModule(id: string) {
    const mod = await this.moduleModel.findByIdAndDelete(id);
    if (!mod) throw new NotFoundException('Module not found');
    await this.progressModel.deleteMany({ module: new Types.ObjectId(id) });
    return { deleted: true };
  }

  // ── Batch methods ─────────────────────────────────────────────────────────────

  async createBatch(dto: CreateBatchDto) {
    // Mark all previous batches as completed if new one is active
    if (dto.status === 'active') {
      await this.batchModel.updateMany({ status: 'active' }, { status: 'completed' });
    }
    return this.batchModel.create({
      batchNumber : dto.batchNumber,
      status      : dto.status ?? 'upcoming',
      day1Date    : dto.day1Date ? new Date(dto.day1Date) : null,
      day2Date    : dto.day2Date ? new Date(dto.day2Date) : null,
      day1Title   : dto.day1Title,
      day2Title   : dto.day2Title,
      day1Meta    : dto.day1Meta,
      day2Meta    : dto.day2Meta,
    });
  }

  async updateBatch(id: string, dto: UpdateBatchDto) {
    const update: Record<string, unknown> = {};
    if (dto.day1Date  !== undefined) update['day1Date']  = dto.day1Date ? new Date(dto.day1Date) : null;
    if (dto.day2Date  !== undefined) update['day2Date']  = dto.day2Date ? new Date(dto.day2Date) : null;
    if (dto.day1Title !== undefined) update['day1Title'] = dto.day1Title;
    if (dto.day2Title !== undefined) update['day2Title'] = dto.day2Title;
    if (dto.day1Meta  !== undefined) update['day1Meta']  = dto.day1Meta;
    if (dto.day2Meta  !== undefined) update['day2Meta']  = dto.day2Meta;
    if (dto.status    !== undefined) {
      if (dto.status === 'active') await this.batchModel.updateMany({ _id: { $ne: new Types.ObjectId(id) }, status: 'active' }, { status: 'completed' });
      update['status'] = dto.status;
    }
    const batch = await this.batchModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!batch) throw new NotFoundException('Batch not found.');
    return batch;
  }

  async addCandidates(batchId: string, dto: AddCandidatesDto) {
    const batch = await this.batchModel.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found.');
    const oids = dto.userIds.map((id) => new Types.ObjectId(id));
    await this.batchModel.findByIdAndUpdate(batchId, { $addToSet: { candidates: { $each: oids } } });
    return { message: `${oids.length} candidate(s) added.` };
  }

  async removeCandidate(batchId: string, userId: string) {
    const batch = await this.batchModel.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found.');
    await this.batchModel.findByIdAndUpdate(batchId, { $pull: { candidates: new Types.ObjectId(userId) } });
    return { message: 'Candidate removed.' };
  }

  async getAllBatches() {
    return this.batchModel
      .find()
      .populate('candidates', 'fullName email image')
      .sort({ batchNumber: -1 })
      .lean();
  }

  // ── Active batch (murabbi view) ──────────────────────────────────────────────

  async getActiveBatch(murabbiId: string) {
    // Only return batch + modules if this murabbi is in the candidates list
    const batch = await this.batchModel
      .findOne({ status: 'active', candidates: new Types.ObjectId(murabbiId) })
      .select('-candidates')
      .lean();

    if (!batch) return { batch: null, modules: [] };

    const modules = await this.moduleModel.find().sort({ order: 1 }).lean();
    return { batch, modules };
  }

  // ── Page data ─────────────────────────────────────────────────────────────────

  async getPageData() {
    const [modules, allBatches] = await Promise.all([
      this.moduleModel.find().sort({ order: 1 }).lean(),
      this.batchModel
        .find()
        .populate('candidates', 'fullName email image')
        .sort({ batchNumber: -1 })
        .lean(),
    ]);

    const completedBatches = allBatches.filter((b) => b.status === 'completed');
    const activeBatch      = allBatches.find((b) => b.status === 'active') || null;

    // Pass rate: % of candidates in completed batches (assume all completed = passed for now)
    const totalCandidatesAllBatches = allBatches.reduce((s, b) => s + b.candidates.length, 0);
    const completedCandidates       = completedBatches.reduce((s, b) => s + b.candidates.length, 0);
    const passRate = totalCandidatesAllBatches > 0
      ? Math.round((completedCandidates / totalCandidatesAllBatches) * 100)
      : 0;

    return {
      stats: {
        batchesCompleted    : completedBatches.length,
        murabbisInBatches   : completedCandidates,
        activeBatchCandidates: activeBatch ? activeBatch.candidates.length : 0,
        modulesAvailable    : modules.length,
        passRate,
        activeBatchNumber   : activeBatch?.batchNumber ?? null,
      },
      activeBatch,
      modules,
      allBatches,
    };
  }
}
