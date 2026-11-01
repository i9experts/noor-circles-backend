import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument, UserRole } from '../user/user.schema';
import { Neighbourhood, NeighbourhoodDocument } from '../neighbourhood/neighbourhood.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { Interest, InterestDocument } from '../interest/interest.schema';
import { Course, CourseAssignment, CourseAssignmentDocument, CourseDocument } from '../course/course.schema';
import { CalendarEvent, CalendarEventDocument } from '../syllabus/syllabus.schema';
import { EmailCampaign, EmailCampaignDocument } from '../email/email.schema';
import { ASAAS_KEY } from '../course/course.service';
import { AdminService } from '../admin/admin.service';
import { AccountService } from '../account/account.service';
import { InterestService } from '../interest/interest.service';
import { SyllabusService } from '../syllabus/syllabus.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';
import { EmailService } from '../email/email.service';
import { attendanceTotals, rateOf } from '../attendance/attendance-stats';
import { addDays, pkToday } from '../syllabus/schedule.util';
import { escapeRegex } from '../common/utils/regex.util';
import { AssignCircleDto, CreateCircleDto, EnrollStudentDto, UpdateCircleDto, UpdateStudentDto } from '../admin/admin.dto';
import { ConvertInterestDto } from '../account/account.dto';
import { CreateEventDto, UpdateEventDto } from '../syllabus/syllabus.dto';
import { Cluster, ClusterDocument, ClusterVisit, ClusterVisitDocument } from './cluster.schema';
import { ClusterMessageDto, CreateClusterDto, CreateSupervisorDto, CreateVisitDto, UpdateClusterDto } from './cluster.dto';
import { VISIT_CHECKLIST } from './visit-checklist';

type Requester = { _id: Types.ObjectId | string; role: string; fullName: string; email: string };

/** What a supervisor may see and change. `null` = everything (admins). */
export interface Scope {
  clusterIds: Types.ObjectId[];
  neighbourhoodIds: Types.ObjectId[];
  circleIds: Types.ObjectId[];
}

export interface ClusterAlert {
  level: 'red' | 'amber' | 'info';
  kind: 'safeguarding' | 'no-session' | 'low-attendance' | 'behind' | 'not-certified' | 'not-visited' | 'follow-ups' | 'no-murabbi';
  circleId: string;
  circleName: string;
  text: string;
}

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const has = (ids: Types.ObjectId[], id: unknown) => !!id && ids.some((x) => x.toString() === String((id as any)?._id ?? id));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const pkDate = (d: Date) => pkToday(d);

/**
 * Clusters group neighbourhoods; cluster supervisors look after the circles in
 * them. Supervisors work through this service only, so every read and change
 * is checked against their clusters first. Family-profile answers (Parent
 * Insights) and parents' own course progress are never exposed here.
 */
@Injectable()
export class ClusterService {
  private readonly logger = new Logger(ClusterService.name);

  constructor(
    @InjectModel(Cluster.name)          private readonly clusterModel:    Model<ClusterDocument>,
    @InjectModel(ClusterVisit.name)     private readonly visitModel:      Model<ClusterVisitDocument>,
    @InjectModel(User.name)             private readonly userModel:       Model<UserDocument>,
    @InjectModel(Neighbourhood.name)    private readonly nbhModel:        Model<NeighbourhoodDocument>,
    @InjectModel(Circle.name)           private readonly circleModel:     Model<CircleDocument>,
    @InjectModel(Student.name)          private readonly studentModel:    Model<StudentDocument>,
    @InjectModel(Attendance.name)       private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Parent.name)           private readonly parentModel:     Model<ParentDocument>,
    @InjectModel(Interest.name)         private readonly interestModel:   Model<InterestDocument>,
    @InjectModel(Course.name)           private readonly courseModel:     Model<CourseDocument>,
    @InjectModel(CourseAssignment.name) private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(CalendarEvent.name)    private readonly eventModel:      Model<CalendarEventDocument>,
    @InjectModel(EmailCampaign.name)    private readonly campaignModel:   Model<EmailCampaignDocument>,
    private readonly admin: AdminService,
    private readonly accounts: AccountService,
    private readonly interests: InterestService,
    private readonly syllabus: SyllabusService,
    private readonly notif: NotificationService,
    private readonly email: EmailService,
  ) {}

  // ══ Scope ══════════════════════════════════════════════════════════════════

  async scopeFor(user: Requester, clusterId?: string): Promise<Scope> {
    const q: Record<string, unknown> = user.role === UserRole.ADMIN ? {} : { supervisors: oid(user._id), isActive: true };
    if (clusterId) {
      if (!Types.ObjectId.isValid(clusterId)) throw new BadRequestException('Invalid cluster.');
      q._id = oid(clusterId);
    }
    const clusters = await this.clusterModel.find(q).select('neighbourhoods').lean();
    if (clusterId && !clusters.length) throw new ForbiddenException('That cluster is not one of yours.');
    const neighbourhoodIds = clusters.flatMap((c) => c.neighbourhoods);
    const circleIds = neighbourhoodIds.length
      ? (await this.circleModel.find({ neighbourhood: { $in: neighbourhoodIds } }).select('_id').lean()).map((c) => c._id)
      : [];
    return { clusterIds: clusters.map((c) => c._id), neighbourhoodIds, circleIds };
  }

  private requireCircle(scope: Scope, circleId: string) {
    if (!Types.ObjectId.isValid(circleId) || !has(scope.circleIds, circleId)) {
      throw new ForbiddenException('That circle is not in your cluster.');
    }
  }

  private requireNeighbourhood(scope: Scope, nbhId: string) {
    if (!Types.ObjectId.isValid(nbhId) || !has(scope.neighbourhoodIds, nbhId)) {
      throw new ForbiddenException('That neighbourhood is not in your cluster.');
    }
  }

  private async requireStudent(scope: Scope, studentId: string) {
    if (!Types.ObjectId.isValid(studentId)) throw new BadRequestException('Invalid id.');
    const s = await this.studentModel.findById(studentId).select('circle').lean();
    if (!s) throw new NotFoundException('Student not found.');
    if (!has(scope.circleIds, s.circle)) throw new ForbiddenException('That child is not in your cluster.');
  }

  // ══ Admin: clusters ════════════════════════════════════════════════════════

  private async checkMembers(dto: CreateClusterDto, selfId?: string) {
    if (dto.neighbourhoodIds) {
      const ids = [...new Set(dto.neighbourhoodIds)];
      const found = await this.nbhModel.countDocuments({ _id: { $in: ids.map(oid) } });
      if (found !== ids.length) throw new NotFoundException('A chosen neighbourhood no longer exists.');
      const taken = await this.clusterModel.findOne({
        neighbourhoods: { $in: ids.map(oid) }, ...(selfId && { _id: { $ne: oid(selfId) } }),
      }).select('name').lean();
      if (taken) throw new ConflictException(`A chosen neighbourhood is already in the cluster “${taken.name}”. Take it out of that cluster first.`);
    }
    if (dto.supervisorIds) {
      const ids = [...new Set(dto.supervisorIds)];
      const found = await this.userModel.countDocuments({ _id: { $in: ids.map(oid) }, role: UserRole.SUPERVISOR });
      if (found !== ids.length) throw new BadRequestException('Only cluster supervisor accounts can supervise a cluster.');
    }
  }

  private fields(dto: CreateClusterDto) {
    const out: Record<string, unknown> = {};
    if (dto.name !== undefined)            out.name           = dto.name.trim();
    if (dto.city !== undefined)            out.city           = dto.city.trim();
    if (dto.notes !== undefined)           out.notes          = dto.notes;
    if (dto.isActive !== undefined)        out.isActive       = dto.isActive;
    if (dto.neighbourhoodIds !== undefined) out.neighbourhoods = [...new Set(dto.neighbourhoodIds)].map(oid);
    if (dto.supervisorIds !== undefined)    out.supervisors    = [...new Set(dto.supervisorIds)].map(oid);
    return out;
  }

  async createCluster(dto: CreateClusterDto, adminId: string) {
    await this.checkMembers(dto);
    try {
      const cluster = await this.clusterModel.create(this.fields(dto));
      this.notifySupervisors(dto.supervisorIds ?? [], adminId, cluster.name);
      return { message: 'Cluster created.', cluster };
    } catch (err: any) {
      if (err?.code === 11000) throw new ConflictException('A cluster with that name already exists.');
      throw err;
    }
  }

  async updateCluster(id: string, dto: UpdateClusterDto, adminId: string) {
    const before = await this.clusterModel.findById(id).select('supervisors name').lean();
    if (!before) throw new NotFoundException('Cluster not found.');
    await this.checkMembers(dto, id);
    try {
      const cluster = await this.clusterModel.findByIdAndUpdate(id, { $set: this.fields(dto) }, { new: true, runValidators: true }).lean();
      const added = (dto.supervisorIds ?? []).filter((s) => !has(before.supervisors, s));
      this.notifySupervisors(added, adminId, cluster!.name);
      return { message: 'Cluster updated.', cluster };
    } catch (err: any) {
      if (err?.code === 11000) throw new ConflictException('A cluster with that name already exists.');
      throw err;
    }
  }

  private notifySupervisors(ids: string[], adminId: string, name: string) {
    for (const recipient of ids) {
      this.notif.create({
        recipient, sender: adminId, type: NotificationType.CLUSTER,
        title: 'Cluster assigned', message: `You now look after the circles in ${name}.`, payload: {},
      }).catch(() => {});
    }
  }

  async deleteCluster(id: string) {
    const cluster = await this.clusterModel.findByIdAndDelete(id).lean();
    if (!cluster) throw new NotFoundException('Cluster not found.');
    const { deletedCount } = await this.visitModel.deleteMany({ cluster: cluster._id });
    return { message: `Cluster removed${deletedCount ? ` with its ${deletedCount} visit report${deletedCount === 1 ? '' : 's'}` : ''}. Its neighbourhoods and circles are unchanged.` };
  }

  /** Admin Clusters page: each cluster with its headline numbers, plus what isn't in a cluster yet. */
  async listClusters() {
    const [clusters, neighbourhoods, supervisors] = await Promise.all([
      this.clusterModel.find().populate('neighbourhoods', 'name city area').populate('supervisors', 'fullName email phone isActive lastLoginAt').sort({ name: 1 }).lean(),
      this.nbhModel.find().select('name city area isActive').sort({ name: 1 }).lean(),
      this.userModel.find({ role: UserRole.SUPERVISOR }).select('fullName email phone isActive lastLoginAt mustChangePassword').sort({ fullName: 1 }).lean(),
    ]);
    const since = addDays(pkToday(), -30);
    const rows = await Promise.all(clusters.map(async (c) => {
      const nbhIds = (c.neighbourhoods as any[]).map((n) => n._id);
      const circles = await this.circleModel.find({ neighbourhood: { $in: nbhIds } }).select('_id murabbi isActive').lean();
      const active = circles.filter((x) => x.isActive);
      const [students, visits30, lastVisit, att] = await Promise.all([
        this.studentModel.countDocuments({ circle: { $in: active.map((x) => x._id) }, isActive: true }),
        this.visitModel.countDocuments({ cluster: c._id, date: { $gte: since } }),
        this.visitModel.findOne({ cluster: c._id }).sort({ date: -1 }).select('date').lean(),
        attendanceTotals(this.attendanceModel, { circle: { $in: active.map((x) => x._id) }, sessionDate: { $gte: new Date(Date.now() - 28 * 86_400_000) } }),
      ]);
      return {
        ...c,
        stats: {
          circles: active.length,
          murabbis: new Set(active.map((x) => String(x.murabbi)).filter((x) => x !== 'null')).size,
          students, visits30, lastVisit: lastVisit?.date ?? null, attendance28: att.get('all')?.total ? rateOf(att.get('all')) : null,
        },
      };
    }));
    const inCluster = new Set(clusters.flatMap((c) => (c.neighbourhoods as any[]).map((n) => String(n._id))));
    const clustersOf = (uid: unknown) => clusters.filter((c) => (c.supervisors as any[]).some((s) => String(s._id) === String(uid))).map((c) => ({ _id: c._id, name: c.name }));
    return {
      clusters: rows,
      unassigned: neighbourhoods.filter((n) => !inCluster.has(String(n._id))),
      neighbourhoods: neighbourhoods.map((n) => ({ ...n, cluster: clusters.find((c) => (c.neighbourhoods as any[]).some((x) => String(x._id) === String(n._id)))?._id ?? null })),
      supervisors: supervisors.map((s) => ({ ...s, clusters: clustersOf(s._id) })),
    };
  }

  /** A new supervisor account, optionally placed in clusters straight away. */
  async createSupervisor(dto: CreateSupervisorDto, adminId: string) {
    const ids = [...new Set(dto.clusterIds ?? [])];
    if (ids.length && (await this.clusterModel.countDocuments({ _id: { $in: ids.map(oid) } })) !== ids.length) {
      throw new NotFoundException('A chosen cluster no longer exists.');
    }
    const result = await this.accounts.createSupervisor(dto);
    if (ids.length) {
      await this.clusterModel.updateMany({ _id: { $in: ids.map(oid) } }, { $addToSet: { supervisors: oid(result.account.id) } });
      const names = (await this.clusterModel.find({ _id: { $in: ids.map(oid) } }).select('name').lean()).map((c) => c.name);
      this.notifySupervisors([result.account.id], adminId, names.join(', '));
    }
    return result;
  }

  // ══ Supervisor: my clusters ════════════════════════════════════════════════

  async myClusters(user: Requester) {
    const clusters = await this.clusterModel.find({ supervisors: oid(user._id), isActive: true })
      .populate('neighbourhoods', 'name city area').populate('supervisors', 'fullName email phone').sort({ name: 1 }).lean();
    return { clusters };
  }

  // ══ Dashboard ══════════════════════════════════════════════════════════════

  /** Every circle in the scope with its health, the cluster's totals and what needs attention. */
  async dashboard(scope: Scope) {
    const today = pkToday();
    const circles = await this.circleModel.find({ _id: { $in: scope.circleIds } })
      .populate('neighbourhood', 'name city area').populate('murabbi', 'fullName email phone').populate('track', 'name ageGroup')
      .sort({ name: 1 }).lean();
    const active = circles.filter((c) => c.isActive);
    const ids = circles.map((c) => c._id);
    const since28 = new Date(Date.now() - 28 * 86_400_000);
    const murabbiIds = [...new Set(active.map((c) => (c.murabbi as any)?._id?.toString()).filter(Boolean))].map(oid);

    const [studentAgg, lastSessions, att28, closures, visitAgg, openFollowUps, safeguarding, course, families, waiting, visits30] = await Promise.all([
      this.studentModel.aggregate([{ $match: { circle: { $in: ids }, isActive: true } }, { $group: { _id: '$circle', n: { $sum: 1 } } }]),
      this.attendanceModel.aggregate([{ $match: { circle: { $in: ids } } }, { $group: { _id: '$circle', last: { $max: '$sessionDate' }, sessions: { $sum: 1 } } }]),
      attendanceTotals(this.attendanceModel, { circle: { $in: ids }, sessionDate: { $gte: since28 } }, 'circle'),
      this.syllabus.closuresByCircle(active.map((c) => c._id)),
      this.visitModel.aggregate([{ $match: { circle: { $in: ids } } }, { $sort: { date: -1 } }, { $group: { _id: '$circle', last: { $first: '$date' }, overall: { $first: '$overall' } } }]),
      this.visitModel.aggregate([{ $match: { circle: { $in: ids } } }, { $unwind: '$followUps' }, { $match: { 'followUps.done': false } }, { $group: { _id: '$circle', n: { $sum: 1 } } }]),
      this.visitModel.find({ circle: { $in: ids }, safeguarding: true, date: { $gte: addDays(today, -30) } }).select('circle date').lean(),
      this.courseModel.findOne({ key: ASAAS_KEY }).select('_id').lean(),
      this.familiesIn(active.map((c) => c._id)),
      this.waitingInterest(scope),
      this.visitModel.countDocuments({ cluster: { $in: scope.clusterIds }, date: { $gte: addDays(today, -30) } }),
    ]);
    const assignments = course
      ? await this.assignmentModel.find({ course: course._id, user: { $in: murabbiIds } }).select('user certifiedAt').lean()
      : [];

    const students = new Map(studentAgg.map((r: any) => [String(r._id), r.n as number]));
    const sessions = new Map(lastSessions.map((r: any) => [String(r._id), { last: r.last as Date, count: r.sessions as number }]));
    const visits = new Map(visitAgg.map((r: any) => [String(r._id), { last: r.last as string, overall: r.overall as string }]));
    const followUps = new Map(openFollowUps.map((r: any) => [String(r._id), r.n as number]));
    const training = (uid?: string) => {
      const a = assignments.find((x) => String(x.user) === uid);
      return !a ? 'not-assigned' : a.certifiedAt ? 'certified' : 'in-training';
    };

    const rows = await Promise.all(circles.map(async (c) => {
      const cid = String(c._id);
      const s = sessions.get(cid);
      const progress = c.isActive
        ? await this.syllabus.progressFor({ ...c, track: (c.track as any)?._id ?? null } as any, closures.get(cid) ?? [])
        : null;
      const t = att28.get(cid);
      return {
        _id: c._id, name: c.name, isActive: c.isActive, capacity: c.capacity,
        neighbourhood: c.neighbourhood, murabbi: c.murabbi, track: c.track,
        meetingDay: c.meetingDay ?? null, meetingTime: c.meetingTime ?? null, startDate: c.startDate ?? null,
        students: students.get(cid) ?? 0,
        sessions: s?.count ?? 0,
        lastSession: s ? pkDate(s.last) : null,
        attendance28: t?.total ? rateOf(t) : null,
        progress,
        murabbiTraining: training((c.murabbi as any)?._id?.toString()),
        lastVisit: visits.get(cid) ?? null,
        openFollowUps: followUps.get(cid) ?? 0,
      };
    }));

    const alerts: ClusterAlert[] = [];
    for (const r of rows.filter((x) => x.isActive)) {
      const base = { circleId: String(r._id), circleName: r.name };
      if (safeguarding.some((v) => String(v.circle) === base.circleId)) {
        alerts.push({ ...base, level: 'red', kind: 'safeguarding', text: 'A safeguarding concern was raised on a visit in the last 30 days.' });
      }
      if (!r.murabbi) alerts.push({ ...base, level: 'red', kind: 'no-murabbi', text: 'No murabbi is assigned.' });
      const started = !r.startDate || r.startDate <= today;
      if (r.students > 0 && started) {
        const gap = r.lastSession ? daysBetween(r.lastSession, today) : null;
        if (gap === null) alerts.push({ ...base, level: 'amber', kind: 'no-session', text: 'No session has been recorded yet.' });
        else if (gap > 14) alerts.push({ ...base, level: gap > 28 ? 'red' : 'amber', kind: 'no-session', text: `No session recorded for ${gap} days.` });
      }
      if (r.attendance28 !== null && r.attendance28 < 60) {
        alerts.push({ ...base, level: 'amber', kind: 'low-attendance', text: `Attendance is ${r.attendance28}% over the last four weeks.` });
      }
      if (r.progress?.status === 'behind') {
        alerts.push({ ...base, level: 'amber', kind: 'behind', text: `${r.progress.behindBy} sessions behind the syllabus.` });
      }
      if (r.murabbi && r.murabbiTraining !== 'certified') {
        alerts.push({ ...base, level: 'info', kind: 'not-certified', text: `${(r.murabbi as any).fullName} is not yet a certified Asaas murabbi.` });
      }
      const visitGap = r.lastVisit ? daysBetween(r.lastVisit.last, today) : null;
      if (visitGap === null || visitGap > 30) {
        alerts.push({ ...base, level: 'info', kind: 'not-visited', text: visitGap === null ? 'Not visited yet.' : `Last visited ${visitGap} days ago.` });
      }
      if (r.openFollowUps) {
        alerts.push({ ...base, level: 'info', kind: 'follow-ups', text: `${r.openFollowUps} follow-up${r.openFollowUps === 1 ? '' : 's'} still open.` });
      }
    }
    const order = { red: 0, amber: 1, info: 2 };
    alerts.sort((a, b) => order[a.level] - order[b.level]);

    const all = attendanceTotals(this.attendanceModel, { circle: { $in: active.map((c) => c._id) }, sessionDate: { $gte: since28 } });
    const overall = (await all).get('all');
    return {
      totals: {
        circles: active.length,
        inactiveCircles: circles.length - active.length,
        murabbis: murabbiIds.length,
        students: rows.filter((r) => r.isActive).reduce((n, r) => n + r.students, 0),
        families,
        waitingInterest: waiting,
        visits30,
        attendance28: overall?.total ? rateOf(overall) : null,
        behind: rows.filter((r) => r.progress?.status === 'behind').length,
        certifiedMurabbis: assignments.filter((a) => a.certifiedAt).length,
      },
      circles: rows,
      alerts,
    };
  }

  private async familiesIn(circleIds: Types.ObjectId[]) {
    const students = await this.studentModel.find({ circle: { $in: circleIds }, isActive: true }).select('_id').lean();
    return this.parentModel.countDocuments({ students: { $in: students.map((s) => s._id) } });
  }

  /** Website interest whose neighbourhood text names one of the scope's neighbourhoods (in the same city, when it has one). */
  private async interestFilter(scope: Scope) {
    const nbhs = (await this.nbhModel.find({ _id: { $in: scope.neighbourhoodIds } }).select('name city').lean()).filter((n) => n.name?.trim());
    if (!nbhs.length) return null;
    const like = (text: string) => ({ $regex: escapeRegex(text.trim()), $options: 'i' });
    return { $or: nbhs.map((n) => ({ neighbourhood: like(n.name), ...(n.city?.trim() && { city: like(n.city) }) })) };
  }

  private async waitingInterest(scope: Scope) {
    const f = await this.interestFilter(scope);
    return f ? this.interestModel.countDocuments({ ...f, status: { $in: ['new', 'contacted'] }, account: null }) : 0;
  }

  // ══ Visits ═════════════════════════════════════════════════════════════════

  async createVisit(user: Requester, scope: Scope, dto: CreateVisitDto) {
    this.requireCircle(scope, dto.circleId);
    if (dto.date > pkToday()) throw new BadRequestException('A visit can’t be in the future.');
    const circle = await this.circleModel.findById(dto.circleId).populate('murabbi', 'fullName').lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    const cluster = await this.clusterModel.findOne({ neighbourhoods: circle.neighbourhood, ...(scope.clusterIds.length && { _id: { $in: scope.clusterIds } }) }).select('name').lean();
    if (!cluster) throw new BadRequestException('This circle’s neighbourhood is not in a cluster yet.');

    const unknown = dto.checklist.find((x) => !VISIT_CHECKLIST.some((i) => i.key === x.key));
    if (unknown) throw new BadRequestException(`Unknown checklist item “${unknown.key}”.`);
    const checklist = VISIT_CHECKLIST.map((item) => {
      const given = dto.checklist.find((x) => x.key === item.key);
      return { key: item.key, title: item.title, score: given?.score ?? null, note: given?.note?.trim() ?? '' };
    });

    const visit = await this.visitModel.create({
      cluster: cluster._id, circle: circle._id, supervisor: oid(user._id), date: dto.date,
      childrenPresent: dto.childrenPresent ?? null, checklist, overall: dto.overall,
      highlights: dto.highlights ?? '', concerns: dto.concerns ?? '', safeguarding: !!dto.safeguarding,
      followUps: (dto.followUps ?? []).map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
    });

    if (visit.safeguarding || visit.overall === 'urgent') {
      const what = visit.safeguarding ? 'raised a safeguarding concern' : 'marked a visit as urgent';
      this.notif.createForAdmins({
        sender: String(user._id), type: NotificationType.CLUSTER,
        title: visit.safeguarding ? 'Safeguarding concern' : 'Urgent visit report',
        message: `${user.fullName} ${what} at ${circle.name} (${cluster.name}).`,
        payload: { visitId: String(visit._id), circleId: String(circle._id), clusterId: String(cluster._id) },
      }).catch(() => {});
    }
    if (visit.safeguarding) {
      void this.email.queue('cluster.safeguarding', { email: this.email.supportEmail, name: 'Noor Circles team' }, {
        cluster: cluster.name, circle: circle.name, murabbi: (circle.murabbi as any)?.fullName ?? '', supervisor: user.fullName,
        date: visit.date, concerns: visit.concerns, url: this.email.link('/'),
      }, { dedupeKey: `cluster.safeguarding:${visit._id}` });
    }
    this.logger.log(`Visit logged → ${circle.name} by ${user.email}`);
    return { message: visit.safeguarding ? 'Visit saved. The admin team has been alerted about the safeguarding concern.' : 'Visit saved.', visit };
  }

  async listVisits(scope: Scope, filters: { circleId?: string; supervisorId?: string } = {}) {
    const q: Record<string, unknown> = { cluster: { $in: scope.clusterIds } };
    if (filters.circleId) { this.requireCircle(scope, filters.circleId); q.circle = oid(filters.circleId); }
    if (filters.supervisorId && Types.ObjectId.isValid(filters.supervisorId)) q.supervisor = oid(filters.supervisorId);
    const visits = await this.visitModel.find(q)
      .populate('circle', 'name').populate('cluster', 'name').populate('supervisor', 'fullName')
      .sort({ date: -1, createdAt: -1 }).limit(300).lean();
    return { visits, checklist: VISIT_CHECKLIST };
  }

  private async scopedVisit(scope: Scope, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const visit = await this.visitModel.findById(id);
    if (!visit) throw new NotFoundException('Visit not found.');
    if (!has(scope.clusterIds, visit.cluster)) throw new ForbiddenException('That visit is not in your cluster.');
    return visit;
  }

  async setFollowUp(scope: Scope, visitId: string, followUpId: string, done: boolean) {
    const visit = await this.scopedVisit(scope, visitId);
    const f = (visit.followUps as any).id(followUpId);
    if (!f) throw new NotFoundException('Follow-up not found.');
    f.done = done;
    f.doneAt = done ? new Date() : null;
    await visit.save();
    return { message: done ? 'Marked done.' : 'Marked open again.', visit: visit.toObject() };
  }

  async deleteVisit(user: Requester, scope: Scope, id: string) {
    const visit = await this.scopedVisit(scope, id);
    if (user.role !== UserRole.ADMIN && String(visit.supervisor) !== String(user._id)) {
      throw new ForbiddenException('Only the supervisor who wrote a visit report can remove it.');
    }
    await visit.deleteOne();
    return { message: 'Visit report removed.' };
  }

  // ══ Supervisor: circles ════════════════════════════════════════════════════

  /** What the circle form needs: the scope's neighbourhoods, murabbis to choose from and syllabus tracks. */
  async circleOptions(scope: Scope) {
    const [neighbourhoods, murabbis] = await Promise.all([
      this.nbhModel.find({ _id: { $in: scope.neighbourhoodIds } }).select('name city area').sort({ name: 1 }).lean(),
      this.userModel.find({ role: UserRole.MURABBI, isActive: true, isEmailVerified: true }).select('fullName').sort({ fullName: 1 }).lean(),
    ]);
    const tracks = (await this.syllabus.listTracks()).map((t: any) => ({ _id: t._id, name: t.name, ageGroup: t.ageGroup }));
    return { neighbourhoods, murabbis, tracks };
  }

  createCircle(user: Requester, scope: Scope, dto: CreateCircleDto) {
    this.requireNeighbourhood(scope, dto.neighbourhoodId);
    return this.admin.createCircle(dto, String(user._id));
  }

  updateCircle(user: Requester, scope: Scope, id: string, dto: UpdateCircleDto) {
    this.requireCircle(scope, id);
    if (dto.neighbourhoodId) this.requireNeighbourhood(scope, dto.neighbourhoodId);
    return this.admin.updateCircle(id, dto, String(user._id));
  }

  // ══ Supervisor: murabbis ═══════════════════════════════════════════════════

  async murabbis(scope: Scope) {
    const circles = await this.circleModel.find({ _id: { $in: scope.circleIds }, murabbi: { $ne: null } }).select('name murabbi isActive').lean();
    const ids = [...new Set(circles.map((c) => String(c.murabbi)))].map(oid);
    const [users, course, att] = await Promise.all([
      this.userModel.find({ _id: { $in: ids } }).select('fullName email phone isActive lastLoginAt tier').sort({ fullName: 1 }).lean(),
      this.courseModel.findOne({ key: ASAAS_KEY }).select('_id').lean(),
      attendanceTotals(this.attendanceModel, { circle: { $in: scope.circleIds }, sessionDate: { $gte: new Date(Date.now() - 28 * 86_400_000) } }, 'submittedBy'),
    ]);
    const assignments = course ? await this.assignmentModel.find({ course: course._id, user: { $in: ids } }).select('user certifiedAt dueDate').lean() : [];
    return {
      murabbis: users.map((u) => {
        const a = assignments.find((x) => String(x.user) === String(u._id));
        const t = att.get(String(u._id));
        return {
          ...u,
          circles: circles.filter((c) => String(c.murabbi) === String(u._id)).map((c) => ({ _id: c._id, name: c.name, isActive: c.isActive })),
          training: !a ? 'not-assigned' : a.certifiedAt ? 'certified' : 'in-training',
          certifiedAt: a?.certifiedAt ?? null,
          attendance28: t?.total ? rateOf(t) : null,
        };
      }),
    };
  }

  // ══ Supervisor: children ═══════════════════════════════════════════════════

  async students(scope: Scope, circleId?: string) {
    if (circleId) this.requireCircle(scope, circleId);
    const students = await this.studentModel.find({ circle: circleId ? oid(circleId) : { $in: scope.circleIds } })
      .select('fullName fatherName phone email dateOfBirth address circle neighbourhood isActive enrollmentDate')
      .populate('circle', 'name capacity').populate('neighbourhood', 'name')
      .sort({ fullName: 1 }).lean();
    return { students };
  }

  async enrolStudent(user: Requester, scope: Scope, dto: EnrollStudentDto) {
    this.requireCircle(scope, dto.circleId);
    const circle = await this.circleModel.findById(dto.circleId).select('neighbourhood').lean();
    return this.admin.enrollStudent({ ...dto, neighbourhoodId: String(circle!.neighbourhood) }, String(user._id));
  }

  async updateStudent(scope: Scope, id: string, dto: UpdateStudentDto) {
    await this.requireStudent(scope, id);
    return this.admin.updateStudent(id, dto);
  }

  async moveStudent(user: Requester, scope: Scope, id: string, dto: AssignCircleDto) {
    await this.requireStudent(scope, id);
    this.requireCircle(scope, dto.circleId);
    return this.admin.assignStudentCircle(id, dto, String(user._id));
  }

  async setStudentActive(scope: Scope, id: string, active: boolean) {
    await this.requireStudent(scope, id);
    return active ? this.admin.activateStudent(id) : this.admin.deactivateStudent(id);
  }

  // ══ Supervisor: interest from the website ══════════════════════════════════

  async interest(scope: Scope) {
    const f = await this.interestFilter(scope);
    if (!f) return { requests: [] };
    // The family profile answers stay with admins (Parent Insights).
    const requests = await this.interestModel.find(f).select('-profile -location')
      .populate('account', 'email role isActive mustChangePassword lastLoginAt').sort({ createdAt: -1 }).limit(500).lean();
    return { requests };
  }

  private async requireInterest(scope: Scope, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const f = await this.interestFilter(scope);
    if (!f || !(await this.interestModel.exists({ _id: oid(id), ...f }))) throw new ForbiddenException('That request is not from your cluster.');
  }

  async updateInterest(scope: Scope, id: string, dto: { status?: string; notes?: string }) {
    await this.requireInterest(scope, id);
    const { interest } = await this.interests.update(id, dto as any);
    const { profile: _profile, location: _location, ...rest } = interest as any;
    return { message: 'Interest request updated.', interest: rest };
  }

  async convertInterest(user: Requester, scope: Scope, id: string, dto: ConvertInterestDto) {
    await this.requireInterest(scope, id);
    return this.accounts.convertInterest(id, String(user._id), dto);
  }

  // ══ Supervisor: calendar ═══════════════════════════════════════════════════

  async calendar(scope: Scope, from?: string, to?: string) {
    const start = from ?? pkToday();
    const end = to ?? addDays(start, 56);
    if (end < start || addDays(start, 366) < end) throw new BadRequestException('Choose a range of up to a year.');
    const circles = await this.circleModel.find({ _id: { $in: scope.circleIds }, isActive: true }).lean();
    const [items, events] = await Promise.all([
      this.syllabus.calendarFor(circles as any, start, end),
      // Events this supervisor can change: ones for their circles only.
      this.eventModel.find({ circles: { $ne: [], $not: { $elemMatch: { $nin: scope.circleIds } } }, endDate: { $gte: start } })
        .populate('circles', 'name').sort({ startDate: 1 }).lean(),
    ]);
    return { from: start, to: end, items, events };
  }

  private requireEventCircles(scope: Scope, circleIds?: string[]) {
    if (!circleIds?.length) throw new BadRequestException('Choose the circles this applies to. Events for every circle are added by the admin team.');
    circleIds.forEach((c) => this.requireCircle(scope, c));
  }

  private async requireEvent(scope: Scope, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const e = await this.eventModel.findById(id).select('circles').lean();
    if (!e) throw new NotFoundException('Event not found.');
    if (!e.circles.length || e.circles.some((c) => !has(scope.circleIds, c))) {
      throw new ForbiddenException('Only events for your own circles can be changed here.');
    }
  }

  createEvent(scope: Scope, dto: CreateEventDto) {
    this.requireEventCircles(scope, dto.circleIds);
    return this.syllabus.createEvent(dto);
  }

  async updateEvent(scope: Scope, id: string, dto: UpdateEventDto) {
    await this.requireEvent(scope, id);
    if (dto.circleIds !== undefined) this.requireEventCircles(scope, dto.circleIds);
    return this.syllabus.updateEvent(id, dto);
  }

  async deleteEvent(scope: Scope, id: string) {
    await this.requireEvent(scope, id);
    return this.syllabus.deleteEvent(id);
  }

  // ══ Supervisor: messages ═══════════════════════════════════════════════════

  private audience(dto: { clusterId: string; to: 'murabbis' | 'parents' }) {
    return { type: `cluster-${dto.to}`, ids: [dto.clusterId] };
  }

  async messageAudience(scope: Scope, dto: { clusterId: string; to: 'murabbis' | 'parents' }) {
    if (!has(scope.clusterIds, dto.clusterId)) throw new ForbiddenException('That cluster is not one of yours.');
    return this.email.audiencePreview(this.audience(dto) as any);
  }

  async sendMessage(user: Requester, scope: Scope, dto: ClusterMessageDto) {
    if (!has(scope.clusterIds, dto.clusterId)) throw new ForbiddenException('That cluster is not one of yours.');
    return this.email.createCampaign(
      { subject: dto.subject, body: dto.body, audience: this.audience(dto) as any, testOnly: dto.testOnly },
      { _id: user._id, email: user.email, fullName: user.fullName },
    );
  }

  async sentMessages(user: Requester) {
    const messages = await this.campaignModel.find({ createdBy: oid(user._id) })
      .select('subject audienceLabel status recipients skipped createdAt scheduledFor').sort({ createdAt: -1 }).limit(50).lean();
    return { messages };
  }
}
