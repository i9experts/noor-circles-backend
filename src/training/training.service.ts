import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as PDFDocument from 'pdfkit';
import {
  TrainingModule, TrainingModuleDocument,
  TrainingProgress, TrainingProgressDocument,
  TrainingBatch, TrainingBatchDocument,
  TrainingExam, TrainingExamDocument,
  TrainingExamAttempt, TrainingExamAttemptDocument,
  TrainingCertificate, TrainingCertificateDocument,
} from './training.schema';
import { User, UserDocument, UserRole } from '../user/user.schema';

import {
  ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsMongoId,
  IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class UpsertExamDto {
  @IsInt() @Min(1) @Max(3)
  tier: number;

  @IsString() @MaxLength(150)
  title: string;

  @IsArray() @ArrayMinSize(1)
  questions: { question: string; options: string[]; correctIndex: number }[];

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  passingScore?: number;
}

export class SubmitExamDto {
  @IsArray() @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  answers: number[];
}

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
    @InjectModel(TrainingModule.name)     private readonly moduleModel:      Model<TrainingModuleDocument>,
    @InjectModel(TrainingProgress.name)   private readonly progressModel:    Model<TrainingProgressDocument>,
    @InjectModel(TrainingBatch.name)      private readonly batchModel:       Model<TrainingBatchDocument>,
    @InjectModel(TrainingExam.name)       private readonly examModel:        Model<TrainingExamDocument>,
    @InjectModel(TrainingExamAttempt.name) private readonly attemptModel:    Model<TrainingExamAttemptDocument>,
    @InjectModel(TrainingCertificate.name) private readonly certificateModel: Model<TrainingCertificateDocument>,
    @InjectModel(User.name)               private readonly userModel:        Model<UserDocument>,
  ) {}

  // ── Module methods ────────────────────────────────────────────────────────────

  /** A murabbi's tier gates which modules they can see (1 sees only minTier<=1, etc). Admins see everything. */
  private async getViewableModuleFilter(userId: string, isAdmin: boolean): Promise<Record<string, unknown>> {
    if (isAdmin) return {};
    const user = await this.userModel.findById(userId).select('tier').lean();
    const tier = user?.tier ?? 1;
    return { minTier: { $lte: tier } };
  }

  async getModules(userId: string, isAdmin = false) {
    const filter = await this.getViewableModuleFilter(userId, isAdmin);
    const [modules, progresses] = await Promise.all([
      this.moduleModel.find(filter).sort({ order: 1 }).lean(),
      this.progressModel.find({ user: new Types.ObjectId(userId) }).lean(),
    ]);
    const progressMap = new Map(progresses.map((p) => [p.module.toString(), p]));
    return modules.map((m) => {
      const p = progressMap.get(m._id.toString());
      return { ...m, progressPercent: p?.progressPercent ?? 0, completed: p?.completed ?? false };
    });
  }

  async getProgressSummary(userId: string, isAdmin = false) {
    const filter = await this.getViewableModuleFilter(userId, isAdmin);
    const [viewableModuleIds, progresses] = await Promise.all([
      this.moduleModel.find(filter).select('_id').lean(),
      this.progressModel.find({ user: new Types.ObjectId(userId) }).lean(),
    ]);
    const viewableIdSet = new Set(viewableModuleIds.map((m) => m._id.toString()));
    const viewableProgresses = progresses.filter((p) => viewableIdSet.has(p.module.toString()));

    const total          = viewableModuleIds.length;
    const completed      = viewableProgresses.filter((p) => p.completed).length;
    const inProgress     = viewableProgresses.filter((p) => !p.completed && p.progressPercent > 0).length;
    const overallPercent = total > 0
      ? Math.round(viewableProgresses.reduce((s, p) => s + p.progressPercent, 0) / total)
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

    const filter = await this.getViewableModuleFilter(murabbiId, false);
    const modules = await this.moduleModel.find(filter).sort({ order: 1 }).lean();
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

  // ── Exams (admin) ────────────────────────────────────────────────────────────

  async upsertExam(dto: UpsertExamDto) {
    const update = {
      title       : dto.title,
      questions   : dto.questions,
      passingScore: dto.passingScore ?? 70,
    };
    return this.examModel.findOneAndUpdate(
      { tier: dto.tier },
      { $set: update, $setOnInsert: { tier: dto.tier } },
      { upsert: true, new: true },
    );
  }

  async getExamAdmin(tier: number) {
    const exam = await this.examModel.findOne({ tier }).lean();
    if (!exam) throw new NotFoundException('No exam configured for this tier yet.');
    return exam;
  }

  async getAllCertificates() {
    return this.certificateModel
      .find()
      .populate('user', 'fullName email')
      .sort({ issuedAt: -1 })
      .lean();
  }

  // ── Exam (murabbi) ───────────────────────────────────────────────────────────

  /** All modules must be at 100% before the exam for that tier unlocks. */
  private async checkExamEligibility(userId: string, tier: number) {
    const user = await this.userModel.findById(userId).select('tier').lean();
    if (!user) throw new NotFoundException('User not found.');
    if (tier > (user.tier ?? 1)) {
      throw new ForbiddenException(`You are not yet Tier ${tier}.`);
    }

    const modules = await this.moduleModel.find({ minTier: { $lte: tier } }).select('_id').lean();
    if (!modules.length) throw new NotFoundException('No modules found for this tier.');

    const progresses = await this.progressModel
      .find({ user: new Types.ObjectId(userId), module: { $in: modules.map((m) => m._id) } })
      .lean();
    const completedIds = new Set(
      progresses.filter((p) => p.completed).map((p) => p.module.toString()),
    );
    const allComplete = modules.every((m) => completedIds.has(m._id.toString()));
    if (!allComplete) {
      throw new ForbiddenException(
        'Complete all training modules for this tier before taking the assessment.',
      );
    }
  }

  /** Murabbi-facing: no correctIndex included. */
  async getExamForMurabbi(userId: string, tier: number) {
    await this.checkExamEligibility(userId, tier);
    const exam = await this.examModel.findOne({ tier }).lean();
    if (!exam) throw new NotFoundException('No assessment is available for this tier yet.');

    const alreadyCertified = await this.certificateModel.findOne({
      user: new Types.ObjectId(userId), tier,
    }).lean();

    return {
      examId      : exam._id,
      title       : exam.title,
      passingScore: exam.passingScore,
      alreadyCertified: !!alreadyCertified,
      questions   : exam.questions.map((q, i) => ({ index: i, question: q.question, options: q.options })),
    };
  }

  async submitExam(userId: string, tier: number, dto: SubmitExamDto) {
    await this.checkExamEligibility(userId, tier);
    const exam = await this.examModel.findOne({ tier });
    if (!exam) throw new NotFoundException('No assessment is available for this tier yet.');

    if (dto.answers.length !== exam.questions.length) {
      throw new BadRequestException(
        `Expected ${exam.questions.length} answers, received ${dto.answers.length}.`,
      );
    }

    let correct = 0;
    exam.questions.forEach((q, i) => {
      if (dto.answers[i] === q.correctIndex) correct++;
    });
    const scorePercent = Math.round((correct / exam.questions.length) * 100);
    const passed = scorePercent >= exam.passingScore;

    await this.attemptModel.create({
      user   : new Types.ObjectId(userId),
      exam   : exam._id,
      answers: dto.answers,
      scorePercent,
      passed,
    });

    let certificate = null;
    if (passed) {
      certificate = await this.issueCertificateIfNeeded(userId, tier);
    }

    return { scorePercent, passed, correctCount: correct, totalQuestions: exam.questions.length, certificate };
  }

  // ── Certificates ─────────────────────────────────────────────────────────────

  private async issueCertificateIfNeeded(userId: string, tier: number) {
    const existing = await this.certificateModel.findOne({ user: new Types.ObjectId(userId), tier });
    if (existing) return existing;

    // Certificate number: NC-T{tier}-{6 random digits}, retried on the rare collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const certificateNumber = `NC-T${tier}-${Math.floor(100000 + Math.random() * 900000)}`;
      try {
        return await this.certificateModel.create({
          user: new Types.ObjectId(userId),
          tier,
          certificateNumber,
        });
      } catch (err: any) {
        if (err?.code === 11000 && attempt < 4) continue; // certificateNumber collision, retry
        throw err;
      }
    }
    throw new ConflictException('Could not issue certificate — please try again.');
  }

  async getMyCertificates(userId: string) {
    return this.certificateModel.find({ user: new Types.ObjectId(userId) }).sort({ tier: 1 }).lean();
  }

  private tierName(tier: number): string {
    return tier === 1 ? 'Tier 1 — Asaas (Foundation)'
         : tier === 2 ? 'Tier 2 — Mutqin (Proficient)'
         : 'Tier 3 — Mudarrib (Master Trainer)';
  }

  async generateCertificatePdf(userId: string, tier: number): Promise<Buffer> {
    const cert = await this.certificateModel.findOne({ user: new Types.ObjectId(userId), tier }).lean();
    if (!cert) throw new NotFoundException('No certificate found for this tier. Pass the assessment first.');

    const user = await this.userModel.findById(userId).select('fullName').lean();
    const fullName = user?.fullName ?? 'Murabbi';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const MAROON = '#6d1b3a';
      const GOLD   = '#c9a34e';
      const W = doc.page.width;
      const H = doc.page.height;

      // Background + borders
      doc.rect(0, 0, W, H).fill('#fffdf8');
      doc.lineWidth(10).strokeColor(MAROON).rect(24, 24, W - 48, H - 48).stroke();
      doc.lineWidth(1.5).strokeColor(GOLD).rect(38, 38, W - 76, H - 76).stroke();

      doc.fillColor(MAROON)
        .font('Times-Bold').fontSize(14)
        .text('NOOR CIRCLES', 0, 68, { align: 'center', characterSpacing: 4 });

      doc.fillColor('#555')
        .font('Times-Roman').fontSize(11)
        .text('The Deen Way (TDW) Education Network', 0, 90, { align: 'center' });

      doc.moveTo(W / 2 - 60, 118).lineTo(W / 2 + 60, 118).lineWidth(1).strokeColor(GOLD).stroke();

      doc.fillColor(MAROON)
        .font('Times-Bold').fontSize(28)
        .text('Certificate of Completion', 0, 140, { align: 'center' });

      doc.fillColor('#333')
        .font('Times-Roman').fontSize(13)
        .text('This is to certify that', 0, 190, { align: 'center' });

      doc.fillColor(MAROON)
        .font('Times-Bold').fontSize(30)
        .text(fullName, 0, 215, { align: 'center' });

      doc.fillColor('#333')
        .font('Times-Roman').fontSize(13)
        .text(
          `has successfully completed the ${this.tierName(tier)} Murabbi Training Programme,`,
          80, 260, { align: 'center', width: W - 160 },
        )
        .text(
          'demonstrating the knowledge and character required to lead a Noor Circle under EDUDEEN supervision.',
          80, 280, { align: 'center', width: W - 160 },
        );

      const issued = new Date(cert.issuedAt);
      const dateStr = issued.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

      doc.font('Times-Roman').fontSize(11).fillColor('#555')
        .text(`Certificate No. ${cert.certificateNumber}`, 80, H - 110, { width: 250 })
        .text(`Issued ${dateStr}`, 80, H - 92, { width: 250 });

      doc.moveTo(W - 330, H - 110).lineTo(W - 80, H - 110).lineWidth(1).strokeColor('#999').stroke();
      doc.font('Times-Italic').fontSize(11).fillColor('#555')
        .text('Authorised Signatory', W - 330, H - 100, { width: 250, align: 'center' });

      doc.end();
    });
  }
}
