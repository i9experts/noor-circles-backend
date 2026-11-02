import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Cluster, ClusterDocument } from '../cluster/cluster.schema';
import { EmailLog, EmailLogDocument } from '../email/email.schema';
import { EmailService } from '../email/email.service';
import {
  Course, CourseAssignment, CourseAssignmentDocument, CourseDocument, CourseLesson, CourseLessonDocument, CourseReflection,
  CourseReflectionDocument, LessonProgress, LessonProgressDocument, MurabbiPoint, MurabbiPointDocument,
} from '../course/course.schema';
import { ASAAS_KEY } from '../course/course.service';
import { JournalEntry, JournalEntryDocument, JournalMoment, JournalMomentDocument } from './journal.schema';
import { JOURNAL_PAGES, JOURNAL_POINTS, JournalPage, MOMENTS_LESSON } from './journal.pages';
import { AddMomentDto, JournalReminderDto } from './journal.dto';

const MAX_ANSWER = 3000;
const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** A page is done once every writing box on it has something in it. */
function isDone(page: JournalPage, answers: Record<string, string>) {
  return page.fields.every((f) => !!answers[f.key]?.trim());
}

/**
 * The Noor Journal. Pages follow the Asaas training's writing activities and
 * open once their lesson has been heard. Murabbis write it; admins can read
 * every page and moment to support them (supervisors and other murabbis
 * cannot), see insights across all murabbis, send reminders and feature
 * moments (by name only with the murabbi's consent).
 */
@Injectable()
export class JournalService {
  constructor(
    @InjectModel(JournalEntry.name)     private readonly entryModel:      Model<JournalEntryDocument>,
    @InjectModel(JournalMoment.name)    private readonly momentModel:     Model<JournalMomentDocument>,
    @InjectModel(Course.name)           private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseLesson.name)     private readonly lessonModel:     Model<CourseLessonDocument>,
    @InjectModel(CourseAssignment.name) private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(LessonProgress.name)   private readonly progressModel:   Model<LessonProgressDocument>,
    @InjectModel(CourseReflection.name) private readonly reflectionModel: Model<CourseReflectionDocument>,
    @InjectModel(MurabbiPoint.name)     private readonly pointModel:      Model<MurabbiPointDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    @InjectModel(Circle.name)           private readonly circleModel:     Model<CircleDocument>,
    @InjectModel(Cluster.name)          private readonly clusterModel:    Model<ClusterDocument>,
    @InjectModel(EmailLog.name)         private readonly emailLogModel:   Model<EmailLogDocument>,
    private readonly email: EmailService,
  ) {}

  /** The Asaas course, its lessons by code, and which of them this murabbi has heard. */
  private async lessonState(userId: string) {
    const course = await this.courseModel.findOne({ key: ASAAS_KEY }).select('_id reflectionPrompt reflectionMinChars').lean();
    if (!course) return { course: null, assigned: false, byCode: new Map<string, { _id: Types.ObjectId; title: string }>(), heard: new Set<string>() };
    const uid = new Types.ObjectId(userId);
    const codes = [...JOURNAL_PAGES.map((p) => p.lessonCode), MOMENTS_LESSON];
    const [assigned, lessons, done] = await Promise.all([
      this.assignmentModel.exists({ course: course._id, user: uid }),
      this.lessonModel.find({ course: course._id, code: { $in: codes } }).select('code title').lean(),
      this.progressModel.find({ course: course._id, user: uid, completed: true }).select('lesson').lean(),
    ]);
    const doneIds = new Set(done.map((d) => String(d.lesson)));
    const byCode = new Map(lessons.map((l) => [l.code, { _id: l._id, title: l.title }]));
    const heard = new Set(lessons.filter((l) => doneIds.has(String(l._id))).map((l) => l.code));
    return { course, assigned: !!assigned, byCode, heard };
  }

  async journal(userId: string) {
    const { course, assigned, byCode, heard } = await this.lessonState(userId);
    const uid = new Types.ObjectId(userId);
    const [entries, reflection, moments, user] = await Promise.all([
      this.entryModel.find({ user: uid }).lean(),
      course ? this.reflectionModel.findOne({ course: course._id, user: uid }).select('text status feedback submittedAt').lean() : null,
      this.momentModel.find({ user: uid }).populate('circle', 'name').sort({ date: -1, createdAt: -1 }).limit(500).lean(),
      this.userModel.findById(uid).select('fullName').lean(),
    ]);
    const pages = JOURNAL_PAGES.map((p) => {
      const e = entries.find((x) => x.page === p.key);
      const lesson = byCode.get(p.lessonCode);
      const base = { ...p, lesson: lesson ? { _id: lesson._id, code: p.lessonCode, title: lesson.title } : null, open: heard.has(p.lessonCode) };
      if (p.kind === 'reflection') {
        return {
          ...base, prompt: course?.reflectionPrompt ?? '', minChars: course?.reflectionMinChars ?? 0,
          reflection: reflection ?? null, done: !!reflection, updatedAt: reflection?.submittedAt ?? null,
        };
      }
      return { ...base, answers: e?.answers ?? {}, done: !!e?.done, updatedAt: (e as any)?.updatedAt ?? null };
    });
    return {
      owner: user?.fullName ?? '',
      assigned,
      pages,
      progress: { done: pages.filter((p) => p.done).length, total: pages.length },
      moments: { open: heard.has(MOMENTS_LESSON), lesson: byCode.get(MOMENTS_LESSON) ?? null, list: moments },
    };
  }

  async save(userId: string, pageKey: string, raw: Record<string, unknown>) {
    const page = JOURNAL_PAGES.find((p) => p.key === pageKey);
    if (!page) throw new NotFoundException('Journal page not found.');
    if (page.kind === 'reflection') throw new BadRequestException('The final reflection is sent from the training page.');
    const { heard } = await this.lessonState(userId);
    if (!heard.has(page.lessonCode)) throw new ForbiddenException('Listen to this part of the training first; the page opens after it.');
    const answers: Record<string, string> = {};
    for (const f of page.fields) {
      const v = raw?.[f.key];
      if (typeof v !== 'string' || !v.trim()) continue;
      if (f.kind === 'choice' && !f.options?.some((o) => o.value === v)) throw new BadRequestException(`Choose one of the options for “${f.labelEn}”.`);
      answers[f.key] = v.slice(0, MAX_ANSWER);
    }
    const done = isDone(page, answers);
    const uid = new Types.ObjectId(userId);
    await this.entryModel.updateOne({ user: uid, page: page.key }, { $set: { answers, done } }, { upsert: true });
    let points = 0;
    if (done) {
      // Once per page (the unique index stops a second award).
      points = await this.pointModel.create({ user: uid, points: JOURNAL_POINTS, reason: 'journal', ref: page.key, label: `Noor Journal: ${page.titleEn}` })
        .then(() => JOURNAL_POINTS).catch(() => 0);
    }
    return { message: done ? 'Saved. This page is complete.' : 'Saved.', done, points };
  }

  async addMoment(userId: string, dto: AddMomentDto) {
    const { heard } = await this.lessonState(userId);
    if (!heard.has(MOMENTS_LESSON)) throw new ForbiddenException('Moments of light open with Module 6, lesson M6-02.');
    let circle: Types.ObjectId | null = null;
    if (dto.circleId) {
      const c = await this.circleModel.findOne({ _id: new Types.ObjectId(dto.circleId), murabbi: new Types.ObjectId(userId) }).select('_id').lean();
      if (!c) throw new NotFoundException('That isn’t one of your circles.');
      circle = c._id;
    }
    const date = dto.date ?? pkToday();
    if (date > pkToday()) throw new BadRequestException('A moment can’t be in the future.');
    const moment = await this.momentModel.create({ user: new Types.ObjectId(userId), date, text: dto.text.trim(), circle, shareName: !!dto.shareName });
    return { message: 'Moment saved. May Allah keep it as light for you.', moment };
  }

  async deleteMoment(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const r = await this.momentModel.deleteOne({ _id: new Types.ObjectId(id), user: new Types.ObjectId(userId) });
    if (!r.deletedCount) throw new NotFoundException('Moment not found.');
    return { message: 'Moment removed.' };
  }

  async updateMoment(userId: string, id: string, shareName: boolean) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const m = await this.momentModel.findOneAndUpdate({ _id: new Types.ObjectId(id), user: new Types.ObjectId(userId) }, { $set: { shareName } }, { new: true }).lean();
    if (!m) throw new NotFoundException('Moment not found.');
    return { message: shareName ? 'Your name may be shown if the team features this moment.' : 'Your name won’t be shown with this moment.', moment: m };
  }

  // ══ Admins ═════════════════════════════════════════════════════════════════

  /** Each murabbi's circles and the clusters they sit in. */
  private async placesOf(userIds: Types.ObjectId[]) {
    const [circles, clusters] = await Promise.all([
      this.circleModel.find({ murabbi: { $in: userIds } }).select('name murabbi neighbourhood').lean(),
      this.clusterModel.find().select('name neighbourhoods').lean(),
    ]);
    const clusterOf = new Map<string, { _id: Types.ObjectId; name: string }>();
    for (const c of clusters) for (const n of c.neighbourhoods ?? []) clusterOf.set(String(n), { _id: c._id, name: c.name });
    const byUser = new Map<string, { circles: string[]; clusters: { _id: Types.ObjectId; name: string }[] }>();
    const circleCluster = new Map<string, { _id: Types.ObjectId; name: string } | null>();
    for (const c of circles) {
      const k = String((c as any).murabbi);
      const row = byUser.get(k) ?? { circles: [], clusters: [] };
      row.circles.push(c.name);
      const cl = clusterOf.get(String(c.neighbourhood)) ?? null;
      circleCluster.set(String(c._id), cl);
      if (cl && !row.clusters.some((x) => String(x._id) === String(cl._id))) row.clusters.push(cl);
      byUser.set(k, row);
    }
    return { byUser, circleCluster, clusters: clusters.map((c) => ({ _id: c._id, name: c.name })) };
  }

  /** Insights across every murabbi given the Asaas training: who is writing, where they stop, moments over time. */
  async insights() {
    const course = await this.courseModel.findOne({ key: ASAAS_KEY }).select('_id').lean();
    if (!course) return { summary: null, pages: [], murabbis: [], months: [], clusters: [] };
    const assignments = await this.assignmentModel.find({ course: course._id }).select('user').lean();
    const ids = assignments.map((a) => a.user);
    const codes = JOURNAL_PAGES.map((p) => p.lessonCode);
    const [users, lessons, entries, moments, reflections, reminders, places] = await Promise.all([
      this.userModel.find({ _id: { $in: ids }, role: UserRole.MURABBI }).select('fullName email isActive').lean(),
      this.lessonModel.find({ course: course._id, code: { $in: [...codes, MOMENTS_LESSON] } }).select('code').lean(),
      this.entryModel.find({ user: { $in: ids } }).select('user page done updatedAt').lean(),
      this.momentModel.find({ user: { $in: ids } }).select('user date circle createdAt featured').lean(),
      this.reflectionModel.find({ course: course._id, user: { $in: ids } }).select('user status submittedAt').lean(),
      this.emailLogModel.aggregate([{ $match: { kind: 'journal.reminder', user: { $in: ids } } }, { $group: { _id: '$user', last: { $max: '$createdAt' }, n: { $sum: 1 } } }]),
      this.placesOf(ids),
    ]);
    const codeOf = new Map(lessons.map((l) => [String(l._id), l.code]));
    const heardRows = await this.progressModel.find({ course: course._id, user: { $in: ids }, completed: true, lesson: { $in: lessons.map((l) => l._id) } }).select('user lesson').lean();
    const heard = new Map<string, Set<string>>();
    for (const h of heardRows) {
      const k = String(h.user);
      heard.set(k, (heard.get(k) ?? new Set()).add(codeOf.get(String(h.lesson)) ?? ''));
    }
    const month = pkToday().slice(0, 7);
    const remindedBy = new Map<string, any>(reminders.map((r) => [String(r._id), r]));
    const reflBy = new Map(reflections.map((r) => [String(r.user), r]));

    const rows = users.map((u) => {
      const k = String(u._id);
      const h = heard.get(k) ?? new Set<string>();
      const mine = entries.filter((e) => String(e.user) === k);
      const refl = reflBy.get(k);
      const pageState = JOURNAL_PAGES.map((p) => {
        const open = h.has(p.lessonCode);
        if (p.kind === 'reflection') return { key: p.key, open, done: !!refl, started: !!refl };
        const e = mine.find((x) => x.page === p.key);
        return { key: p.key, open, done: !!e?.done, started: !!e && !e.done };
      });
      const done = pageState.filter((s) => s.done).length;
      const opened = pageState.filter((s) => s.open).length;
      const waiting = pageState.filter((s) => s.open && !s.done).length;
      const myMoments = moments.filter((m) => String(m.user) === k);
      const last = [...mine.map((e) => (e as any).updatedAt), ...myMoments.map((m) => (m as any).createdAt), refl?.submittedAt]
        .filter(Boolean).map((d) => new Date(d).getTime()).sort((a, b) => b - a)[0];
      const status = done === JOURNAL_PAGES.length ? 'complete'
        : done === 0 && !myMoments.length ? (opened ? 'not-started' : 'not-open')
        : waiting >= 2 ? 'behind' : 'on-track';
      const place = places.byUser.get(k);
      return {
        user: { _id: u._id, fullName: u.fullName, email: u.email },
        circles: place?.circles ?? [], clusters: (place?.clusters ?? []).map((c) => c.name),
        pagesDone: done, pagesOpen: opened, waiting, totalPages: JOURNAL_PAGES.length,
        nextPage: JOURNAL_PAGES.find((p, i) => pageState[i].open && !pageState[i].done)?.titleEn ?? null,
        pages: pageState,
        moments: myMoments.length, momentsThisMonth: myMoments.filter((m) => m.date.startsWith(month)).length,
        reflection: refl ? refl.status : null,
        lastWrittenAt: last ? new Date(last) : null,
        lastReminderAt: remindedBy.get(k)?.last ?? null, reminders: remindedBy.get(k)?.n ?? 0,
        status,
      };
    }).sort((a, b) => b.pagesDone - a.pagesDone || a.user.fullName.localeCompare(b.user.fullName));

    const pages = JOURNAL_PAGES.map((p, i) => ({
      key: p.key, number: p.number, titleEn: p.titleEn, titleUr: p.titleUr, lessonCode: p.lessonCode,
      open: rows.filter((r) => r.pages[i].open).length,
      started: rows.filter((r) => r.pages[i].started && !r.pages[i].done).length,
      done: rows.filter((r) => r.pages[i].done).length,
      waiting: rows.filter((r) => r.pages[i].open && !r.pages[i].done).length,
    }));

    // Moments per month for the last six months, overall and per cluster.
    const months: string[] = [];
    const d0 = new Date(`${month}-01T00:00:00Z`);
    for (let i = 5; i >= 0; i--) months.push(new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    const byMonth = months.map((m) => {
      const inMonth = moments.filter((x) => x.date.startsWith(m));
      const clusters: Record<string, number> = {};
      for (const x of inMonth) {
        const cl = x.circle ? places.circleCluster.get(String(x.circle)) : null;
        const name = cl?.name ?? 'No cluster';
        clusters[name] = (clusters[name] ?? 0) + 1;
      }
      return { month: m, moments: inMonth.length, clusters };
    });

    const writing = rows.filter((r) => r.pagesDone > 0).length;
    return {
      summary: {
        murabbis: rows.length, writing, notStarted: rows.filter((r) => r.status === 'not-started').length,
        behind: rows.filter((r) => r.status === 'behind').length, complete: rows.filter((r) => r.status === 'complete').length,
        pagesDone: rows.reduce((s, r) => s + r.pagesDone, 0), totalPages: JOURNAL_PAGES.length,
        avgPages: rows.length ? Math.round((rows.reduce((s, r) => s + r.pagesDone, 0) / rows.length) * 10) / 10 : 0,
        moments: moments.length, momentsThisMonth: moments.filter((m) => m.date.startsWith(month)).length,
        featured: moments.filter((m) => m.featured).length,
      },
      pages, murabbis: rows, months: byMonth, clusters: places.clusters.map((c) => c.name),
    };
  }

  /** One murabbi's whole journal, for an admin to read. */
  async murabbiJournal(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid id.');
    const u = await this.userModel.findOne({ _id: userId, role: UserRole.MURABBI }).select('fullName email').lean();
    if (!u) throw new NotFoundException('Murabbi not found.');
    const j = await this.journal(userId);
    return { ...j, user: { _id: u._id, fullName: u.fullName, email: u.email } };
  }

  /** "Send reminder": one email per murabbi per day at most. */
  async remind(dto: JournalReminderDto) {
    const ids = [...new Set(dto.userIds)].map((x) => new Types.ObjectId(x));
    const users = await this.userModel.find({ _id: { $in: ids }, role: UserRole.MURABBI }).select('fullName email').lean();
    const today = pkToday();
    let sent = 0, already = 0, skipped = 0;
    for (const u of users) {
      const j = await this.journal(String(u._id));
      const waiting = j.pages.filter((p) => p.open && !p.done);
      const r = await this.email.queue('journal.reminder', { email: u.email, name: u.fullName, userId: u._id }, {
        done: j.progress.done, total: j.progress.total, waiting: waiting.length, next: waiting[0]?.titleEn ?? '',
        note: dto.note?.trim() ?? '', url: this.email.link('/murabbi'),
      }, { dedupeKey: `journal-reminder:${u._id}:${today}` });
      if (r === 'queued') sent++; else if (r === 'duplicate') already++; else skipped++;
    }
    const parts = [`${sent} reminder${sent === 1 ? '' : 's'} sent`];
    if (already) parts.push(`${already} already reminded today`);
    if (skipped) parts.push(`${skipped} not sent (no email or unsubscribed)`);
    return { message: parts.join(' · ') + '.', sent, already, skipped };
  }

  /** Every moment of light, newest first, with who wrote it and where. */
  async allMoments(featuredOnly = false) {
    const list = await this.momentModel.find(featuredOnly ? { featured: true } : {})
      .populate('user', 'fullName').populate('circle', 'name neighbourhood').sort({ date: -1, createdAt: -1 }).limit(1000).lean();
    const { circleCluster } = await this.placesOf([...new Set(list.map((m) => String((m.user as any)?._id)))].map((x) => new Types.ObjectId(x)));
    return list.map((m: any) => {
      const cluster = m.circle ? circleCluster.get(String(m.circle._id))?.name ?? null : null;
      const where = m.circle?.name ? `${m.circle.name}${cluster ? `, ${cluster}` : ''}` : cluster ?? '';
      return {
        _id: m._id, date: m.date, text: m.text, featured: !!m.featured, featuredAt: m.featuredAt ?? null, shareName: !!m.shareName,
        murabbi: m.user ? { _id: m.user._id, fullName: m.user.fullName } : null,
        circle: m.circle?.name ?? null, cluster,
        // What a newsletter may print: the name only with consent.
        byline: m.shareName && m.user ? `${m.user.fullName}${where ? `, ${where}` : ''}` : `A Noor Circles murabbi${where ? `, ${where}` : ''}`,
      };
    });
  }

  async feature(id: string, featured: boolean) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const m = await this.momentModel.findByIdAndUpdate(id, { $set: { featured, featuredAt: featured ? new Date() : null } }, { new: true }).lean();
    if (!m) throw new NotFoundException('Moment not found.');
    return { message: featured ? 'Moment featured.' : 'Removed from featured.', featured };
  }

  /** Admins: how far each murabbi has got (the Journal column). */
  async progress() {
    const course = await this.courseModel.findOne({ key: ASAAS_KEY }).select('_id').lean();
    const murabbis = await this.userModel.find({ role: UserRole.MURABBI }).select('fullName email').lean();
    const ids = murabbis.map((m) => m._id);
    const [entries, moments, reflections] = await Promise.all([
      this.entryModel.aggregate([{ $match: { user: { $in: ids }, done: true } }, { $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$updatedAt' } } }]),
      this.momentModel.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$createdAt' } } }]),
      course ? this.reflectionModel.find({ course: course._id, user: { $in: ids } }).select('user').lean() : [],
    ]);
    const by = (rows: any[]) => new Map<string, any>(rows.map((r) => [String(r._id), r]));
    const e = by(entries), m = by(moments);
    const refl = new Set(reflections.map((r) => String(r.user)));
    return murabbis.map((u) => {
      const id = String(u._id);
      const last = [e.get(id)?.last, m.get(id)?.last].filter(Boolean).sort().pop() ?? null;
      return {
        user: { _id: u._id, fullName: u.fullName, email: u.email },
        pagesDone: (e.get(id)?.n ?? 0) + (refl.has(id) ? 1 : 0), totalPages: JOURNAL_PAGES.length,
        moments: m.get(id)?.n ?? 0, lastWrittenAt: last,
      };
    }).sort((a, b) => b.pagesDone - a.pagesDone || a.user.fullName.localeCompare(b.user.fullName));
  }
}
