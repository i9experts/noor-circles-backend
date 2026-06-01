import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LiveSession, LiveSessionDocument } from './live-session.schema';

function nextOccurrence(dayOfWeek: number, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  const diff = (dayOfWeek - now.getDay() + 7) % 7;
  next.setDate(now.getDate() + (diff === 0 && next <= now ? 7 : diff));
  return next;
}

function enrichWithStatus(s: any) {
  let scheduledAt = s.scheduledAt;
  if (s.isRecurring && s.recurringDay != null && s.recurringTime) {
    scheduledAt = nextOccurrence(s.recurringDay, s.recurringTime);
  }
  const now = Date.now();
  const start = new Date(scheduledAt).getTime();
  const end = start + (s.durationMinutes ?? 60) * 60_000;
  const isLive = now >= start - 5 * 60_000 && now <= end;
  const isEnded = now > end;
  return { ...s, scheduledAt, isLive, isEnded };
}

@Injectable()
export class LiveSessionService {
  constructor(
    @InjectModel(LiveSession.name)
    private readonly model: Model<LiveSessionDocument>,
  ) {}

  async create(data: Record<string, unknown>, createdBy: string) {
    const payload = {
      ...data,
      ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt as string) }),
      createdBy: new Types.ObjectId(createdBy),
    };
    return this.model.create(payload);
  }

  async getAll() {
    const sessions = await this.model.find().populate('createdBy', 'fullName').sort({ scheduledAt: 1 }).lean();
    return sessions.map(enrichWithStatus);
  }

  async getUpcoming() {
    const sessions = await this.model.find().populate('createdBy', 'fullName').lean();
    const enriched = sessions.map(enrichWithStatus).filter(s => !s.isEnded);
    enriched.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return enriched.slice(0, 5);
  }

  async update(id: string, data: Record<string, unknown>) {
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt as string);
    const s = await this.model.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!s) throw new NotFoundException('Session not found.');
    return s;
  }

  async remove(id: string) {
    const s = await this.model.findByIdAndDelete(id).lean();
    if (!s) throw new NotFoundException('Session not found.');
    return { deleted: true };
  }
}