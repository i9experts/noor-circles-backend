import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AGE_GROUPS, AgeGroup, CalendarEvent, CalendarEventDocument, PART_KEYS, SESSION_PARTS, SessionCoverage,
  SessionCoverageDocument, StudentNote, StudentNoteDocument, SyllabusSession, SyllabusSessionDocument,
  SyllabusTrack, SyllabusTrackDocument, THEMES,
} from './syllabus.schema';
import {
  CreateEventDto, CreateSessionDto, CreateTrackDto, RecordCoverageDto, SessionPartDto, StudentNoteDto,
  UpdateEventDto, UpdateSessionDto, UpdateTrackDto,
} from './syllabus.dto';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { UserRole } from '../user/user.schema';
import { Closure, addDays, expectedSessions, meetingDates, nextMeeting, pkInstant, pkToday } from './schedule.util';

const TRACK_NAMES: Record<AgeGroup, string> = {
  '6-8'  : 'Little Lights (ages 6–8)',
  '9-10' : 'Growing Lights (ages 9–10)',
  '11-13': 'Guiding Lights (ages 11–13)',
};

/** 40 sessions over the 12 themes: the first four themes get 4, the rest 3. */
export function defaultPlan(): { month: number; theme: string; part: number }[] {
  const plan: { month: number; theme: string; part: number }[] = [];
  THEMES.forEach((theme, i) => {
    const n = i < 4 ? 4 : 3;
    for (let p = 1; p <= n; p++) plan.push({ month: i + 1, theme, part: p });
  });
  return plan;
}

/** All six parts in order, filled from whatever the admin supplied. */
function normaliseParts(parts: SessionPartDto[] = [], existing: { key: string; title?: string; details?: string; minutes?: number }[] = []) {
  return SESSION_PARTS.map((p) => {
    const given = parts.find((x) => x.key === p.key);
    const prev  = existing.find((x) => x.key === p.key);
    return {
      key    : p.key,
      title  : given?.title ?? prev?.title ?? '',
      details: given?.details ?? prev?.details ?? '',
      minutes: given?.minutes ?? prev?.minutes ?? p.minutes,
    };
  });
}

type Requester = { id: string; role: string };

export interface CalendarItem {
  type           : 'session' | 'holiday' | 'parent_evening' | 'event';
  date           : string;
  endDate?       : string;
  time?          : string | null;
  title          : string;
  circleId?      : Types.ObjectId;
  circleName?    : string;
  sessionNumber? : number | null;
  notes?         : string;
  cancelsSessions?: boolean;
  circles?       : string[] | 'all';
}

export interface ProgressSummary {
  total       : number;
  covered     : number;
  partial     : number;
  expected    : number | null;
  behindBy    : number | null;
  status      : 'no-track' | 'not-scheduled' | 'on-track' | 'behind' | 'ahead' | 'complete';
  nextMeeting : string | null;
  lastCovered : { number: number; title: string; date: Date } | null;
  current     : { _id: Types.ObjectId; number: number; title: string; month: number } | null;
}

@Injectable()
export class SyllabusService {
  constructor(
    @InjectModel(SyllabusTrack.name)   private readonly trackModel:    Model<SyllabusTrackDocument>,
    @InjectModel(SyllabusSession.name) private readonly sessionModel:  Model<SyllabusSessionDocument>,
    @InjectModel(SessionCoverage.name) private readonly coverageModel: Model<SessionCoverageDocument>,
    @InjectModel(StudentNote.name)     private readonly noteModel:     Model<StudentNoteDocument>,
    @InjectModel(CalendarEvent.name)   private readonly eventModel:    Model<CalendarEventDocument>,
    @InjectModel(Circle.name)          private readonly circleModel:   Model<CircleDocument>,
    @InjectModel(Student.name)         private readonly studentModel:  Model<StudentDocument>,
  ) {}

  // ══ Tracks ═════════════════════════════════════════════════════════════════

  async listTracks() {
    const [tracks, sessionCounts, circleCounts] = await Promise.all([
      this.trackModel.find().lean(),
      this.sessionModel.aggregate<{ _id: Types.ObjectId; n: number }>([{ $group: { _id: '$track', n: { $sum: 1 } } }]),
      this.circleModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { track: { $ne: null }, isActive: true } }, { $group: { _id: '$track', n: { $sum: 1 } } },
      ]),
    ]);
    const count = (rows: { _id: Types.ObjectId; n: number }[], id: Types.ObjectId) =>
      rows.find((r) => r._id?.toString() === id.toString())?.n ?? 0;
    return tracks
      .sort((a, b) => AGE_GROUPS.indexOf(a.ageGroup) - AGE_GROUPS.indexOf(b.ageGroup))
      .map((t) => ({ ...t, sessionCount: count(sessionCounts, t._id), circleCount: count(circleCounts, t._id) }));
  }

  async createTrack(dto: CreateTrackDto) {
    const track = await this.trackModel.create({ name: dto.name, ageGroup: dto.ageGroup, description: dto.description ?? '' });
    return { message: 'Track created.', track };
  }

  async updateTrack(id: string, dto: UpdateTrackDto) {
    const track = await this.trackModel.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true }).lean();
    if (!track) throw new NotFoundException('Track not found.');
    return { message: 'Track updated.', track };
  }

  async deleteTrack(id: string) {
    const oid = new Types.ObjectId(id);
    if (await this.circleModel.exists({ track: oid })) {
      throw new BadRequestException('Circles still follow this track. Move them to another track first.');
    }
    const track = await this.trackModel.findByIdAndDelete(oid).lean();
    if (!track) throw new NotFoundException('Track not found.');
    await this.sessionModel.deleteMany({ track: oid });
    return { message: 'Track deleted.' };
  }

  /**
   * Creates any missing age-group tracks, each with a 40-session outline over
   * the 12 monthly themes. Existing tracks and sessions are never touched.
   */
  async setupDefaults() {
    const created: string[] = [];
    for (const ageGroup of AGE_GROUPS) {
      let track = await this.trackModel.findOne({ ageGroup });
      if (!track) {
        track = await this.trackModel.create({ name: TRACK_NAMES[ageGroup], ageGroup });
        created.push(track.name);
      }
      if (await this.sessionModel.exists({ track: track._id })) continue;
      await this.sessionModel.insertMany(defaultPlan().map((p, i) => ({
        track       : track._id,
        number      : i + 1,
        month       : p.month,
        title       : `${p.theme} · Part ${p.part}`,
        objectives  : [],
        parts       : normaliseParts(),
        homeActivity: `Talk together about ${p.theme.toLowerCase()}: ask your child what they learned in the circle this week and share an example from your own life.`,
      })));
    }
    return {
      message: created.length
        ? `Created ${created.length} track${created.length === 1 ? '' : 's'} with a 40-session outline. Edit each session to add the details.`
        : 'All three age-group tracks already exist.',
      tracks: await this.listTracks(),
    };
  }

  // ══ Sessions ═══════════════════════════════════════════════════════════════

  async listSessions(trackId: string) {
    const track = await this.trackModel.findById(trackId).lean();
    if (!track) throw new NotFoundException('Track not found.');
    const sessions = await this.sessionModel.find({ track: track._id }).sort({ number: 1 }).lean();
    return { track, sessions, themes: THEMES };
  }

  async getSession(id: string) {
    const s = await this.sessionModel.findById(id).populate('lesson', 'title pdfUrl videoUrl').lean();
    if (!s) throw new NotFoundException('Session not found.');
    return s;
  }

  async createSession(trackId: string, dto: CreateSessionDto) {
    if (!(await this.trackModel.exists({ _id: new Types.ObjectId(trackId) }))) throw new NotFoundException('Track not found.');
    const session = await this.sessionModel.create({
      track       : new Types.ObjectId(trackId),
      number      : dto.number,
      month       : dto.month,
      title       : dto.title,
      objectives  : dto.objectives ?? [],
      parts       : normaliseParts(dto.parts),
      homeActivity: dto.homeActivity ?? '',
      lesson      : dto.lessonId ? new Types.ObjectId(dto.lessonId) : null,
    });
    return { message: 'Session added.', session };
  }

  async updateSession(id: string, dto: UpdateSessionDto) {
    const s = await this.sessionModel.findById(id);
    if (!s) throw new NotFoundException('Session not found.');
    if (dto.number !== undefined && dto.number !== s.number
      && await this.coverageModel.exists({ session: s._id })) {
      throw new BadRequestException('Circles have already covered this session, so its number can’t change.');
    }
    if (dto.number !== undefined)       s.number       = dto.number;
    if (dto.month !== undefined)        s.month        = dto.month;
    if (dto.title !== undefined)        s.title        = dto.title;
    if (dto.objectives !== undefined)   s.objectives   = dto.objectives;
    if (dto.homeActivity !== undefined) s.homeActivity = dto.homeActivity;
    if (dto.lessonId !== undefined)     s.lesson       = dto.lessonId ? new Types.ObjectId(dto.lessonId) : null;
    if (dto.parts !== undefined)        s.parts        = normaliseParts(dto.parts, s.parts) as any;
    await s.save();
    return { message: 'Session saved.', session: s.toObject() };
  }

  async deleteSession(id: string) {
    const oid = new Types.ObjectId(id);
    if (await this.coverageModel.exists({ session: oid })) {
      throw new BadRequestException('Circles have already covered this session, so it can’t be deleted.');
    }
    const s = await this.sessionModel.findByIdAndDelete(oid).lean();
    if (!s) throw new NotFoundException('Session not found.');
    return { message: 'Session deleted.' };
  }

  // ══ Calendar ═══════════════════════════════════════════════════════════════

  listEvents(from?: string, to?: string) {
    const q: Record<string, unknown> = {};
    if (to)   q.startDate = { $lte: to };
    if (from) q.endDate   = { $gte: from };
    return this.eventModel.find(q).populate('circles', 'name').sort({ startDate: 1 }).lean();
  }

  async createEvent(dto: CreateEventDto) {
    const endDate = dto.endDate ?? dto.startDate;
    if (endDate < dto.startDate) throw new BadRequestException('The end date can’t be before the start date.');
    const event = await this.eventModel.create({
      title          : dto.title,
      type           : dto.type,
      startDate      : dto.startDate,
      endDate,
      circles        : (dto.circleIds ?? []).map((c) => new Types.ObjectId(c)),
      cancelsSessions: dto.cancelsSessions ?? dto.type === 'holiday',
      notes          : dto.notes ?? '',
    });
    return { message: 'Added to the calendar.', event };
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    const e = await this.eventModel.findById(id);
    if (!e) throw new NotFoundException('Event not found.');
    if (dto.title !== undefined)           e.title           = dto.title;
    if (dto.type !== undefined)            e.type            = dto.type as any;
    if (dto.startDate !== undefined)       e.startDate       = dto.startDate;
    if (dto.endDate !== undefined)         e.endDate         = dto.endDate;
    if (dto.circleIds !== undefined)       e.circles         = dto.circleIds.map((c) => new Types.ObjectId(c));
    if (dto.cancelsSessions !== undefined) e.cancelsSessions = dto.cancelsSessions;
    if (dto.notes !== undefined)           e.notes           = dto.notes;
    if (e.endDate < e.startDate) throw new BadRequestException('The end date can’t be before the start date.');
    await e.save();
    return { message: 'Event updated.', event: e.toObject() };
  }

  async deleteEvent(id: string) {
    const e = await this.eventModel.findByIdAndDelete(id).lean();
    if (!e) throw new NotFoundException('Event not found.');
    return { message: 'Event removed.' };
  }

  /** Days each circle doesn't meet, from events that cancel sessions. */
  async closuresByCircle(circleIds: Types.ObjectId[]): Promise<Map<string, Closure[]>> {
    const events = await this.eventModel
      .find({ cancelsSessions: true, $or: [{ circles: { $size: 0 } }, { circles: { $in: circleIds } }] })
      .select('startDate endDate circles').lean();
    const map = new Map<string, Closure[]>();
    for (const id of circleIds) {
      map.set(id.toString(), events
        .filter((e) => !e.circles.length || e.circles.some((c) => c.toString() === id.toString()))
        .map((e) => ({ startDate: e.startDate, endDate: e.endDate })));
    }
    return map;
  }

  /**
   * Upcoming dated items for these circles: each scheduled meeting (with the
   * syllabus session it should cover) and any calendar events that apply.
   */
  async calendarFor(circles: (Circle & { _id: Types.ObjectId })[], from: string, to: string) {
    const ids = circles.map((c) => c._id);
    const [closures, events, progress] = await Promise.all([
      this.closuresByCircle(ids),
      this.eventModel
        .find({ startDate: { $lte: to }, endDate: { $gte: from }, $or: [{ circles: { $size: 0 } }, { circles: { $in: ids } }] })
        .populate('circles', 'name').sort({ startDate: 1 }).lean(),
      Promise.all(circles.map((c) => this.upcomingSessions(c, 12))),
    ]);

    const items: CalendarItem[] = [];
    circles.forEach((c, i) => {
      if (c.meetingDay == null) return;
      const start = c.startDate && c.startDate > from ? c.startDate : from;
      const queue = [...progress[i]];
      for (const date of meetingDates(c.meetingDay, start, to, closures.get(c._id.toString()) ?? [])) {
        const s = queue.shift();
        items.push({
          type: 'session', date, time: c.meetingTime, circleId: c._id, circleName: c.name,
          sessionNumber: s?.number ?? null, title: s ? s.title : 'Circle meeting',
        });
      }
    });
    for (const e of events) {
      items.push({
        type: e.type, date: e.startDate, endDate: e.endDate, title: e.title, notes: e.notes,
        cancelsSessions: e.cancelsSessions,
        circles: e.circles.length ? (e.circles as any[]).map((c) => c.name) : 'all',
      });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }

  /** The next uncovered sessions of the circle's track, in order. */
  private async upcomingSessions(c: { _id: Types.ObjectId; track?: Types.ObjectId | null }, limit: number) {
    if (!c.track) return [];
    const done = await this.coverageModel.find({ circle: c._id, completed: true }).distinct('session');
    return this.sessionModel.find({ track: c.track, _id: { $nin: done } })
      .select('number title month').sort({ number: 1 }).limit(limit).lean();
  }

  async calendarForRequester(user: Requester, from?: string, to?: string, circleId?: string) {
    const start = from ?? pkToday();
    const end   = to ?? addDays(start, 56);
    if (end < start || addDays(start, 366) < end) throw new BadRequestException('Choose a range of up to a year.');
    const q: Record<string, unknown> = { isActive: true };
    if (user.role === UserRole.MURABBI) q.murabbi = new Types.ObjectId(user.id);
    if (circleId) q._id = new Types.ObjectId(circleId);
    const circles = await this.circleModel.find(q).lean();
    return { from: start, to: end, items: await this.calendarFor(circles as any, start, end) };
  }

  // ══ Progress ═══════════════════════════════════════════════════════════════

  async progressFor(circle: Circle & { _id: Types.ObjectId }, closures: Closure[]): Promise<ProgressSummary> {
    const schedule = { meetingDay: circle.meetingDay, meetingTime: circle.meetingTime, startDate: circle.startDate };
    const nextMeet = nextMeeting(schedule, closures);
    if (!circle.track) {
      return { total: 0, covered: 0, partial: 0, expected: null, behindBy: null, status: 'no-track', nextMeeting: nextMeet, lastCovered: null, current: null };
    }
    const [sessions, coverage] = await Promise.all([
      this.sessionModel.find({ track: circle.track }).select('number title month').sort({ number: 1 }).lean(),
      this.coverageModel.find({ circle: circle._id }).select('session number completed date').sort({ date: -1 }).lean(),
    ]);
    const completedIds = new Set(coverage.filter((c) => c.completed).map((c) => c.session.toString()));
    const covered = completedIds.size;
    const partial = coverage.filter((c) => !c.completed).length;
    const current = sessions.find((s) => !completedIds.has(s._id.toString())) ?? null;
    const last = coverage.find((c) => c.completed);
    const lastSession = last && sessions.find((s) => s._id.toString() === last.session.toString());
    const expectedRaw = expectedSessions(schedule, closures);
    const expected = expectedRaw === null ? null : Math.min(expectedRaw, sessions.length);
    const behindBy = expected === null ? null : expected - covered;

    let status: ProgressSummary['status'];
    if (sessions.length && covered >= sessions.length) status = 'complete';
    else if (expected === null) status = 'not-scheduled';
    else if (behindBy >= 2) status = 'behind';
    else if (behindBy <= -1) status = 'ahead';
    else status = 'on-track';

    return {
      total: sessions.length, covered, partial, expected, behindBy, status, nextMeeting: nextMeet,
      lastCovered: lastSession ? { number: lastSession.number, title: lastSession.title, date: last.date } : null,
      current: current ? { _id: current._id, number: current.number, title: current.title, month: current.month } : null,
    };
  }

  /** Admin: every active circle with its syllabus progress. */
  async progressOverview() {
    const circles = await this.circleModel.find({ isActive: true })
      .populate('murabbi', 'fullName').populate('track', 'name ageGroup').populate('neighbourhood', 'name').lean();
    const closures = await this.closuresByCircle(circles.map((c) => c._id));
    const rows = await Promise.all(circles.map(async (c) => ({
      circle  : { _id: c._id, name: c.name, meetingDay: c.meetingDay, meetingTime: c.meetingTime, startDate: c.startDate, neighbourhood: c.neighbourhood },
      murabbi : c.murabbi,
      track   : c.track,
      progress: await this.progressFor({ ...c, track: (c.track as any)?._id ?? null } as any, closures.get(c._id.toString()) ?? []),
    })));
    const by = (s: string) => rows.filter((r) => r.progress.status === s).length;
    return {
      circles: rows,
      stats: {
        circles      : rows.length,
        onTrack      : by('on-track') + by('ahead') + by('complete'),
        behind       : by('behind'),
        notScheduled : by('not-scheduled'),
        noTrack      : by('no-track'),
        sessionsCovered: rows.reduce((s, r) => s + r.progress.covered, 0),
      },
    };
  }

  private async loadCircleFor(user: Requester, circleId: string) {
    const circle = await this.circleModel.findById(circleId)
      .populate('track', 'name ageGroup').populate('murabbi', 'fullName').lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    if (user.role === UserRole.MURABBI && (circle.murabbi as any)?._id?.toString() !== user.id) {
      throw new ForbiddenException('This circle is not assigned to you.');
    }
    return circle;
  }

  /** Every session of the circle's track with what was covered and when. */
  async circleDetail(user: Requester, circleId: string) {
    const circle = await this.loadCircleFor(user, circleId);
    const trackId = (circle.track as any)?._id ?? null;
    const closures = (await this.closuresByCircle([circle._id])).get(circle._id.toString()) ?? [];
    const progress = await this.progressFor({ ...circle, track: trackId } as any, closures);
    if (!trackId) return { circle, progress, sessions: [] };
    const [sessions, coverage] = await Promise.all([
      this.sessionModel.find({ track: trackId }).sort({ number: 1 }).lean(),
      this.coverageModel.find({ circle: circle._id }).populate('murabbi', 'fullName').lean(),
    ]);
    return {
      circle, progress,
      sessions: sessions.map((s) => {
        const c = coverage.find((x) => x.session.toString() === s._id.toString());
        return {
          ...s,
          coverage: c ? { _id: c._id, date: c.date, completed: c.completed, parts: c.parts, notes: c.notes, by: c.murabbi } : null,
          state: c ? (c.completed ? 'covered' : 'partial') : 'remaining',
        };
      }),
    };
  }

  // ══ Murabbi agenda ═════════════════════════════════════════════════════════

  /** This week's session for each of the murabbi's circles, with its checklist. */
  async myAgenda(murabbiId: string) {
    const circles = await this.circleModel.find({ murabbi: new Types.ObjectId(murabbiId), isActive: true })
      .populate('track', 'name ageGroup').populate('neighbourhood', 'name').sort({ name: 1 }).lean();
    const closures = await this.closuresByCircle(circles.map((c) => c._id));

    return Promise.all(circles.map(async (c) => {
      const trackId = (c.track as any)?._id ?? null;
      const progress = await this.progressFor({ ...c, track: trackId } as any, closures.get(c._id.toString()) ?? []);
      const session = progress.current
        ? await this.sessionModel.findById(progress.current._id).populate('lesson', 'title pdfUrl videoUrl').lean()
        : null;
      const [coverage, students, notes, recent] = await Promise.all([
        session ? this.coverageModel.findOne({ circle: c._id, session: session._id }).lean() : null,
        this.studentModel.find({ circle: c._id, isActive: true }).select('fullName').sort({ fullName: 1 }).lean(),
        session ? this.noteModel.find({ circle: c._id, session: session._id }).select('student note createdAt').lean() : [],
        this.coverageModel.find({ circle: c._id, completed: true }).sort({ date: -1 }).limit(3)
          .populate('session', 'number title').select('session date notes').lean(),
      ]);
      return {
        circle  : { _id: c._id, name: c.name, meetingDay: c.meetingDay, meetingTime: c.meetingTime, neighbourhood: c.neighbourhood },
        track   : c.track,
        progress,
        session : session && { ...session, theme: THEMES[session.month - 1] },
        coverage,
        students,
        notes,
        recent,
      };
    }));
  }

  async recordCoverage(user: Requester, dto: RecordCoverageDto) {
    const circle = await this.loadCircleFor(user, dto.circleId);
    const trackId = (circle.track as any)?._id;
    if (!trackId) throw new BadRequestException('This circle has no syllabus track yet. Ask an admin to assign one.');
    const session = await this.sessionModel.findById(dto.sessionId).lean();
    if (!session || session.track.toString() !== trackId.toString()) {
      throw new BadRequestException('That session isn’t part of this circle’s syllabus.');
    }
    const date = dto.date ?? pkToday();
    if (date > pkToday()) throw new BadRequestException('You can only record sessions that have already happened.');
    const parts = PART_KEYS.map((key) => ({ key, done: dto.partsDone.includes(key) }));
    const completed = dto.completed ?? parts.every((p) => p.done);
    const coverage = await this.coverageModel.findOneAndUpdate(
      { circle: circle._id, session: session._id },
      {
        $set: {
          number : session.number,
          murabbi: (circle.murabbi as any)._id,
          date   : pkInstant(date, circle.meetingTime ?? '00:00'),
          parts, completed,
          notes  : dto.notes ?? '',
        },
      },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    return {
      message: completed ? `Session ${session.number} marked as covered.` : `Progress on session ${session.number} saved.`,
      coverage,
    };
  }

  async deleteCoverage(user: Requester, id: string) {
    const c = await this.coverageModel.findById(id).lean();
    if (!c) throw new NotFoundException('Record not found.');
    await this.loadCircleFor(user, c.circle.toString());
    await this.coverageModel.deleteOne({ _id: c._id });
    return { message: 'Coverage record removed.' };
  }

  // ══ Notes to families ══════════════════════════════════════════════════════

  async addNote(user: Requester, dto: StudentNoteDto) {
    const student = await this.studentModel.findById(dto.studentId).select('circle murabbi isActive').lean();
    if (!student?.circle) throw new NotFoundException('Student not found in a circle.');
    await this.loadCircleFor(user, student.circle.toString());
    const note = await this.noteModel.create({
      student: student._id,
      circle : student.circle,
      author : new Types.ObjectId(user.id),
      session: dto.sessionId ? new Types.ObjectId(dto.sessionId) : null,
      note   : dto.note,
    });
    return { message: 'Note shared with the family.', note };
  }

  async listNotes(user: Requester, studentId: string) {
    const student = await this.studentModel.findById(studentId).select('circle').lean();
    if (!student) throw new NotFoundException('Student not found.');
    if (student.circle) await this.loadCircleFor(user, student.circle.toString());
    else if (user.role !== UserRole.ADMIN) throw new ForbiddenException('This student is not assigned to you.');
    return this.noteModel.find({ student: student._id }).populate('author', 'fullName').sort({ createdAt: -1 }).lean();
  }

  async deleteNote(user: Requester, id: string) {
    const n = await this.noteModel.findById(id).lean();
    if (!n) throw new NotFoundException('Note not found.');
    if (user.role !== UserRole.ADMIN && n.author.toString() !== user.id) {
      throw new ForbiddenException('You can only remove your own notes.');
    }
    await this.noteModel.deleteOne({ _id: n._id });
    return { message: 'Note removed.' };
  }
}
