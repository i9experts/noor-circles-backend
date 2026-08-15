import { BadRequestException, Injectable, Logger, MessageEvent, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Observable } from 'rxjs';
import {
  ArrayMinSize, IsArray, IsEmail, IsInt, IsMongoId, IsNotEmpty, IsOptional,
  IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import axios from 'axios';
import { Parent, ParentDocument } from './parent.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { EngagementConfig, EngagementConfigDocument } from './engagement.schema';
import { safeEmail, safeTrim } from '../common/utils/transform.util';

export class RegisterParentDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required.' })
  @MaxLength(100)
  @Transform(safeTrim)
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required.' })
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address.' })
  @Transform(safeEmail)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid WhatsApp number format.' })
  whatsappNumber?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one student must be selected.' })
  @IsMongoId({ each: true, message: 'Each student ID must be a valid ID.' })
  studentIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(safeTrim)
  notes?: string;
}

export class UpdateParentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(safeTrim)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/, { message: 'Invalid phone number format.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address.' })
  @Transform(safeEmail)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()٠-٩]{7,20}$/)
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(safeTrim)
  notes?: string;
}

export class AddFeedbackDto {
  @IsString()
  @IsNotEmpty({ message: 'Feedback message is required.' })
  @MinLength(3)
  @MaxLength(500)
  @Transform(safeTrim)
  message: string;

  @IsInt() @Min(1) @Max(5)
  stars: number;

  @IsInt() @Min(1)
  sessionNumber: number;
}

export class SendWhatsappDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class ScheduleEveningDto {
  @IsInt() @Min(1) @Max(12)
  month: number;
}

@Injectable()
export class ParentService {
  private readonly logger = new Logger(ParentService.name);

  constructor(
    @InjectModel(Parent.name)           private readonly parentModel:           Model<ParentDocument>,
    @InjectModel(Student.name)          private readonly studentModel:          Model<StudentDocument>,
    @InjectModel(EngagementConfig.name) private readonly engagementModel:       Model<EngagementConfigDocument>,
    private readonly config: ConfigService,
  ) {}

  // ── Engagement Config (singleton) ────────────────────────────────────────────

  private getOrCreateConfig() {
    return this.engagementModel.findOneAndUpdate(
      {},
      { $setOnInsert: {} },
      { upsert: true, new: true },
    ).lean();
  }

  async getEngagementConfig() {
    return this.getOrCreateConfig();
  }

  async toggleWeeklyCard(active: boolean) {
    const cfg = await this.engagementModel.findOneAndUpdate(
      {}, { weeklyCardActive: active }, { upsert: true, new: true },
    ).lean();
    return { message: `Weekly card ${active ? 'enabled' : 'disabled'}.`, config: cfg };
  }

  async toggleWhatsapp(enabled: boolean) {
    const cfg = await this.engagementModel.findOneAndUpdate(
      {}, { whatsappEnabled: enabled }, { upsert: true, new: true },
    ).lean();
    return { message: `WhatsApp updates ${enabled ? 'enabled' : 'disabled'}.`, config: cfg };
  }

  async scheduleEvening(dto: ScheduleEveningDto) {
    const cfg = await this.engagementModel.findOneAndUpdate(
      {}, { scheduledEveningMonth: dto.month }, { upsert: true, new: true },
    ).lean();
    return { message: `Parent evening scheduled for Month ${dto.month}.`, config: cfg };
  }

  async recordEveningHeld(_adminId: string) {
    const cfg = await this.engagementModel.findOneAndUpdate(
      {},
      { $inc: { parentEveningsHeld: 1 }, scheduledEveningMonth: null },
      { upsert: true, new: true },
    ).lean();
    return { message: 'Parent evening marked as held.', config: cfg };
  }

  // ── Green API: check instance state ─────────────────────────────────────────
  async testWhatsapp(testNumber?: string) {
    const instanceId = this.config.get<string>('GREEN_API_INSTANCE_ID');
    const apiToken   = this.config.get<string>('GREEN_API_TOKEN');

    if (!instanceId || !apiToken) {
      return { configured: false, error: 'GREEN_API_INSTANCE_ID or GREEN_API_TOKEN not set in .env' };
    }

    // 1. Check instance state
    let instanceState = 'unknown';
    try {
      const stateRes = await axios.get(
        `https://api.green-api.com/waInstance${instanceId}/getStateInstance/${apiToken}`,
        { timeout: 8_000 },
      );
      instanceState = stateRes.data?.stateInstance || 'unknown';
    } catch (err: any) {
      return { configured: true, instanceState: 'error', error: `State check failed: ${err.message}` };
    }

    if (instanceState !== 'authorized') {
      return {
        configured: true,
        instanceState,
        error: `Instance is "${instanceState}" — scan QR code in Green API dashboard to authorize.`,
      };
    }

    // 2. If testNumber provided, send a test message
    if (testNumber) {
      const chatId = `${this.normalizeNumber(testNumber)}@c.us`;
      try {
        await axios.post(
          `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`,
          { chatId, message: 'Test message from Noor Circle — if you received this, WhatsApp is working!' },
          { timeout: 10_000 },
        );
        return { configured: true, instanceState, testSent: true, chatId };
      } catch (err: any) {
        return { configured: true, instanceState, testSent: false, chatId, error: err?.response?.data || err.message };
      }
    }

    return { configured: true, instanceState };
  }

  // ── Green API helper — normalize Pakistani numbers ───────────────────────────
  private normalizeNumber(raw: string): string {
    const digits = raw.replace(/[\s\-()]/g, '');
    if (digits.startsWith('+'))  return digits.slice(1);           // +923001234567 → 923001234567
    if (digits.startsWith('0'))  return `92${digits.slice(1)}`;    // 03001234567  → 923001234567
    if (digits.startsWith('92')) return digits;                     // 923001234567 → 923001234567
    return `92${digits}`;                                           // 3001234567   → 923001234567
  }

  async sendWhatsapp(adminId: string, dto: SendWhatsappDto) {
    const parents = await this.parentModel
      .find()
      .select('fullName phone whatsappNumber')
      .lean();

    if (parents.length === 0) throw new BadRequestException('No parents registered yet.');

    const instanceId = this.config.get<string>('GREEN_API_INSTANCE_ID');
    const apiToken   = this.config.get<string>('GREEN_API_TOKEN');
    const body       = dto.message?.trim()
      || 'Assalam-o-Alaikum! Yeh Noor Circle ki taraf se ek post-session update hai. JazakAllah Khair.';

    const results: { name: string; number: string; status: 'sent' | 'failed'; error?: string }[] = [];

    if (instanceId && apiToken) {
      const sendUrl  = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`;
      const checkUrl = `https://api.green-api.com/waInstance${instanceId}/checkWhatsapp/${apiToken}`;
      const delay    = (ms: number) => new Promise((r) => setTimeout(r, ms));

      for (const p of parents) {
        const rawNumber = (p.whatsappNumber || p.phone || '').trim();
        if (!rawNumber) {
          results.push({ name: p.fullName, number: '—', status: 'failed', error: 'No number saved' });
          continue;
        }

        const phoneNumber = this.normalizeNumber(rawNumber);

        // Step 1: checkWhatsapp → get correct chatId (@c.us OR @lid)
        let chatId = `${phoneNumber}@c.us`;
        try {
          const checkRes = await axios.post(
            checkUrl,
            { phoneNumber },
            { timeout: 8_000 },
          );
          if (!checkRes.data?.existsWhatsapp) {
            this.logger.warn(`Not on WhatsApp → ${p.fullName} (+${phoneNumber})`);
            results.push({ name: p.fullName, number: `+${phoneNumber}`, status: 'failed', error: 'Number not registered on WhatsApp' });
            await delay(1000);
            continue;
          }
          // Use the chatId returned by API — handles @c.us AND @lid accounts
          if (checkRes.data?.chatId) chatId = checkRes.data.chatId;
        } catch (err: any) {
          this.logger.warn(`checkWhatsapp failed for ${p.fullName} — using default chatId`);
        }

        // Step 2: send message
        try {
          await axios.post(sendUrl, { chatId, message: body }, { timeout: 15_000 });
          results.push({ name: p.fullName, number: chatId, status: 'sent' });
          this.logger.log(`WhatsApp sent → ${p.fullName} (${chatId})`);
        } catch (err: any) {
          const status  = err?.response?.status;
          const errData = err?.response?.data;
          const errMsg  = errData?.message || errData?.error || err.message;
          this.logger.error(`WhatsApp failed → ${p.fullName} (${chatId}) [${status}]: ${errMsg}`);
          results.push({ name: p.fullName, number: chatId, status: 'failed', error: `[${status}] ${errMsg}` });
        }

        // 3s gap between each parent — Green API rate limit
        await delay(3000);
      }
    } else {
      // Green API not configured — log only
      this.logger.warn('[DEV] GREEN_API_INSTANCE_ID / GREEN_API_TOKEN not set — logging only.');
      parents.forEach((p) => {
        const number = p.whatsappNumber || p.phone || '—';
        results.push({ name: p.fullName, number, status: 'sent' });
        this.logger.log(`  [DEV] → ${p.fullName} (${number}): "${body}"`);
      });
    }

    const sentCount   = results.filter((r) => r.status === 'sent').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    await this.engagementModel.findOneAndUpdate(
      {},
      {
        lastWhatsappSentAt  : new Date(),
        lastWhatsappSentBy  : new Types.ObjectId(adminId),
        lastWhatsappMessage : body,
      },
      { upsert: true, new: true },
    );

    return {
      message: instanceId
        ? `WhatsApp sent to ${sentCount} parent(s)${failedCount > 0 ? `, ${failedCount} failed` : ''}.`
        : `[Dev mode] Green API not configured — set GREEN_API_INSTANCE_ID and GREEN_API_TOKEN in .env`,
      sentCount,
      failedCount,
      results,
    };
  }

  // ── SSE streaming send ───────────────────────────────────────────────────────
  sendWhatsappSse(adminId: string, message?: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        const emit = (data: object) =>
          subscriber.next({ data: JSON.stringify(data) } as MessageEvent);

        const parents = await this.parentModel
          .find()
          .select('fullName phone whatsappNumber')
          .lean();

        const total = parents.length;
        const body  = message?.trim()
          || 'Assalam-o-Alaikum! Yeh Noor Circle ki taraf se ek post-session update hai. JazakAllah Khair.';

        const instanceId = this.config.get<string>('GREEN_API_INSTANCE_ID');
        const apiToken   = this.config.get<string>('GREEN_API_TOKEN');
        const delay      = (ms: number) => new Promise((r) => setTimeout(r, ms));

        emit({ type: 'start', total, message: body });

        if (!instanceId || !apiToken) {
          emit({ type: 'error', error: 'Green API not configured in .env' });
          subscriber.complete();
          return;
        }

        const sendUrl  = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`;
        const checkUrl = `https://api.green-api.com/waInstance${instanceId}/checkWhatsapp/${apiToken}`;

        let sentCount = 0;
        let failedCount = 0;

        for (let i = 0; i < parents.length; i++) {
          const p = parents[i];
          const rawNumber = (p.whatsappNumber || p.phone || '').trim();
          const startMs   = Date.now();

          if (!rawNumber) {
            failedCount++;
            emit({ type: 'progress', index: i + 1, total, name: p.fullName, status: 'failed', error: 'No number', ms: 0 });
            continue;
          }

          const phoneNumber = this.normalizeNumber(rawNumber);

          // Step 1: checkWhatsapp
          let chatId = `${phoneNumber}@c.us`;
          try {
            const chk = await axios.post(checkUrl, { phoneNumber }, { timeout: 8_000 });
            if (!chk.data?.existsWhatsapp) {
              failedCount++;
              const ms = Date.now() - startMs;
              emit({ type: 'progress', index: i + 1, total, name: p.fullName, status: 'failed', error: 'Not on WhatsApp', ms });
              await delay(1000);
              continue;
            }
            if (chk.data?.chatId) chatId = chk.data.chatId;
          } catch { /* use default chatId */ }

          // Step 2: send
          try {
            await axios.post(sendUrl, { chatId, message: body }, { timeout: 15_000 });
            sentCount++;
            const ms = Date.now() - startMs;
            emit({ type: 'progress', index: i + 1, total, name: p.fullName, status: 'sent', number: chatId, ms });
            this.logger.log(`WhatsApp sent → ${p.fullName} (${chatId}) [${ms}ms]`);
          } catch (err: any) {
            failedCount++;
            const ms     = Date.now() - startMs;
            const status = err?.response?.status;
            const errMsg = err?.response?.data?.message || err.message;
            emit({ type: 'progress', index: i + 1, total, name: p.fullName, status: 'failed', error: `[${status}] ${errMsg}`, ms });
            this.logger.error(`WhatsApp failed → ${p.fullName} [${status}]: ${errMsg}`);
          }

          if (i < parents.length - 1) await delay(3000);
        }

        // Save to DB
        await this.engagementModel.findOneAndUpdate(
          {},
          { lastWhatsappSentAt: new Date(), lastWhatsappSentBy: new Types.ObjectId(adminId), lastWhatsappMessage: body },
          { upsert: true, new: true },
        );

        emit({ type: 'complete', sentCount, failedCount, total });
        subscriber.complete();
      })().catch((err) => {
        subscriber.next({ data: JSON.stringify({ type: 'error', error: err.message }) } as MessageEvent);
        subscriber.complete();
      });
    });
  }

  async register(dto: RegisterParentDto) {
    const studentOids = dto.studentIds.map((id) => new Types.ObjectId(id));

    const foundCount = await this.studentModel.countDocuments({ _id: { $in: studentOids } });
    if (foundCount !== studentOids.length) throw new NotFoundException('One or more students not found.');

    const parent = await this.parentModel.create({
      fullName      : dto.fullName,
      phone         : dto.phone,
      email         : dto.email ?? null,
      whatsappNumber: dto.whatsappNumber ?? null,
      students      : studentOids,
      notes         : dto.notes ?? '',
    });

    return { message: 'Parent registered successfully.', parent };
  }

  async getAll() {
    return this.parentModel
      .find()
      .populate({
        path    : 'students',
        select  : 'fullName circle',
        populate: { path: 'circle', select: 'name' },
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getOne(id: string) {
    const parent = await this.parentModel
      .findById(id)
      .populate({
        path    : 'students',
        select  : 'fullName circle',
        populate: { path: 'circle', select: 'name' },
      })
      .lean();
    if (!parent) throw new NotFoundException('Parent not found.');
    return parent;
  }

  async update(id: string, dto: UpdateParentDto) {
    const update: Record<string, unknown> = {};
    if (dto.fullName)       update['fullName']       = dto.fullName;
    if (dto.phone)          update['phone']          = dto.phone;
    if (dto.email)          update['email']          = dto.email;
    if (dto.whatsappNumber) update['whatsappNumber'] = dto.whatsappNumber;
    if (dto.notes !== undefined) update['notes']     = dto.notes;

    const parent = await this.parentModel
      .findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .lean();
    if (!parent) throw new NotFoundException('Parent not found.');
    return { message: 'Parent updated successfully.', parent };
  }

  async remove(id: string) {
    const parent = await this.parentModel.findByIdAndDelete(id).lean();
    if (!parent) throw new NotFoundException('Parent not found.');
    return { message: 'Parent record deleted successfully.' };
  }

  async addFeedback(id: string, dto: AddFeedbackDto) {
    const parent = await this.parentModel.findById(id);
    if (!parent) throw new NotFoundException('Parent not found.');

    parent.feedback.push({
      message      : dto.message,
      stars        : dto.stars,
      sessionNumber: dto.sessionNumber,
      date         : new Date(),
    } as any);
    parent.isEngaged = true;
    await parent.save();

    return { message: 'Feedback recorded successfully.', parent };
  }

  async getPageData() {
    const [allParents, totalStudents] = await Promise.all([
      this.parentModel
        .find()
        .populate({ path: 'students', select: 'fullName circle', populate: { path: 'circle', select: 'name' } })
        .lean(),
      this.studentModel.countDocuments(),
    ]);

    const totalParents         = allParents.length;
    const parentsWithFeedback  = allParents.filter((p) => p.feedback.length > 0).length;
    const engagementRate       = totalParents > 0 ? Math.round((parentsWithFeedback / totalParents) * 100) : 0;
    const registrationRate     = totalStudents > 0 ? Math.round((totalParents / totalStudents) * 100) : 0;

    // Home cards completed: parents with feedback in last 28 days
    const cutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const recentActive     = allParents.filter((p) => p.feedback.some((f) => new Date(f.date) > cutoff)).length;
    const homeCardsCompleted = totalParents > 0 ? Math.round((recentActive / totalParents) * 100) : 0;

    // Parent evenings = unique session numbers across all feedback
    const sessionNums = new Set<number>();
    for (const p of allParents) for (const f of p.feedback) if (f.sessionNumber) sessionNums.add(f.sessionNumber);
    const parentEvenings = sessionNums.size;
    const latestSession  = sessionNums.size > 0 ? Math.max(...sessionNums) : 0;
    const currentMonth   = Math.max(1, Math.ceil(latestSession / 4));

    // Flatten all feedback with parent + student info
    const allFeedback: {
      parentName: string; studentNames: string;
      stars: number; message: string; sessionNumber: number; date: Date;
    }[] = [];

    for (const p of allParents) {
      const studentNames = (p.students as any[]).map((s: any) => s.fullName).join(', ') || '—';
      for (const f of p.feedback) {
        allFeedback.push({
          parentName: p.fullName, studentNames,
          stars: f.stars, message: f.message,
          sessionNumber: f.sessionNumber, date: f.date,
        });
      }
    }
    allFeedback.sort((a, b) => b.date.getTime() - a.date.getTime());

    let totalStars = 0;
    for (const f of allFeedback) totalStars += f.stars;
    const avgStars = allFeedback.length > 0
      ? parseFloat((totalStars / allFeedback.length).toFixed(1))
      : 0;

    return {
      stats: {
        totalParents, totalStudents, engagementRate, registrationRate,
        homeCardsCompleted, parentEvenings, avgStars, currentMonth, latestSession,
      },
      recentFeedback: allFeedback.slice(0, 10),
      parents       : allParents,
    };
  }

  async getStats() {
    const [totalParents, totalStudents, parentsWithFeedback] = await Promise.all([
      this.parentModel.countDocuments(),
      this.studentModel.countDocuments(),
      this.parentModel.countDocuments({ 'feedback.0': { $exists: true } }),
    ]);

    const engagementRate    = totalParents > 0 ? Math.round((parentsWithFeedback / totalParents) * 100) : 0;
    const registrationRate  = totalStudents > 0 ? Math.round((totalParents / totalStudents) * 100) : 0;

    // Average stars across all feedback entries
    const allParents    = await this.parentModel.find().select('feedback').lean();
    let totalStars = 0;
    let totalFeedbackCount = 0;
    for (const p of allParents) {
      for (const f of p.feedback) {
        totalStars += f.stars;
        totalFeedbackCount++;
      }
    }
    const avgStars = totalFeedbackCount > 0
      ? (totalStars / totalFeedbackCount).toFixed(1)
      : '0.0';

    return {
      totalParents,
      totalStudents,
      registrationRate,
      engagementRate,
      totalFeedbackCount,
      avgStars,
    };
  }
}
