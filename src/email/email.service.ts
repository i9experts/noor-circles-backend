import {
  BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { MailService } from '../mail/mail.service';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Interest, InterestDocument } from '../interest/interest.schema';
import { Course, CourseAssignment, CourseAssignmentDocument, CourseDocument, LessonProgress, LessonProgressDocument } from '../course/course.schema';
import {
  AudienceType, EmailCampaign, EmailCampaignDocument, EmailLog, EmailLogDocument, EmailPreference,
  EmailPreferenceDocument, OPTIONAL_CATEGORIES, OptionalCategory,
} from './email.schema';
import { TemplateData, render } from './email.templates';
import { CampaignDto, AudienceDto } from './email.dto';

/** Which kinds people can switch off (everything else always goes). */
const CATEGORY: Record<string, OptionalCategory> = {
  'training.reminder': 'training-reminders',
  campaign: 'announcements',
};

const MAX_ATTEMPTS = 3;
const TICK_MS = 15_000;
const ASAAS_KEY = 'asaas-tier1';

export interface Recipient { email: string | null | undefined; name?: string; userId?: string | Types.ObjectId | null }
interface QueueOptions {
  dedupeKey?: string;
  campaign?: Types.ObjectId;
  attachment?: EmailLog['attachment'];
  sendAfter?: Date;
  /** Start sending right away (default). Bulk callers queue everything, then tick once. */
  kick?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * All outgoing email except sign-in codes. Emails are rendered and saved to
 * the log first, then sent one at a time (MAIL_RATE_MS apart, at most
 * MAIL_DAILY_LIMIT a day) so the Hostinger mailbox stays within its limits
 * and nothing is lost on a restart. Failed sends are retried twice.
 */
@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  readonly portalUrl: string;
  readonly supportEmail: string;
  private readonly secret: string;
  private readonly rateMs: number;
  private readonly dailyLimit: number;
  private readonly isTest: boolean;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectModel(EmailLog.name)         private readonly logModel:        Model<EmailLogDocument>,
    @InjectModel(EmailPreference.name)  private readonly prefModel:       Model<EmailPreferenceDocument>,
    @InjectModel(EmailCampaign.name)    private readonly campaignModel:   Model<EmailCampaignDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    @InjectModel(Parent.name)           private readonly parentModel:     Model<ParentDocument>,
    @InjectModel(Student.name)          private readonly studentModel:    Model<StudentDocument>,
    @InjectModel(Circle.name)           private readonly circleModel:     Model<CircleDocument>,
    @InjectModel(Course.name)           private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseAssignment.name) private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(LessonProgress.name)   private readonly progressModel:   Model<LessonProgressDocument>,
    @InjectModel(Interest.name)         private readonly interestModel:   Model<InterestDocument>,
    private readonly mail: MailService,
    private readonly moduleRef: ModuleRef,
    config: ConfigService,
  ) {
    this.portalUrl = (config.get<string>('PORTAL_URL')
      || (config.get<string>('FRONTEND_URL') || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, '');
    const mailUser = config.get<string>('MAIL_USER') ?? '';
    this.supportEmail = config.get<string>('MAIL_REPLY_TO') || (mailUser.includes('@') ? mailUser : 'support@noorcircles.com');
    this.secret = createHmac('sha256', config.getOrThrow<string>('JWT_ACCESS_SECRET')).update('email-preferences').digest('hex');
    this.isTest = config.get('NODE_ENV') === 'test';
    this.rateMs = Number(config.get('MAIL_RATE_MS') ?? (this.isTest ? 0 : 2000));
    this.dailyLimit = Number(config.get('MAIL_DAILY_LIMIT') ?? 800);
  }

  onModuleInit() {
    // Emails left "sending" by a crash or redeploy go back in the queue.
    this.logModel.updateMany({ status: 'sending', updatedAt: { $lt: new Date(Date.now() - 10 * 60_000) } }, { $set: { status: 'queued' } }).catch(() => {});
    if (!this.isTest) {
      this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
      this.timer.unref?.();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  link(path: string) {
    return `${this.portalUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // ══ Queueing ══════════════════════════════════════════════════════════════

  /**
   * Renders and queues one email. Never throws (email must not break the
   * action that triggered it). Returns what happened.
   */
  async queue(kind: string, to: Recipient, data: TemplateData, opts: QueueOptions = {}): Promise<'queued' | 'skipped' | 'duplicate' | 'error'> {
    try {
      const email = to.email?.trim().toLowerCase();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) return 'skipped';
      const category = CATEGORY[kind] ?? null;
      const optedOut = category && await this.prefModel.exists({ email, optOut: category });
      const unsubscribeUrl = category ? this.link(`/email/unsubscribe?t=${encodeURIComponent(this.token(email, category))}`) : undefined;
      const r = render(kind, { ...data, name: data.name ?? to.name ?? '' }, { portalUrl: this.portalUrl, supportEmail: this.supportEmail, unsubscribeUrl });
      await this.logModel.create({
        kind, category, to: email, toName: to.name ?? '', user: to.userId ? new Types.ObjectId(String(to.userId)) : null,
        subject: r.subject, html: r.html, text: r.text,
        status: optedOut ? 'skipped' : 'queued', error: optedOut ? 'Unsubscribed from these emails' : '',
        attachment: opts.attachment ?? null, campaign: opts.campaign ?? null, dedupeKey: opts.dedupeKey ?? null,
        sendAfter: opts.sendAfter ?? new Date(),
      });
      if (optedOut) return 'skipped';
      if (opts.kick !== false) void this.tick();
      return 'queued';
    } catch (err: any) {
      if (err?.code === 11000) return 'duplicate';
      this.logger.error(`Could not queue ${kind} to ${to.email}: ${(err as Error).message}`);
      return 'error';
    }
  }

  /** Sends everything that's due, one at a time. Safe to call often. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.releaseScheduledCampaigns();
      let sentToday = await this.logModel.countDocuments({ status: 'sent', sentAt: { $gte: new Date(Date.now() - 24 * 3600_000) } });
      for (;;) {
        if (sentToday >= this.dailyLimit) {
          this.logger.warn(`Daily email limit (${this.dailyLimit}) reached; the rest stay queued.`);
          break;
        }
        const next = await this.logModel.findOneAndUpdate(
          { status: 'queued', sendAfter: { $lte: new Date() } },
          { $set: { status: 'sending' } },
          { sort: { sendAfter: 1, createdAt: 1 }, returnDocument: 'after' },
        );
        if (!next) break;
        if (await this.deliver(next)) sentToday++;
        if (this.rateMs) await sleep(this.rateMs);
      }
    } catch (err) {
      this.logger.error(`Email queue error: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(log: EmailLogDocument) {
    try {
      const attachments = [];
      if (log.attachment?.type === 'certificate') {
        const { TrainingService } = await import('../training/training.service');
        const training = this.moduleRef.get(TrainingService, { strict: false });
        const pdf = await training.generateCertificatePdf(log.attachment.userId, log.attachment.tier);
        attachments.push({ filename: 'Noor-Circles-Certificate.pdf', content: pdf, contentType: 'application/pdf' });
      }
      const unsub = log.category ? log.html.match(/href="([^"]*\/email\/unsubscribe\?t=[^"]+)"/)?.[1] : null;
      await this.mail.send({
        to: log.toName ? `"${log.toName.replace(/["\r\n]/g, '')}" <${log.to}>` : log.to,
        subject: log.subject, html: log.html, text: log.text, attachments,
        ...(unsub && { headers: { 'List-Unsubscribe': `<${unsub.replace(/&amp;/g, '&')}>` } }),
      });
      await this.logModel.updateOne({ _id: log._id }, { $set: { status: 'sent', sentAt: new Date(), error: '' }, $inc: { attempts: 1 } });
      return true;
    } catch (err) {
      const attempts = log.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await this.logModel.updateOne({ _id: log._id }, {
        $set: {
          status: failed ? 'failed' : 'queued', attempts, error: (err as Error).message.slice(0, 500),
          sendAfter: new Date(Date.now() + 2 ** attempts * 60_000),
        },
      });
      this.logger.warn(`Email to ${log.to} (${log.kind}) failed${failed ? '' : ', will retry'}: ${(err as Error).message}`);
      return false;
    }
  }

  // ══ Preferences and unsubscribe ═══════════════════════════════════════════

  private sign(payload: string) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url').slice(0, 24);
  }

  token(email: string, category: string) {
    const payload = Buffer.from(`${email}|${category}`).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  private readToken(token: string) {
    const [payload, sig] = String(token ?? '').split('.');
    const expected = payload ? this.sign(payload) : '';
    if (!payload || !sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new BadRequestException('This link is not valid.');
    }
    const [email, category] = Buffer.from(payload, 'base64url').toString().split('|');
    if (!email || !(OPTIONAL_CATEGORIES as readonly string[]).includes(category)) throw new BadRequestException('This link is not valid.');
    return { email, category };
  }

  async unsubscribe(token: string, subscribe = false) {
    const { email, category } = this.readToken(token);
    await this.prefModel.updateOne({ email }, subscribe ? { $pull: { optOut: category } } : { $addToSet: { optOut: category } }, { upsert: true });
    const masked = email.replace(/^(.{2}).*(@.*)$/, '$1•••$2');
    return { email: masked, category, subscribed: subscribe };
  }

  async preferences(email: string) {
    const p = await this.prefModel.findOne({ email: email.toLowerCase() }).lean();
    return { email, categories: OPTIONAL_CATEGORIES.map((c) => ({ key: c, on: !p?.optOut.includes(c) })) };
  }

  async setPreferences(email: string, on: Record<string, boolean>) {
    const optOut = OPTIONAL_CATEGORIES.filter((c) => on[c] === false);
    await this.prefModel.updateOne({ email: email.toLowerCase() }, { $set: { optOut } }, { upsert: true });
    return { message: 'Email preferences saved.', ...(await this.preferences(email)) };
  }

  // ══ Audiences (group emails) ══════════════════════════════════════════════

  async resolveAudience(a: AudienceDto): Promise<{ label: string; recipients: Recipient[]; withoutEmail: number }> {
    const ids = (a.ids ?? []).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    const fromUsers = (users: { _id: any; fullName: string; email: string }[]) => users.map((u) => ({ email: u.email, name: u.fullName, userId: u._id }));
    const murabbiFilter = { role: UserRole.MURABBI, isActive: true, pendingApproval: { $ne: true } };

    switch (a.type as AudienceType) {
      case 'murabbis': {
        const users = await this.userModel.find(murabbiFilter).select('fullName email').lean();
        return { label: 'All active murabbis', recipients: fromUsers(users), withoutEmail: 0 };
      }
      case 'murabbis-tier': {
        const users = await this.userModel.find({ ...murabbiFilter, tier: a.tier }).select('fullName email').lean();
        return { label: `Tier ${a.tier} murabbis`, recipients: fromUsers(users), withoutEmail: 0 };
      }
      case 'murabbis-training': {
        const course = await this.courseModel.findOne({ key: ASAAS_KEY }).select('_id').lean();
        if (!course) return { label: 'Asaas training', recipients: [], withoutEmail: 0 };
        const assignments = await this.assignmentModel.find({ course: course._id }).select('user certifiedAt').lean();
        const started = new Set((await this.progressModel.distinct('user', { course: course._id })).map(String));
        const pick = assignments.filter((x) => {
          const s = String(x.user);
          switch (a.status) {
            case 'not-started': return !x.certifiedAt && !started.has(s);
            case 'in-progress': return !x.certifiedAt && started.has(s);
            case 'certified': return !!x.certifiedAt;
            default: return !x.certifiedAt; // not yet certified
          }
        }).map((x) => x.user);
        const users = await this.userModel.find({ _id: { $in: pick }, isActive: true }).select('fullName email').lean();
        const label = { 'not-started': 'haven’t started', 'in-progress': 'are part-way through', certified: 'are certified' }[a.status ?? ''] ?? 'aren’t certified yet';
        return { label: `Murabbis who ${label} (Asaas training)`, recipients: fromUsers(users), withoutEmail: 0 };
      }
      case 'parents':
      case 'parents-circle':
      case 'parents-neighbourhood': {
        let filter: Record<string, unknown> = {};
        let label = 'All parents';
        if (a.type !== 'parents') {
          if (!ids.length) throw new BadRequestException(`Choose at least one ${a.type === 'parents-circle' ? 'circle' : 'neighbourhood'}.`);
          const circleIds = a.type === 'parents-circle'
            ? ids
            : (await this.circleModel.find({ neighbourhood: { $in: ids } }).select('_id').lean()).map((c) => c._id);
          const students = await this.studentModel.find({ circle: { $in: circleIds }, isActive: true }).select('_id').lean();
          filter = { students: { $in: students.map((s) => s._id) } };
          const names = a.type === 'parents-circle'
            ? (await this.circleModel.find({ _id: { $in: ids } }).select('name').lean()).map((c: any) => c.name)
            : [];
          label = a.type === 'parents-circle' ? `Parents in ${names.join(', ')}` : `Parents in ${ids.length} neighbourhood${ids.length === 1 ? '' : 's'}`;
        }
        const parents = await this.parentModel.find(filter).select('fullName email account').lean();
        const withEmail = parents.filter((p) => p.email);
        return {
          label,
          recipients: withEmail.map((p) => ({ email: p.email, name: p.fullName, userId: p.account ?? null })),
          withoutEmail: parents.length - withEmail.length,
        };
      }
      case 'families': {
        const ids = a.families ?? [];
        if (!ids.length) throw new BadRequestException('Choose at least one family.');
        const pick = (k: string) => ids.filter((x) => x.startsWith(`${k}:`)).map((x) => new Types.ObjectId(x.slice(2)));
        const [parents, requests] = await Promise.all([
          this.parentModel.find({ _id: { $in: pick('p') } }).select('fullName email account').lean(),
          this.interestModel.find({ _id: { $in: pick('i') } }).select('firstName lastName email').lean(),
        ]);
        const recipients: Recipient[] = [
          ...parents.filter((p) => p.email).map((p) => ({ email: p.email, name: p.fullName, userId: p.account ?? null })),
          ...requests.map((r) => ({ email: r.email, name: `${r.firstName} ${r.lastName}`.trim() })),
        ];
        return { label: `${ids.length} chosen famil${ids.length === 1 ? 'y' : 'ies'} (Parent Insights)`, recipients, withoutEmail: parents.filter((p) => !p.email).length };
      }
      default:
        throw new BadRequestException('Unknown audience.');
    }
  }

  /** Who a group email would reach, before sending. */
  async audiencePreview(a: AudienceDto) {
    const { label, recipients, withoutEmail } = await this.resolveAudience(a);
    const unique = this.unique(recipients);
    const optedOut = await this.prefModel.countDocuments({ email: { $in: unique.map((r) => r.email) }, optOut: 'announcements' });
    return { label, count: unique.length - optedOut, optedOut, withoutEmail, sample: unique.slice(0, 8).map((r) => r.name || r.email) };
  }

  private unique(recipients: Recipient[]) {
    const seen = new Set<string>();
    return recipients.filter((r) => {
      const e = r.email?.toLowerCase();
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });
  }

  // ══ Group emails written by admins ════════════════════════════════════════

  preview(dto: { subject: string; body: string }, name = 'Fatima') {
    const r = render('campaign', { subject: dto.subject, body: dto.body, name }, {
      portalUrl: this.portalUrl, supportEmail: this.supportEmail, unsubscribeUrl: this.link('/email/unsubscribe?t=preview'),
    });
    return { subject: r.subject, html: r.html };
  }

  async createCampaign(dto: CampaignDto, admin: { _id: any; email: string; fullName: string }) {
    if (dto.testOnly) {
      // A test goes straight to the admin, whatever their preferences.
      const r = render('campaign', { subject: `[Test] ${dto.subject}`, body: dto.body, name: admin.fullName }, { portalUrl: this.portalUrl, supportEmail: this.supportEmail });
      await this.logModel.create({ kind: 'campaign', to: admin.email, toName: admin.fullName, user: admin._id, subject: r.subject, html: r.html, text: r.text });
      void this.tick();
      return { message: `Test email sent to ${admin.email}.` };
    }
    const { label } = await this.resolveAudience(dto.audience);
    const when = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    if (when && Number.isNaN(when.getTime())) throw new BadRequestException('Choose a valid date and time.');
    const scheduled = !!when && when.getTime() > Date.now() + 60_000;
    const [campaign] = await this.campaignModel.create([{
      subject: dto.subject, body: dto.body, audience: { ...dto.audience }, audienceLabel: label, createdBy: admin._id,
      scheduledFor: scheduled ? when : null, status: scheduled ? 'scheduled' : 'queued',
    }]);
    if (scheduled) return { message: `Scheduled for ${when.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })}.`, campaign };
    const counts = await this.expand(campaign);
    return { message: `Sending to ${counts.recipients} ${counts.recipients === 1 ? 'person' : 'people'}${counts.skipped ? ` (${counts.skipped} unsubscribed)` : ''}.`, campaign: { ...campaign.toObject(), ...counts } };
  }

  /** Queues one email per recipient. */
  private async expand(campaign: EmailCampaignDocument) {
    const { recipients } = await this.resolveAudience(campaign.audience as AudienceDto);
    let queued = 0;
    let skipped = 0;
    for (const r of this.unique(recipients)) {
      const res = await this.queue('campaign', r, { subject: campaign.subject, body: campaign.body }, {
        campaign: campaign._id, dedupeKey: `campaign:${String(campaign._id)}:${r.email.toLowerCase()}`, kick: false,
      });
      if (res === 'queued') queued++;
      if (res === 'skipped') skipped++;
    }
    await this.campaignModel.updateOne({ _id: campaign._id }, { $set: { status: 'queued', recipients: queued, skipped } });
    void this.tick();
    return { recipients: queued, skipped };
  }

  private async releaseScheduledCampaigns() {
    for (;;) {
      const due = await this.campaignModel.findOneAndUpdate(
        { status: 'scheduled', scheduledFor: { $lte: new Date() } }, { $set: { status: 'queued' } }, { returnDocument: 'after' },
      );
      if (!due) break;
      await this.expand(due); // its tick() is a no-op while this one runs; this loop sends them
    }
  }

  async campaigns() {
    const list = await this.campaignModel.find().populate('createdBy', 'fullName').sort({ createdAt: -1 }).limit(100).lean();
    const counts = await this.logModel.aggregate([
      { $match: { campaign: { $in: list.map((c) => c._id) } } },
      { $group: { _id: { c: '$campaign', s: '$status' }, n: { $sum: 1 } } },
    ]);
    return list.map((c) => {
      const by = (s: string) => counts.find((x) => String(x._id.c) === String(c._id) && x._id.s === s)?.n ?? 0;
      return {
        ...c, sent: by('sent'), failed: by('failed'), pending: by('queued') + by('sending'), skipped: by('skipped'), cancelled: by('cancelled'),
      };
    });
  }

  async cancelCampaign(id: string) {
    const c = await this.campaignModel.findById(id);
    if (!c) throw new NotFoundException('Email not found.');
    if (c.status === 'cancelled') return { message: 'Already cancelled.' };
    c.status = 'cancelled';
    await c.save();
    const r = await this.logModel.updateMany({ campaign: c._id, status: 'queued' }, { $set: { status: 'cancelled' } });
    return { message: r.modifiedCount ? `Cancelled. ${r.modifiedCount} unsent email${r.modifiedCount === 1 ? '' : 's'} won’t go out.` : 'Cancelled.' };
  }

  // ══ The sent log ══════════════════════════════════════════════════════════

  async logs(q: { status?: string; kind?: string; search?: string; campaign?: string; page?: number }) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.kind) filter.kind = q.kind;
    if (q.campaign && Types.ObjectId.isValid(q.campaign)) filter.campaign = new Types.ObjectId(q.campaign);
    if (q.search) {
      const s = q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ to: { $regex: s, $options: 'i' } }, { toName: { $regex: s, $options: 'i' } }, { subject: { $regex: s, $options: 'i' } }];
    }
    const page = Math.max(1, Number(q.page) || 1);
    const [items, total, stats] = await Promise.all([
      this.logModel.find(filter).select('-html -text').sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean(),
      this.logModel.countDocuments(filter),
      this.logModel.aggregate([{ $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600_000) } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const sent24 = await this.logModel.countDocuments({ status: 'sent', sentAt: { $gte: new Date(Date.now() - 24 * 3600_000) } });
    return {
      items, total, page, pages: Math.max(1, Math.ceil(total / 50)),
      last30Days: Object.fromEntries(stats.map((s) => [s._id, s.n])),
      today: { sent: sent24, limit: this.dailyLimit },
    };
  }

  async logHtml(id: string) {
    const log = await this.logModel.findById(id).select('subject html to').lean();
    if (!log) throw new NotFoundException('Email not found.');
    return log;
  }

  async retry(id: string) {
    const r = await this.logModel.updateOne({ _id: id, status: 'failed' }, { $set: { status: 'queued', attempts: 0, sendAfter: new Date(), error: '' } });
    if (!r.modifiedCount) throw new BadRequestException('Only failed emails can be retried.');
    void this.tick();
    return { message: 'Queued to send again.' };
  }

  /** Sample of each automatic email, for admins to see what goes out. */
  samples() {
    return SAMPLES.map((s) => {
      const r = render(s.kind, s.data, {
        portalUrl: this.portalUrl, supportEmail: this.supportEmail,
        unsubscribeUrl: CATEGORY[s.kind] ? this.link('/email/unsubscribe?t=sample') : undefined,
      });
      return { kind: s.kind, title: s.title, when: s.when, audience: s.audience, optional: !!CATEGORY[s.kind], subject: r.subject, html: r.html };
    });
  }
}

const L = 'https://app.noorcircles.com';
const SAMPLES: { kind: string; title: string; when: string; audience: string; data: TemplateData }[] = [
  { kind: 'account.welcome', title: 'Account created', when: 'An admin creates a murabbi or parent account', audience: 'Murabbis & parents',
    data: { name: 'Bilal Khan', role: 'murabbi', email: 'bilal@example.com', setPasswordUrl: `${L}/welcome/…`, loginUrl: `${L}/signin`, expiresHours: 72 } },
  { kind: 'account.reset', title: 'Password reset by admin', when: 'An admin clicks “Reset password”', audience: 'Murabbis & parents',
    data: { name: 'Bilal Khan', setPasswordUrl: `${L}/welcome/…`, expiresHours: 72 } },
  { kind: 'account.approved', title: 'Registration approved', when: 'A self-registered murabbi is activated', audience: 'Murabbis', data: { name: 'Bilal Khan', loginUrl: `${L}/signin` } },
  { kind: 'account.declined', title: 'Registration declined', when: 'A pending registration is deleted', audience: 'Murabbis', data: { name: 'Bilal Khan' } },
  { kind: 'account.blocked', title: 'Sign-in paused', when: 'An account is deactivated or blocked', audience: 'Murabbis & parents', data: { name: 'Bilal Khan' } },
  { kind: 'account.restored', title: 'Sign-in allowed again', when: 'An account is activated again', audience: 'Murabbis & parents', data: { name: 'Bilal Khan', loginUrl: `${L}/signin` } },
  { kind: 'account.password-changed', title: 'Password changed', when: 'Someone changes or resets their password', audience: 'Murabbis & parents',
    data: { name: 'Bilal Khan', email: 'bilal@example.com', when: '30 October 2026, 7:15 pm' } },
  { kind: 'interest.thanks', title: 'Thank you for your interest', when: 'Someone submits “Find your place” on the website', audience: 'Website visitors',
    data: { name: 'Sara Ahmed', role: 'parent' } },
  { kind: 'interest.alert', title: 'New interest (to the team)', when: 'Someone submits “Find your place”', audience: 'support@',
    data: { name: 'Sara Ahmed', role: 'parent', email: 'sara@example.com', phone: '0300 1234567', neighbourhood: 'Gulshan', city: 'Karachi', roleDetail: '6–8 years', adminUrl: `${L}/` } },
  { kind: 'training.assigned', title: 'Training assigned', when: 'An admin assigns the Asaas training', audience: 'Murabbis',
    data: { name: 'Bilal Khan', courseTitle: 'Asaas Murabbi Training', lessons: 119, minutes: 108, badge: 'Certified Asaas Murabbi', dueDate: '2026-12-15', url: `${L}/murabbi` } },
  { kind: 'training.reminder', title: 'Training reminders', when: 'Not started after 3 days · no listening for 7 days · due in 7 days and 1 day · overdue', audience: 'Murabbis',
    data: { name: 'Bilal Khan', courseTitle: 'Asaas Murabbi Training', variant: 'due-soon', days: 7, dueDate: '2026-12-15', done: 40, total: 119, url: `${L}/murabbi` } },
  { kind: 'training.lessons-done', title: 'Every lesson heard', when: 'The last lesson is completed', audience: 'Murabbis',
    data: { name: 'Bilal Khan', courseTitle: 'Asaas Murabbi Training', total: 119, questions: 30, passingScore: 70, url: `${L}/murabbi` } },
  { kind: 'training.assessment', title: 'Assessment result', when: 'After each assessment attempt', audience: 'Murabbis',
    data: { name: 'Bilal Khan', passed: false, score: 63, passingScore: 70, attemptsLeft: 2, url: `${L}/murabbi` } },
  { kind: 'training.reflection', title: 'Reflection reviewed', when: 'An admin approves or returns a reflection', audience: 'Murabbis',
    data: { name: 'Bilal Khan', approved: false, feedback: 'Please add one example from your own circle.', url: `${L}/murabbi` } },
  { kind: 'training.practical', title: 'Practical score', when: 'An admin enters the practical score', audience: 'Murabbis',
    data: { name: 'Bilal Khan', total: 13, band: 'pass', url: `${L}/murabbi` } },
  { kind: 'training.certified', title: 'Certified (with the certificate PDF)', when: 'Everything is complete', audience: 'Murabbis',
    data: { name: 'Bilal Khan', badge: 'Certified Asaas Murabbi', courseTitle: 'Asaas Murabbi Training', number: 'NC-T1-482913', url: `${L}/murabbi` } },
  { kind: 'family.welcome', title: 'Welcome to Noor Circles', when: 'A parent with an email is registered or a child is added', audience: 'Parents',
    data: { name: 'Hafsa Ahmed', children: [{ name: 'Ahmed', circle: 'Circle of Light', murabbi: 'Usman Farooq', schedule: 'Fridays, 5:00 pm' }], familyUrl: `${L}/family/…`, hasAccount: false, loginUrl: `${L}/signin` } },
  { kind: 'contribution.pledge', title: 'Pledge thank-you', when: 'A pledge is made on the website', audience: 'Contributors',
    data: { name: 'Hafsa Ahmed', amount: 1000, frequency: 'monthly' } },
  { kind: 'contribution.receipt', title: 'Receipt', when: 'A payment is recorded or paid by card', audience: 'Contributors',
    data: { name: 'Hafsa Ahmed', amount: 1000, receiptNumber: 'NC-202610-00042', monthLabel: 'October 2026', method: 'JazzCash', receivedAt: new Date() } },
];
