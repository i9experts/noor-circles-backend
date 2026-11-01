import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import {
  Course, CourseAssignment, CourseAssignmentDocument, CourseDocument, CourseLesson, CourseLessonDocument,
} from '../course/course.schema';
import { CourseService, TrainingStep } from '../course/course.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';
import { EmailService } from '../email/email.service';
import { TrainingRequest, TrainingRequestDocument } from './marketplace.schema';
import { ApproveRequestDto } from './marketplace.dto';

type Requester = { _id: Types.ObjectId | string; role: string; fullName: string; email: string };

const portalPath = (role: string) => (role === UserRole.PARENT ? '/parent' : '/murabbi');

/**
 * The trainings marketplace. Murabbis and parents see the published
 * trainings meant for them; a training can be asked for once its required
 * trainings are certified and everything already started is finished.
 * An admin approves every request (or assigns a training directly).
 */
@Injectable()
export class MarketplaceService {
  constructor(
    @InjectModel(TrainingRequest.name)  private readonly requestModel:    Model<TrainingRequestDocument>,
    @InjectModel(Course.name)           private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseAssignment.name) private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(CourseLesson.name)     private readonly lessonModel:     Model<CourseLessonDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    private readonly courses: CourseService,
    private readonly notif: NotificationService,
    private readonly email: EmailService,
  ) {}

  private audienceOf(role: string) {
    if (role === UserRole.MURABBI) return 'murabbi';
    if (role === UserRole.PARENT) return 'parent';
    throw new ForbiddenException('Trainings are for murabbis and parents.');
  }

  /**
   * Whether this person may ask for a training, and what's still missing:
   * each required training certified, and every training they already
   * have finished (lessons, assignments, reflection, certificate).
   */
  private conditions(course: { key: string; prerequisites?: string[] }, titles: Map<string, string>, mine: { key: string; title: string; certifiedAt: Date | null }[]) {
    const certified = new Set(mine.filter((m) => m.certifiedAt).map((m) => m.key));
    const conditions: TrainingStep[] = (course.prerequisites ?? []).map((k) => ({
      label: `Certified in ${titles.get(k) ?? k}`, done: certified.has(k),
    }));
    for (const m of mine.filter((x) => !x.certifiedAt && !(course.prerequisites ?? []).includes(x.key))) {
      conditions.push({ label: `Finish ${m.title}`, done: false, detail: 'every lesson, assignment and reflection' });
    }
    return { conditions, eligible: conditions.every((c) => c.done) };
  }

  /** GET /trainings — my trainings (with the steps left) and the ones I can explore. */
  async forUser(user: Requester) {
    const audience = this.audienceOf(user.role);
    const uid = new Types.ObjectId(String(user._id));
    const [published, mine, requests] = await Promise.all([
      this.courseModel.find({ audience, published: true }).select('key title titleUr summary summaryUr category prerequisites position badge tier').sort({ position: 1, createdAt: 1 }).lean(),
      this.courses.myCourses(String(user._id)),
      this.requestModel.find({ user: uid }).sort({ createdAt: -1 }).lean(),
    ]);
    const needed = [...new Set(published.flatMap((c) => c.prerequisites ?? []))];
    const titles = new Map((await this.courseModel.find({ key: { $in: needed } }).select('key title').lean()).map((c) => [c.key, c.title]));
    const lessonCounts = new Map((await this.lessonModel.aggregate([
      { $match: { course: { $in: published.map((c) => c._id) } } },
      { $group: { _id: '$course', n: { $sum: 1 }, sec: { $sum: '$durationSec' } } },
    ])).map((r: any) => [String(r._id), r]));

    const myTrainings = await Promise.all(mine.map(async (m) => ({
      ...m,
      steps: m.certifiedAt ? [] : await this.courses.steps(m.key, String(user._id)),
    })));
    const assigned = new Set(mine.map((m) => m.key));
    const explore = published.filter((c) => !assigned.has(c.key)).map((c) => {
      const latest = requests.find((r) => String(r.course) === String(c._id));
      const { conditions, eligible } = this.conditions(c, titles, mine);
      const counts = lessonCounts.get(String(c._id));
      return {
        key: c.key, title: c.title, titleUr: c.titleUr, summary: c.summary, summaryUr: c.summaryUr, category: c.category,
        badge: c.badge, tier: c.tier, lessons: counts?.n ?? 0, minutes: Math.round((counts?.sec ?? 0) / 60),
        status: latest?.status === 'pending' ? 'requested' : eligible ? 'available' : 'locked',
        conditions,
        declined: latest?.status === 'declined' ? { reason: latest.reason, at: latest.decidedAt } : null,
        requestedAt: latest?.status === 'pending' ? (latest as any).createdAt : null,
      };
    });
    return { mine: myTrainings, explore };
  }

  private async publishedCourse(key: string, user: Requester) {
    const course = await this.courseModel.findOne({ key, published: true }).lean();
    if (!course || course.audience !== this.audienceOf(user.role)) throw new NotFoundException('Training not found.');
    return course;
  }

  async request(user: Requester, key: string, note?: string) {
    const course = await this.publishedCourse(key, user);
    const uid = new Types.ObjectId(String(user._id));
    if (await this.assignmentModel.exists({ course: course._id, user: uid })) throw new ConflictException('You already have this training.');
    if (await this.requestModel.exists({ course: course._id, user: uid, status: 'pending' })) {
      throw new ConflictException('You’ve already asked for this training; the team will reply soon.');
    }
    const mine = await this.courses.myCourses(String(user._id));
    const all = await this.courseModel.find({ key: { $in: course.prerequisites ?? [] } }).select('key title').lean();
    const { conditions, eligible } = this.conditions(course, new Map(all.map((c) => [c.key, c.title])), mine);
    if (!eligible) {
      throw new ForbiddenException(`Not yet: ${conditions.filter((c) => !c.done).map((c) => c.label).join('; ')}.`);
    }
    try {
      await this.requestModel.create({ course: course._id, user: uid, note: note ?? '' });
    } catch (err: any) {
      if (err?.code === 11000) throw new ConflictException('You’ve already asked for this training.');
      throw err;
    }
    this.notif.createForAdmins({
      sender: String(user._id), type: NotificationType.TRAINING,
      title: 'Training request', message: `${user.fullName} asks to join ${course.title}.`, payload: { courseKey: course.key },
    }).catch(() => {});
    void this.email.queue('training.request-alert', { email: this.email.supportEmail, name: 'Noor Circles team' }, {
      name: user.fullName, role: user.role, courseTitle: course.title, note: note ?? '', url: this.email.link('/'),
    });
    return { message: 'Request sent. The team will review it and open the training for you.' };
  }

  async cancel(user: Requester, key: string) {
    const course = await this.publishedCourse(key, user);
    const r = await this.requestModel.updateOne(
      { course: course._id, user: new Types.ObjectId(String(user._id)), status: 'pending' },
      { $set: { status: 'cancelled', decidedAt: new Date() } },
    );
    if (!r.modifiedCount) throw new NotFoundException('There’s no request to cancel.');
    return { message: 'Request cancelled.' };
  }

  // ══ Admin ══════════════════════════════════════════════════════════════════

  /** Every training (published or not) with how many are enrolled, certified and waiting. */
  async catalogue() {
    const courses = await this.courseModel.find()
      .select('key title titleUr audience published summary category prerequisites position tier badge questions reflectionPrompt requirePractical')
      .sort({ audience: 1, position: 1, createdAt: 1 }).lean();
    const ids = courses.map((c) => c._id);
    const [assignments, pending, lessons] = await Promise.all([
      this.assignmentModel.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: '$course', enrolled: { $sum: 1 }, certified: { $sum: { $cond: [{ $ne: ['$certifiedAt', null] }, 1, 0] } } } }]),
      this.requestModel.aggregate([{ $match: { course: { $in: ids }, status: 'pending' } }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
      this.lessonModel.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: '$course', n: { $sum: 1 }, audio: { $sum: { $cond: [{ $ne: ['$audio.fileId', null] }, 1, 0] } }, sec: { $sum: '$durationSec' } } }]),
    ]);
    const by = <T extends { _id: any }>(rows: T[]) => new Map(rows.map((r) => [String(r._id), r]));
    const a = by(assignments), p = by(pending), l = by(lessons);
    return courses.map(({ questions, reflectionPrompt, ...c }) => ({
      ...c,
      custom: this.courses.isCustom(c.key),
      questions: questions?.length ?? 0, hasReflection: !!reflectionPrompt?.trim(),
      lessons: (l.get(String(c._id)) as any)?.n ?? 0, withAudio: (l.get(String(c._id)) as any)?.audio ?? 0,
      minutes: Math.round(((l.get(String(c._id)) as any)?.sec ?? 0) / 60),
      enrolled: (a.get(String(c._id)) as any)?.enrolled ?? 0, certified: (a.get(String(c._id)) as any)?.certified ?? 0,
      pending: (p.get(String(c._id)) as any)?.n ?? 0,
    }));
  }

  async requests(status = 'pending') {
    const rows = await this.requestModel.find(status === 'all' ? {} : { status })
      .populate('course', 'key title audience').populate('user', 'fullName email role tier').populate('decidedBy', 'fullName')
      .sort({ createdAt: -1 }).limit(300).lean();
    // What each person has completed, so the decision can be made from this list.
    const userIds = [...new Set(rows.map((r) => String((r.user as any)?._id)).filter((x) => x !== 'undefined'))].map((x) => new Types.ObjectId(x));
    const certs = await this.assignmentModel.find({ user: { $in: userIds }, certifiedAt: { $ne: null } }).populate('course', 'title').select('user course certifiedAt').lean();
    return rows.filter((r) => r.user && r.course).map((r) => ({
      ...r,
      completed: certs.filter((c) => String(c.user) === String((r.user as any)._id)).map((c) => ({ title: (c.course as any)?.title, certifiedAt: c.certifiedAt })),
    }));
  }

  private async pendingRequest(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const r = await this.requestModel.findById(id);
    if (!r) throw new NotFoundException('Request not found.');
    if (r.status !== 'pending') throw new BadRequestException(`This request was already ${r.status}.`);
    const course = await this.courseModel.findById(r.course).select('key title').lean();
    if (!course) throw new NotFoundException('That training no longer exists.');
    return { r, course };
  }

  async approve(id: string, adminId: string, dto: ApproveRequestDto) {
    const { r, course } = await this.pendingRequest(id);
    // Assigning sends the "new training" notification and email.
    await this.courses.assign(course.key, adminId, { userIds: [String(r.user)], dueDate: dto.dueDate, note: dto.note });
    r.status = 'approved';
    r.decidedBy = new Types.ObjectId(adminId);
    r.decidedAt = new Date();
    await r.save();
    return { message: `Approved: ${course.title} is now open for them.` };
  }

  async decline(id: string, adminId: string, reason?: string) {
    const { r, course } = await this.pendingRequest(id);
    r.status = 'declined';
    r.reason = reason ?? '';
    r.decidedBy = new Types.ObjectId(adminId);
    r.decidedAt = new Date();
    await r.save();
    const u = await this.userModel.findById(r.user).select('fullName email role').lean();
    if (u) {
      this.notif.create({
        recipient: String(u._id), sender: adminId, type: NotificationType.TRAINING,
        title: `About ${course.title}`, message: reason ? `Your request wasn’t approved yet: ${reason}` : 'Your request wasn’t approved yet.', payload: { courseKey: course.key },
      }).catch(() => {});
      void this.email.queue('training.declined', { email: u.email, name: u.fullName, userId: u._id }, {
        role: u.role, courseTitle: course.title, reason: reason ?? '', url: this.email.link(portalPath(u.role)),
      });
    }
    return { message: 'Request declined. They’ve been told.' };
  }

  /** Murabbis certified in a tier training above their current tier: waiting for an admin to move them up. */
  async tierUpgrades() {
    const tierCourses = await this.courseModel.find({ audience: 'murabbi', tier: { $ne: null } }).select('_id tier title').lean();
    if (!tierCourses.length) return [];
    const certs = await this.assignmentModel.find({ course: { $in: tierCourses.map((c) => c._id) }, certifiedAt: { $ne: null } })
      .populate('user', 'fullName email tier role isActive').select('user course certifiedAt').lean();
    const best = new Map<string, { user: any; tier: number; course: string; certifiedAt: Date | null }>();
    for (const c of certs) {
      const u = c.user as any;
      const course = tierCourses.find((t) => String(t._id) === String(c.course))!;
      if (!u || u.role !== UserRole.MURABBI || (u.tier ?? 1) >= (course.tier ?? 0)) continue;
      const prev = best.get(String(u._id));
      if (!prev || prev.tier < (course.tier ?? 0)) best.set(String(u._id), { user: u, tier: course.tier!, course: course.title, certifiedAt: c.certifiedAt });
    }
    return [...best.values()].map((b) => ({ user: { _id: b.user._id, fullName: b.user.fullName, email: b.user.email, tier: b.user.tier ?? 1 }, tier: b.tier, course: b.course, certifiedAt: b.certifiedAt }));
  }

  async approveTier(userId: string, tier: number, adminId: string) {
    const waiting = (await this.tierUpgrades()).find((t) => String(t.user._id) === userId);
    if (!waiting || waiting.tier < tier) throw new BadRequestException(`They need to be certified in a Tier ${tier} training first.`);
    await this.userModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { tier } });
    this.notif.create({
      recipient: userId, sender: adminId, type: NotificationType.TRAINING,
      title: `You are now a Tier ${tier} murabbi`, message: `MashaAllah! Your certification in ${waiting.course} has moved you up to Tier ${tier}.`, payload: { tier },
    }).catch(() => {});
    return { message: `${waiting.user.fullName} is now Tier ${tier}.` };
  }
}
