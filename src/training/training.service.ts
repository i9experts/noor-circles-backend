import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TrainingModule, TrainingModuleDocument, TrainingProgress, TrainingProgressDocument } from './training.schema';

@Injectable()
export class TrainingService {
  constructor(
    @InjectModel(TrainingModule.name)  private readonly moduleModel:   Model<TrainingModuleDocument>,
    @InjectModel(TrainingProgress.name) private readonly progressModel: Model<TrainingProgressDocument>,
  ) {}

  async getModules(userId: string) {
    const [modules, progresses] = await Promise.all([
      this.moduleModel.find().sort({ order: 1 }).lean(),
      this.progressModel.find({ user: new Types.ObjectId(userId) }).lean(),
    ]);

    const progressMap = new Map(progresses.map((p) => [p.module.toString(), p]));

    return modules.map((m) => {
      const p = progressMap.get(m._id.toString());
      return {
        ...m,
        progressPercent: p?.progressPercent ?? 0,
        completed      : p?.completed ?? false,
      };
    });
  }

  async getProgressSummary(userId: string) {
    const [total, progresses] = await Promise.all([
      this.moduleModel.countDocuments(),
      this.progressModel.find({ user: new Types.ObjectId(userId) }).lean(),
    ]);

    const completed   = progresses.filter((p) => p.completed).length;
    const inProgress  = progresses.filter((p) => !p.completed && p.progressPercent > 0).length;
    const totalPercent = progresses.reduce((sum, p) => sum + p.progressPercent, 0);
    const overallPercent = total > 0 ? Math.round(totalPercent / total) : 0;

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

  // Admin methods
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
}
