import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LiveSession, LiveSessionDocument } from './live-session.schema';

const PKT_OFFSET_MS = 5 * 3600_000; // Pakistan is UTC+5, no DST

/**
 * Start of the current-or-next weekly occurrence. The day and time are
 * Pakistan time (the server runs in UTC). A session still in progress counts
 * as the current occurrence, so it shows as live rather than jumping a week.
 */
function nextOccurrence(dayOfWeek: number, time: string, durationMinutes = 60): Date {
  const [h, m] = time.split(':').map(Number);
  const now = Date.now();
  const pk = new Date(now + PKT_OFFSET_MS); // wall-clock Pakistan time, read via UTC getters
  const diff = (dayOfWeek - pk.getUTCDay() + 7) % 7;
  let start = Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate() + diff, h, m) - PKT_OFFSET_MS;
  if (start + durationMinutes * 60_000 < now) start += 7 * 24 * 3600_000;
  return new Date(start);
}

function enrichWithStatus(s: any) {
  let scheduledAt = s.scheduledAt;
  if (s.isRecurring && s.recurringDay != null && s.recurringTime) {
    scheduledAt = nextOccurrence(s.recurringDay, s.recurringTime, s.durationMinutes ?? 60);
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