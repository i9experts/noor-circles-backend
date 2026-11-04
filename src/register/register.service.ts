import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Circle } from '../circle/circle.schema';
import { Cluster } from '../cluster/cluster.schema';
import { Neighbourhood } from '../neighbourhood/neighbourhood.schema';
import { Student } from '../student/student.schema';
import { Parent } from '../parent/parent.schema';
import { Attendance } from '../attendance/attendance.schema';
import { Interest } from '../interest/interest.schema';
import { MurabbiRating } from '../engagement/engagement.schema';
import { ParentRating } from '../parent-rating/parent-rating.schema';
import { RewardAllocation } from '../rewards/rewards.schema';
import { MurabbiProfile } from '../murabbi-profile/murabbi-profile.schema';
import { Course, CourseAssignment } from '../course/course.schema';
import { TrainingCertificate } from '../training/training.schema';
import { HostSpace } from '../host/host.schema';
import { ASAAS_KEY, CourseService } from '../course/course.service';
import { ParentCourseService } from '../parent-course/parent-course.service';
import { JournalService } from '../journal/journal.service';
import { HostService } from '../host/host.service';
import { REGISTER_TYPES, RegisterFollowUp, RegisterType } from './register.schema';
import { AddFollowUpNoteDto, UpdateFollowUpDto } from './register.dto';

const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const pkMonth = () => pkToday().slice(0, 7);
const str = (v: unknown) => (v == null ? '' : String(v));

/** Top-level answers in a family profile, for "how complete is it". */
const PROFILE_FIELDS = [
  'relationship', 'livesWith', 'household', 'work', 'days', 'times', 'transport', 'children',
  'language', 'needs', 'involvement', 'heardFrom', 'contactBy', 'contactTime',
];
function answered(v: unknown): boolean {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v as object).some(answered);
  return true;
}
function ageOf(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

type FollowUpOut = { status: string; nextDate: string | null; due: 'overdue' | 'today' | null; notes: number; lastNote: { at: Date; kind: string; text: string; byName: string } | null };

@Injectable()
export class RegisterService {
  constructor(
    @InjectModel(RegisterFollowUp.name) private followModel: Model<RegisterFollowUp>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Circle.name) private circleModel: Model<Circle>,
    @InjectModel(Cluster.name) private clusterModel: Model<Cluster>,
    @InjectModel(Neighbourhood.name) private nbhModel: Model<Neighbourhood>,
    @InjectModel(Student.name) private studentModel: Model<Student>,
    @InjectModel(Parent.name) private parentModel: Model<Parent>,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    @InjectModel(Interest.name) private interestModel: Model<Interest>,
    @InjectModel(MurabbiRating.name) private murabbiRatingModel: Model<MurabbiRating>,
    @InjectModel(ParentRating.name) private parentRatingModel: Model<ParentRating>,
    @InjectModel(RewardAllocation.name) private allocationModel: Model<RewardAllocation>,
    @InjectModel(MurabbiProfile.name) private profileModel: Model<MurabbiProfile>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(CourseAssignment.name) private assignmentModel: Model<CourseAssignment>,
    @InjectModel(TrainingCertificate.name) private certModel: Model<TrainingCertificate>,
    @InjectModel(HostSpace.name) private spaceModel: Model<HostSpace>,
    private readonly courses: CourseService,
    private readonly parentCourse: ParentCourseService,
    private readonly journal: JournalService,
    private readonly host: HostService,
  ) {}

  // ══ Shared ═════════════════════════════════════════════════════════════════

  private type(type: string): RegisterType {
    if (!(REGISTER_TYPES as readonly string[]).includes(type)) throw new BadRequestException('Unknown register.');
    return type as RegisterType;
  }

  private followOut(f: any): FollowUpOut {
    const today = pkToday();
    const open = f && f.status !== 'done' && f.nextDate;
    const last = f?.notes?.length ? f.notes[f.notes.length - 1] : null;
    return {
      status: f?.status ?? 'new',
      nextDate: f?.nextDate ?? null,
      due: open ? (f.nextDate < today ? 'overdue' : f.nextDate === today ? 'today' : null) : null,
      notes: f?.notes?.length ?? 0,
      lastNote: last ? { at: last.at, kind: last.kind, text: last.text, byName: last.byName } : null,
    };
  }

  private async followUps(type: RegisterType, ids: Types.ObjectId[]) {
    const rows = await this.followModel.find({ subjectType: type, subject: { $in: ids } }).lean();
    return new Map(rows.map((r) => [String(r.subject), r]));
  }

  /** Neighbourhood id → { name, city, cluster }. */
  private async places() {
    const [nbhs, clusters] = await Promise.all([
      this.nbhModel.find().select('name city').lean(),
      this.clusterModel.find().select('name neighbourhoods').lean(),
    ]);
    const clusterOf = new Map<string, string>();
    for (const c of clusters) for (const n of c.neighbourhoods ?? []) clusterOf.set(String(n), c.name);
    return new Map(nbhs.map((n: any) => [String(n._id), { area: n.name as string, city: (n.city ?? '') as string, cluster: clusterOf.get(String(n._id)) ?? null }]));
  }

  /** Account state shown in every register. */
  private account(u: any) {
    if (!u) return { exists: false, active: false, pendingApproval: false, mustChangePassword: false, lastLoginAt: null, createdAt: null };
    return {
      exists: true, active: !!u.isActive, pendingApproval: !!u.pendingApproval,
      mustChangePassword: !!u.mustChangePassword, lastLoginAt: u.lastLoginAt ?? null, createdAt: u.createdAt ?? null,
    };
  }

  /** The interest form that led to each account (for where they came from). */
  private async interestsFor(userIds: Types.ObjectId[]) {
    const rows = await this.interestModel.find({ account: { $in: userIds } }).select('account createdAt city neighbourhood roleDetail').lean();
    return new Map(rows.map((r: any) => [String(r.account), r]));
  }

  // ══ Murabbis ═══════════════════════════════════════════════════════════════

  async murabbis() {
    const users = await this.userModel.find({ role: UserRole.MURABBI })
      .select('fullName email phone address isActive pendingApproval mustChangePassword lastLoginAt tier createdAt').lean();
    const ids = users.map((u) => u._id as Types.ObjectId);
    const month = pkMonth();
    const [circles, places, follows, interests, profiles, ratings, rewards, asaas, journal, certs, otherAssignments] = await Promise.all([
      this.circleModel.find({ murabbi: { $in: ids } }).select('name murabbi neighbourhood isActive').lean(),
      this.places(),
      this.followUps('murabbi', ids),
      this.interestsFor(ids),
      this.profileModel.find({ user: { $in: ids } }).select('user completeness').lean(),
      this.murabbiRatingModel.find({ murabbi: { $in: ids } }).select('murabbi month finalScore').sort({ month: -1 }).lean(),
      this.allocationModel.aggregate([
        { $match: { recipientType: 'murabbi', murabbi: { $in: ids }, status: { $in: ['approved', 'paid'] } } },
        { $group: { _id: '$murabbi', paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } } } },
      ]),
      this.courses.progressReport(ASAAS_KEY).catch(() => null),
      this.journal.progress().catch(() => [] as any[]),
      this.certModel.find({ user: { $in: ids } }).select('user tier certificateNumber').lean(),
      this.otherCourses(ids),
    ]);
    const circleIds = circles.map((c) => c._id);
    const [students, lastSessions] = await Promise.all([
      this.studentModel.aggregate([{ $match: { circle: { $in: circleIds }, isActive: true } }, { $group: { _id: '$circle', n: { $sum: 1 } } }]),
      this.attendanceModel.aggregate([{ $match: { circle: { $in: circleIds } } }, { $group: { _id: '$circle', last: { $max: '$sessionDate' }, sessions: { $sum: 1 } } }]),
    ]);
    const studentsBy = new Map(students.map((s) => [String(s._id), s.n as number]));
    const sessionsBy = new Map(lastSessions.map((s) => [String(s._id), s]));
    const asaasBy = new Map<string, any>((asaas?.rows ?? []).map((r: any) => [String(r.user._id), r]));
    const journalBy = new Map((journal as any[]).map((r) => [String(r.user._id), r]));

    return users.map((u: any) => {
      const id = String(u._id);
      const mine = circles.filter((c) => String(c.murabbi) === id);
      const place = mine.map((c) => places.get(String(c.neighbourhood))).find(Boolean);
      const interest = interests.get(id);
      const a = asaasBy.get(id);
      const j = journalBy.get(id);
      const rating = ratings.find((r) => String(r.murabbi) === id && r.month === month) ?? null;
      const lastRating = ratings.find((r) => String(r.murabbi) === id) ?? null;
      const rw = rewards.find((r) => String(r._id) === id);
      const last = mine.map((c) => sessionsBy.get(String(c._id))?.last).filter(Boolean).sort((x: any, y: any) => +y - +x)[0] ?? null;
      const other = otherAssignments.get(id) ?? { assigned: 0, certified: 0 };
      return {
        _id: id,
        fullName: u.fullName, email: u.email, phone: u.phone ?? '', address: u.address ?? '',
        area: place?.area ?? interest?.neighbourhood ?? '', city: place?.city ?? interest?.city ?? '', cluster: place?.cluster ?? null,
        background: interest?.roleDetail ?? '', interestAt: interest?.createdAt ?? null,
        account: this.account(u),
        circles: mine.map((c) => ({ _id: String(c._id), name: c.name, active: c.isActive !== false, students: studentsBy.get(String(c._id)) ?? 0 })),
        students: mine.reduce((s, c) => s + (studentsBy.get(String(c._id)) ?? 0), 0),
        sessions: mine.reduce((s, c) => s + (sessionsBy.get(String(c._id))?.sessions ?? 0), 0),
        lastSession: last,
        asaas: a ? {
          status: a.status, lessonsCompleted: a.lessonsCompleted, lessonsTotal: a.lessonsTotal, percentHeard: a.percentHeard,
          lastActive: a.lastActive, dueDate: a.dueDate, overdue: a.overdue,
          assessment: a.assessment, reflection: a.reflection, certificate: a.certificate?.number ?? null,
        } : null,
        certificates: certs.filter((c) => String(c.user) === id).map((c) => ({ tier: c.tier, number: c.certificateNumber })),
        otherCourses: other,
        introduction: profiles.find((p) => String(p.user) === id)?.completeness ?? null,
        journal: j ? { pagesDone: j.pagesDone, totalPages: j.totalPages, moments: j.moments ?? 0 } : null,
        rating: rating ? rating.finalScore : null,
        lastRating: lastRating ? { month: lastRating.month, score: lastRating.finalScore } : null,
        rewards: { paid: rw?.paid ?? 0, approved: rw?.approved ?? 0 },
        followUp: this.followOut(follows.get(id)),
      };
    }).sort((x, y) => x.fullName.localeCompare(y.fullName));
  }

  /** Murabbi courses other than Asaas: how many assigned and certified. */
  private async otherCourses(ids: Types.ObjectId[]) {
    const others = await this.courseModel.find({ audience: { $ne: 'parent' }, key: { $ne: ASAAS_KEY } }).select('_id').lean();
    const rows = await this.assignmentModel.aggregate([
      { $match: { user: { $in: ids }, course: { $in: others.map((c) => c._id) } } },
      { $group: { _id: '$user', assigned: { $sum: 1 }, certified: { $sum: { $cond: [{ $ne: ['$certifiedAt', null] }, 1, 0] } } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), { assigned: r.assigned as number, certified: r.certified as number }]));
  }

  // ══ Parents ════════════════════════════════════════════════════════════════

  async parents() {
    const parents = await this.parentModel.find()
      .select('fullName phone email whatsappNumber students isEngaged notes account createdAt +profile').lean();
    const accountIds = parents.map((p) => p.account).filter(Boolean) as Types.ObjectId[];
    const studentIds = parents.flatMap((p) => p.students ?? []);
    const month = pkMonth();
    const [users, students, places, follows, asaas, ratings, rewards] = await Promise.all([
      this.userModel.find({ _id: { $in: accountIds } }).select('isActive pendingApproval mustChangePassword lastLoginAt createdAt').lean(),
      this.studentModel.find({ _id: { $in: studentIds } }).select('fullName dateOfBirth circle neighbourhood murabbi isActive enrollmentDate')
        .populate('circle', 'name').populate('murabbi', 'fullName').lean(),
      this.places(),
      this.followUps('parent', parents.map((p) => p._id as Types.ObjectId)),
      this.parentCourse.progress().catch(() => null),
      this.parentRatingModel.find({ user: { $in: accountIds } }).select('user month finalScore').sort({ month: -1 }).lean(),
      this.allocationModel.aggregate([
        { $match: { recipientType: 'parent', parent: { $in: accountIds }, status: { $in: ['approved', 'paid'] } } },
        { $group: { _id: '$parent', paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } } } },
      ]),
    ]);
    const attendance = await this.attendanceModel.aggregate([
      { $match: { 'records.student': { $in: studentIds } } },
      { $unwind: '$records' },
      { $match: { 'records.student': { $in: studentIds } } },
      { $group: {
        _id: '$records.student', total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$records.status', 'present'] }, 1, 0] } },
        last: { $max: '$sessionDate' },
      } },
    ]);
    const attBy = new Map(attendance.map((a) => [String(a._id), a]));
    const userBy = new Map(users.map((u) => [String(u._id), u]));
    const asaasBy = new Map<string, any>((asaas?.rows ?? []).map((r: any) => [String(r.user._id), r]));

    return parents.map((p: any) => {
      const id = String(p._id);
      const acc = p.account ? String(p.account) : null;
      const kids = students.filter((s: any) => (p.students ?? []).some((x: any) => String(x) === String(s._id)));
      const place = kids.map((s: any) => places.get(String(s.neighbourhood))).find(Boolean);
      const a = acc ? asaasBy.get(acc) : null;
      const rating = acc ? ratings.find((r) => String(r.user) === acc && r.month === month) : null;
      const rw = acc ? rewards.find((r) => String(r._id) === acc) : null;
      const profileAnswered = p.profile ? PROFILE_FIELDS.filter((f) => answered(p.profile[f])).length : 0;
      return {
        _id: id,
        fullName: p.fullName, phone: p.phone ?? '', whatsapp: p.whatsappNumber || p.phone || '', email: p.email ?? '',
        area: place?.area ?? '', city: place?.city ?? '', cluster: place?.cluster ?? null,
        engaged: p.isEngaged !== false, notes: p.notes ?? '', addedAt: p.createdAt ?? null,
        account: { ...this.account(acc ? userBy.get(acc) : null), userId: acc },
        children: kids.map((s: any) => {
          const att = attBy.get(String(s._id));
          return {
            _id: String(s._id), fullName: s.fullName, age: ageOf(s.dateOfBirth), active: s.isActive !== false,
            circle: s.circle ? { _id: String(s.circle._id), name: s.circle.name } : null,
            murabbi: s.murabbi?.fullName ?? null,
            attendance: att ? { present: att.present, total: att.total, percent: att.total ? Math.round((att.present / att.total) * 100) : null, last: att.last } : null,
          };
        }),
        profile: { answered: profileAnswered, total: PROFILE_FIELDS.length, percent: Math.round((profileAnswered / PROFILE_FIELDS.length) * 100), updatedAt: p.profile?.updatedAt ?? null },
        asaas: a ? {
          status: a.status, lessonsCompleted: a.lessonsCompleted, lessonsTotal: a.lessonsTotal, currentModule: a.currentModule,
          quizzesPassed: a.quizzesPassed, finalPassed: a.finalPassed, lastActive: a.lastActive, certificate: a.certificate?.number ?? null,
        } : null,
        rating: rating ? rating.finalScore : null,
        rewards: { paid: rw?.paid ?? 0, approved: rw?.approved ?? 0 },
        followUp: this.followOut(follows.get(id)),
      };
    }).sort((x, y) => x.fullName.localeCompare(y.fullName));
  }

  // ══ Hosts ══════════════════════════════════════════════════════════════════

  async hosts() {
    const users = await this.userModel.find({ role: UserRole.HOST })
      .select('fullName email phone address isActive pendingApproval mustChangePassword lastLoginAt createdAt').lean();
    const ids = users.map((u) => u._id as Types.ObjectId);
    const [spaces, places, follows, interests, training] = await Promise.all([
      this.spaceModel.find({ host: { $in: ids } }).select('host name type status city area neighbourhood capacity').lean(),
      this.places(),
      this.followUps('host', ids),
      this.interestsFor(ids),
      this.host.trainingOverview(),
    ]);
    const circles = await this.circleModel.find({ venue: { $in: spaces.map((s) => s._id) } }).select('name venue').lean();
    const trainingBy = new Map(training.map((t) => [String(t.user._id), t]));
    return users.map((u: any) => {
      const id = String(u._id);
      const mine = spaces.filter((s) => String(s.host) === id);
      const place = mine.map((s) => s.neighbourhood && places.get(String(s.neighbourhood))).find(Boolean);
      const interest = interests.get(id);
      const t = trainingBy.get(id);
      return {
        _id: id,
        fullName: u.fullName, email: u.email, phone: u.phone ?? '', address: u.address ?? '',
        area: place?.area ?? mine[0]?.area ?? interest?.neighbourhood ?? '', city: place?.city ?? mine[0]?.city ?? interest?.city ?? '',
        cluster: place?.cluster ?? null, interestAt: interest?.createdAt ?? null,
        account: this.account(u),
        spaces: mine.map((s) => ({
          _id: String(s._id), name: s.name, type: s.type, status: s.status, capacity: s.capacity,
          circles: circles.filter((c) => String(c.venue) === String(s._id)).map((c) => c.name),
        })),
        training: t ? { done: t.done, total: t.total, certificate: t.certificate?.number ?? null } : null,
        followUp: this.followOut(follows.get(id)),
      };
    }).sort((x, y) => x.fullName.localeCompare(y.fullName));
  }

  // ══ Follow-ups ═════════════════════════════════════════════════════════════

  /** The subject must exist and belong to that register. */
  private async subject(type: RegisterType, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found.');
    const _id = new Types.ObjectId(id);
    const doc = type === 'parent'
      ? await this.parentModel.findById(_id).select('fullName').lean()
      : await this.userModel.findOne({ _id, role: type === 'murabbi' ? UserRole.MURABBI : UserRole.HOST }).select('fullName').lean();
    if (!doc) throw new NotFoundException('Not found.');
    return { _id, name: (doc as any).fullName as string };
  }

  async followUp(type: string, id: string) {
    const t = this.type(type);
    const s = await this.subject(t, id);
    const f = await this.followModel.findOne({ subjectType: t, subject: s._id }).lean();
    return {
      subjectType: t, subject: id, name: s.name, ...this.followOut(f),
      log: [...(f?.notes ?? [])].reverse().map((n) => ({ _id: n._id, at: n.at, kind: n.kind, text: n.text, byName: n.byName })),
    };
  }

  private set(dto: UpdateFollowUpDto) {
    const $set: Record<string, unknown> = {};
    if (dto.status !== undefined) $set.status = dto.status;
    if (dto.nextDate !== undefined) $set.nextDate = dto.nextDate || null;
    return $set;
  }

  async updateFollowUp(type: string, id: string, dto: UpdateFollowUpDto) {
    const t = this.type(type);
    const s = await this.subject(t, id);
    await this.followModel.updateOne({ subjectType: t, subject: s._id }, { $set: this.set(dto) }, { upsert: true });
    return { message: 'Follow-up updated.', ...(await this.followUp(t, id)) };
  }

  async addNote(type: string, id: string, dto: AddFollowUpNoteDto, by: UserDocument) {
    const t = this.type(type);
    const s = await this.subject(t, id);
    const text = str(dto.text).trim();
    if (!text) throw new BadRequestException('Write a note.');
    const $set = this.set(dto);
    // A first note moves a new follow-up along, unless a status was chosen.
    const existing = await this.followModel.findOne({ subjectType: t, subject: s._id }).select('status').lean();
    if (dto.status === undefined && (!existing || existing.status === 'new')) $set.status = 'in-progress';
    await this.followModel.updateOne(
      { subjectType: t, subject: s._id },
      { $set, $push: { notes: { at: new Date(), by: by._id, byName: by.fullName, kind: dto.kind, text } } },
      { upsert: true },
    );
    return { message: 'Note added.', ...(await this.followUp(t, id)) };
  }

  /** Follow-ups due today or overdue, for the dashboard. */
  async due() {
    const today = pkToday();
    const rows = await this.followModel.find({ nextDate: { $ne: null, $lte: today }, status: { $ne: 'done' } }).sort({ nextDate: 1 }).lean();
    const ofType = (t: RegisterType) => rows.filter((r) => r.subjectType === t).map((r) => r.subject);
    const [users, parents] = await Promise.all([
      this.userModel.find({ _id: { $in: [...ofType('murabbi'), ...ofType('host')] } }).select('fullName phone').lean(),
      this.parentModel.find({ _id: { $in: ofType('parent') } }).select('fullName phone whatsappNumber').lean(),
    ]);
    const nameOf = new Map<string, any>([...users, ...parents].map((d: any) => [String(d._id), d]));
    const items = rows.filter((r) => nameOf.has(String(r.subject))).map((r) => {
      const d = nameOf.get(String(r.subject));
      const last = r.notes?.length ? r.notes[r.notes.length - 1] : null;
      return {
        subjectType: r.subjectType, subject: String(r.subject), name: d.fullName, phone: d.whatsappNumber || d.phone || '',
        status: r.status, nextDate: r.nextDate, overdue: (r.nextDate ?? '') < today,
        lastNote: last ? { at: last.at, kind: last.kind, text: last.text } : null,
      };
    });
    return {
      today: items.filter((i) => !i.overdue).length,
      overdue: items.filter((i) => i.overdue).length,
      byType: Object.fromEntries(REGISTER_TYPES.map((t) => [t, items.filter((i) => i.subjectType === t).length])),
      items,
    };
  }
}
