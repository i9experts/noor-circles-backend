import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Cluster, ClusterDocument } from '../cluster/cluster.schema';
import { Neighbourhood, NeighbourhoodDocument } from '../neighbourhood/neighbourhood.schema';
import { EmailService } from '../email/email.service';
import { AudioStoreService, looksLikeMp3 } from '../course/audio-store.service';
import { mp3DurationSec } from '../course/mp3-duration';
import {
  HostModuleAudio, HostModuleAudioDocument, HostSpace, HostSpaceDocument, HostTraining, HostTrainingDocument,
  SpaceUnavailability, SpaceUnavailabilityDocument,
} from './host.schema';
import { DAYS, FACILITIES, HOST_MODULES, HOST_PASS_MARK, SPACE_TYPES, SpaceStatus, VISIT_CHECKLIST, spaceTypeFrom } from './host.content';
import { AdminSpaceDto, CreateSpaceDto, HostSpaceDto, UnavailableDto, VisitDto } from './host.dto';

interface Requester { _id: Types.ObjectId | string; role: string; fullName?: string }

const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));
const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** For a new space's default name: "Hussaini family lawn". */
const SHORT_NAME: Record<string, string> = { 'living-room': 'home', lawn: 'lawn', community: 'space', 'masjid-room': 'masjid room', hall: 'hall', other: 'space' };
const fmtTime = (t?: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const schedule = (c: { meetingDay?: number | null; meetingTime?: string | null }) =>
  c.meetingDay == null ? '' : `${DAYS[c.meetingDay]}s${c.meetingTime ? `, ${fmtTime(c.meetingTime)}` : ''}`;

/**
 * Hosts and the spaces they offer. A space is visited (admin or the cluster's
 * supervisor fills in a checklist), approved by an admin, then a circle can
 * meet there (its venue). Hosts describe their space, see the circle and its
 * murabbi, mark dates the space can't be used, and take Asaas for Hosts.
 */
@Injectable()
export class HostService {
  private readonly logger = new Logger(HostService.name);

  constructor(
    @InjectModel(HostSpace.name)           private readonly spaceModel:    Model<HostSpaceDocument>,
    @InjectModel(SpaceUnavailability.name) private readonly offModel:      Model<SpaceUnavailabilityDocument>,
    @InjectModel(HostTraining.name)        private readonly trainingModel: Model<HostTrainingDocument>,
    @InjectModel(HostModuleAudio.name)     private readonly audioModel:    Model<HostModuleAudioDocument>,
    @InjectModel(User.name)                private readonly userModel:     Model<UserDocument>,
    @InjectModel(Circle.name)              private readonly circleModel:   Model<CircleDocument>,
    @InjectModel(Cluster.name)             private readonly clusterModel:  Model<ClusterDocument>,
    @InjectModel(Neighbourhood.name)       private readonly nbhModel:      Model<NeighbourhoodDocument>,
    private readonly email: EmailService,
    private readonly audio: AudioStoreService,
  ) {}

  // ══ Options ════════════════════════════════════════════════════════════════

  options() {
    return { spaceTypes: SPACE_TYPES, facilities: FACILITIES, days: DAYS, checklist: VISIT_CHECKLIST };
  }

  // ══ Creating a host's space (from the website interest) ═════════════════════

  /** Called when an admin creates a host account from an interest request. */
  async createFromInterest(hostId: Types.ObjectId, interest: { _id: Types.ObjectId; firstName: string; lastName: string; city: string; neighbourhood: string; roleDetail?: string | null }) {
    const type = spaceTypeFrom(interest.roleDetail);
    const nbh = interest.neighbourhood
      ? await this.nbhModel.findOne({ name: new RegExp(`^${interest.neighbourhood.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean()
      : null;
    const space = await this.spaceModel.create({
      host: hostId, name: `${interest.lastName || interest.firstName} family ${SHORT_NAME[type] ?? 'space'}`.slice(0, 100),
      type, city: interest.city ?? '', area: interest.neighbourhood ?? '', neighbourhood: nbh?._id ?? null, interest: interest._id,
    });
    await this.trainingModel.updateOne({ user: hostId }, { $setOnInsert: { user: hostId } }, { upsert: true });
    return space;
  }

  // ══ Scope (admins: everything; supervisors: their clusters' neighbourhoods) ══

  private async scope(user: Requester): Promise<Types.ObjectId[] | null> {
    if (user.role === UserRole.ADMIN) return null;
    const clusters = await this.clusterModel.find({ supervisors: oid(user._id), isActive: true }).select('neighbourhoods').lean();
    return clusters.flatMap((c) => c.neighbourhoods);
  }

  private async spaceInScope(user: Requester, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const space = await this.spaceModel.findById(id);
    if (!space) throw new NotFoundException('Space not found.');
    const nbhs = await this.scope(user);
    if (nbhs && !(space.neighbourhood && nbhs.some((n) => String(n) === String(space.neighbourhood)))) {
      throw new ForbiddenException('That space is not in your cluster.');
    }
    return space;
  }

  // ══ The host's own portal ══════════════════════════════════════════════════

  private async ownSpace(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id.');
    const space = await this.spaceModel.findOne({ _id: oid(id), host: oid(userId) });
    if (!space) throw new NotFoundException('Space not found.');
    return space;
  }

  /** Upcoming meeting dates for a weekly circle (next `n`, from today). */
  private nextDates(c: { meetingDay?: number | null }, n = 6) {
    if (c.meetingDay == null) return [];
    const today = pkToday();
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const first = addDays(today, (c.meetingDay - dow + 7) % 7);
    return Array.from({ length: n }, (_, i) => addDays(first, i * 7));
  }

  async me(userId: string) {
    const uid = oid(userId);
    const [user, spaces, training] = await Promise.all([
      this.userModel.findById(uid).select('fullName email phone').lean(),
      this.spaceModel.find({ host: uid }).populate('neighbourhood', 'name city').sort({ createdAt: 1 }).lean(),
      this.training(userId),
    ]);
    const spaceIds = spaces.map((s) => s._id);
    const [circles, off] = await Promise.all([
      this.circleModel.find({ venue: { $in: spaceIds } }).populate('murabbi', 'fullName phone').select('name venue murabbi meetingDay meetingTime isActive').lean(),
      this.offModel.find({ space: { $in: spaceIds }, date: { $gte: pkToday() } }).sort({ date: 1 }).lean(),
    ]);
    return {
      host: user,
      spaces: spaces.map((s: any) => {
        const mine = circles.filter((c: any) => String(c.venue) === String(s._id));
        const offDates = off.filter((o) => String(o.space) === String(s._id));
        const lastVisit = s.visits?.length ? s.visits[s.visits.length - 1] : null;
        return {
          ...s, visits: undefined, adminNotes: undefined,
          lastVisitAt: lastVisit?.at ?? null, visited: !!lastVisit,
          neighbourhood: s.neighbourhood ? { _id: s.neighbourhood._id, name: s.neighbourhood.name } : null,
          circles: mine.map((c: any) => ({
            _id: c._id, name: c.name, schedule: schedule(c), meetingDay: c.meetingDay, meetingTime: c.meetingTime, isActive: c.isActive,
            murabbi: c.murabbi ? { fullName: c.murabbi.fullName, phone: c.murabbi.phone ?? null } : null,
            upcoming: this.nextDates(c).map((d) => ({ date: d, unavailable: offDates.some((o) => o.date === d) })),
          })),
          unavailable: offDates.map((o) => ({ _id: o._id, date: o.date, reason: o.reason })),
        };
      }),
      training: { done: training.done, total: training.total, certificate: training.certificate },
    };
  }

  private clean(dto: HostSpaceDto) {
    const out: Record<string, unknown> = {};
    for (const k of ['name', 'type', 'address', 'city', 'area', 'capacity', 'notes'] as const) if (dto[k] !== undefined) out[k] = dto[k];
    if (dto.facilities !== undefined) out.facilities = [...new Set(dto.facilities)].filter((f) => FACILITIES.some((x) => x.value === f));
    if (dto.availability !== undefined) out.availability = dto.availability;
    if (dto.photos !== undefined) out.photos = dto.photos.slice(0, 6);
    return out;
  }

  async updateMySpace(userId: string, id: string, dto: HostSpaceDto) {
    const space = await this.ownSpace(userId, id);
    space.set(this.clean(dto));
    await space.save();
    return { message: 'Your space is saved. JazakAllah khair.', space };
  }

  async addUnavailable(userId: string, id: string, dto: UnavailableDto) {
    const space = await this.ownSpace(userId, id);
    if (dto.date < pkToday()) throw new BadRequestException('Choose today or a later date.');
    try {
      await this.offModel.create({ space: space._id, date: dto.date, reason: dto.reason?.trim() ?? '', createdBy: oid(userId) });
    } catch (err: any) {
      if (err?.code === 11000) throw new BadRequestException('That date is already marked.');
      throw err;
    }
    // Tell the murabbi of every circle meeting there, and the team.
    const host = await this.userModel.findById(userId).select('fullName phone').lean();
    const circles = await this.circleModel.find({ venue: space._id }).populate('murabbi', 'fullName email').select('name murabbi').lean();
    const data = {
      spaceName: space.name, date: dto.date, reason: dto.reason?.trim() ?? '', hostName: host?.fullName ?? 'The host',
      hostPhone: host?.phone ?? '', circles: circles.map((c) => c.name).join(', '), url: this.email.link('/'),
    };
    const seen = new Set<string>();
    for (const c of circles as any[]) {
      if (!c.murabbi?.email || seen.has(c.murabbi.email)) continue;
      seen.add(c.murabbi.email);
      void this.email.queue('space.unavailable', { email: c.murabbi.email, name: c.murabbi.fullName, userId: c.murabbi._id }, data);
    }
    void this.email.queue('space.unavailable', { email: this.email.supportEmail, name: 'Noor Circles team' }, data);
    return {
      message: circles.length ? `Marked. ${circles.length === 1 ? 'The murabbi has' : 'The murabbis have'} been told, and the Noor Circles team.` : 'Marked. The Noor Circles team has been told.',
      notified: seen.size,
    };
  }

  async removeUnavailable(userId: string, offId: string) {
    if (!Types.ObjectId.isValid(offId)) throw new BadRequestException('Invalid id.');
    const off = await this.offModel.findById(offId);
    if (!off) throw new NotFoundException('Date not found.');
    await this.ownSpace(userId, String(off.space));
    await off.deleteOne();
    return { message: 'Removed. The space shows as available again that day.' };
  }

  // ══ Asaas for Hosts ════════════════════════════════════════════════════════

  async training(userId: string) {
    const uid = oid(userId);
    const [t, audios, user] = await Promise.all([
      this.trainingModel.findOne({ user: uid }).lean(),
      this.audioModel.find().lean(),
      this.userModel.findById(uid).select('fullName').lean(),
    ]);
    const passed = t?.passed ?? {};
    const modules = HOST_MODULES.map((m) => {
      const a = audios.find((x) => x.module === m.key);
      return {
        key: m.key, number: m.number, titleEn: m.titleEn, titleUr: m.titleUr, summaryEn: m.summaryEn, summaryUr: m.summaryUr,
        sections: m.sections,
        check: { passMark: HOST_PASS_MARK, questions: m.check.map((q) => ({ questionUr: q.questionUr, questionEn: q.questionEn, options: q.options })) },
        passedAt: passed[m.key] ?? null, attempts: t?.attempts?.[m.key] ?? 0,
        audio: a ? { url: `/host/training/audio/${a._id}?token=${encodeURIComponent(this.audio.issueToken(String(a._id), userId).token)}`, durationSec: a.durationSec } : null,
      };
    });
    const done = modules.filter((m) => m.passedAt).length;
    return {
      name: user?.fullName ?? '',
      modules, done, total: modules.length,
      certificate: t?.certificateNumber ? { number: t.certificateNumber, issuedOn: t.certifiedAt } : null,
    };
  }

  async check(userId: string, key: string, answers: number[]) {
    const m = HOST_MODULES.find((x) => x.key === key);
    if (!m) throw new NotFoundException('Module not found.');
    if (!Array.isArray(answers) || answers.length !== m.check.length) throw new BadRequestException(`Answer all ${m.check.length} questions.`);
    const results = m.check.map((q, i) => ({ chosen: answers[i], correct: q.correct, right: answers[i] === q.correct }));
    const correct = results.filter((r) => r.right).length;
    const passed = correct >= HOST_PASS_MARK;
    const uid = oid(userId);
    await this.trainingModel.updateOne(
      { user: uid },
      { $inc: { [`attempts.${key}`]: 1 }, ...(passed ? { $set: { [`passed.${key}`]: new Date().toISOString() } } : {}) },
      { upsert: true },
    );
    let certificate: string | null = null;
    if (passed) {
      const t = await this.trainingModel.findOne({ user: uid }).lean();
      if (t && !t.certificateNumber && HOST_MODULES.every((x) => t.passed?.[x.key])) {
        certificate = `NCH-${new Date().getFullYear()}-${userId.slice(-6).toUpperCase()}`;
        await this.trainingModel.updateOne({ user: uid, certificateNumber: null }, { $set: { certificateNumber: certificate, certifiedAt: new Date() } });
      }
    }
    return {
      message: passed ? (certificate ? 'MashaAllah! You have completed Asaas for Hosts.' : 'Well done, you passed this module.') : `You got ${correct} of ${m.check.length}. You need ${HOST_PASS_MARK}; read the module again and try once more.`,
      correct, total: m.check.length, passMark: HOST_PASS_MARK, passed, results, certificate,
    };
  }

  async uploadAudio(key: string, file: Express.Multer.File | undefined) {
    if (!HOST_MODULES.some((m) => m.key === key)) throw new NotFoundException('Module not found.');
    if (!file?.buffer?.length || !looksLikeMp3(file.buffer)) throw new BadRequestException('Upload an MP3 file.');
    const old = await this.audioModel.findOne({ module: key }).lean();
    const id = await this.audio.save(file.buffer, `host-${key}.mp3`);
    await this.audioModel.updateOne({ module: key }, { $set: { file: id, durationSec: mp3DurationSec(file.buffer) ?? 0 } }, { upsert: true });
    if (old) await this.audio.remove(old.file);
    return { message: 'Audio added to the module.' };
  }

  async removeAudio(key: string) {
    const old = await this.audioModel.findOneAndDelete({ module: key }).lean();
    if (old) await this.audio.remove(old.file);
    return { message: 'Audio removed.' };
  }

  async audioFor(audioId: string, token: string, range?: string) {
    if (!Types.ObjectId.isValid(audioId) || !this.audio.verifyToken(audioId, token)) throw new ForbiddenException('This link has expired. Reload the page.');
    const a = await this.audioModel.findById(audioId).lean();
    if (!a) throw new NotFoundException('Audio not found.');
    const { size } = await this.audio.open(a.file);
    const m = /^bytes=(\d*)-(\d*)$/.exec(range ?? '');
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      const { stream } = await this.audio.open(a.file, { start, end });
      return { stream, size, start, end, partial: true };
    }
    const { stream } = await this.audio.open(a.file);
    return { stream, size, start: 0, end: size - 1, partial: false };
  }

  // ══ Admins and supervisors ═════════════════════════════════════════════════

  async listSpaces(user: Requester, status?: string) {
    const nbhs = await this.scope(user);
    const q: Record<string, unknown> = {};
    if (nbhs) q.neighbourhood = { $in: nbhs };
    if (status) q.status = status;
    const spaces = await this.spaceModel.find(q).populate('host', 'fullName email phone').populate('neighbourhood', 'name city').sort({ createdAt: -1 }).lean();
    const ids = spaces.map((s) => s._id);
    const [circles, clusters, trainings, off] = await Promise.all([
      this.circleModel.find({ venue: { $in: ids } }).populate('murabbi', 'fullName').select('name venue murabbi meetingDay meetingTime').lean(),
      this.clusterModel.find().select('name neighbourhoods').lean(),
      this.trainingModel.find({ user: { $in: spaces.map((s: any) => s.host?._id).filter(Boolean) } }).lean(),
      this.offModel.find({ space: { $in: ids }, date: { $gte: pkToday() } }).select('space date').lean(),
    ]);
    const clusterOf = (n: any) => clusters.find((c) => c.neighbourhoods.some((x) => String(x) === String(n?._id ?? n)))?.name ?? null;
    return spaces.map((s: any) => {
      const t = trainings.find((x) => String(x.user) === String(s.host?._id));
      const last = s.visits?.length ? s.visits[s.visits.length - 1] : null;
      return {
        _id: s._id, name: s.name, type: s.type, status: s.status, address: s.address, city: s.city, area: s.area, capacity: s.capacity,
        facilities: s.facilities, photos: s.photos, createdAt: s.createdAt,
        host: s.host ? { _id: s.host._id, fullName: s.host.fullName, email: s.host.email, phone: s.host.phone ?? null } : null,
        neighbourhood: s.neighbourhood ? { _id: s.neighbourhood._id, name: s.neighbourhood.name } : null,
        cluster: clusterOf(s.neighbourhood),
        circles: circles.filter((c: any) => String(c.venue) === String(s._id)).map((c: any) => ({ _id: c._id, name: c.name, schedule: schedule(c), murabbi: c.murabbi?.fullName ?? null })),
        lastVisit: last ? { at: last.at, byName: last.byName, recommendation: last.recommendation } : null,
        training: { done: HOST_MODULES.filter((m) => t?.passed?.[m.key]).length, total: HOST_MODULES.length, certified: !!t?.certificateNumber },
        unavailableSoon: off.filter((o) => String(o.space) === String(s._id)).length,
      };
    });
  }

  async getSpace(user: Requester, id: string) {
    const space = await this.spaceInScope(user, id);
    const [row] = (await this.listSpaces(user)).filter((s) => String(s._id) === String(space._id));
    const [off, training] = await Promise.all([
      this.offModel.find({ space: space._id }).sort({ date: -1 }).limit(50).lean(),
      this.trainingModel.findOne({ user: space.host }).lean(),
    ]);
    return {
      ...row, availability: space.availability, notes: space.notes, adminNotes: user.role === UserRole.ADMIN ? space.adminNotes : undefined,
      visits: [...space.visits].reverse(),
      unavailable: off.map((o) => ({ _id: o._id, date: o.date, reason: o.reason })),
      trainingModules: HOST_MODULES.map((m) => ({ key: m.key, titleEn: m.titleEn, passedAt: training?.passed?.[m.key] ?? null })),
      certificate: training?.certificateNumber ? { number: training.certificateNumber, issuedOn: training.certifiedAt } : null,
    };
  }

  async createSpace(dto: CreateSpaceDto) {
    const host = await this.userModel.findOne({ _id: oid(dto.hostId), role: UserRole.HOST }).select('_id').lean();
    if (!host) throw new NotFoundException('Host account not found.');
    const space = await this.spaceModel.create({
      host: host._id, ...this.clean(dto), ...(dto.neighbourhoodId ? { neighbourhood: oid(dto.neighbourhoodId) } : {}),
    });
    await this.trainingModel.updateOne({ user: host._id }, { $setOnInsert: { user: host._id } }, { upsert: true });
    return { message: 'Space added.', space };
  }

  async updateSpace(id: string, dto: AdminSpaceDto) {
    const space = await this.spaceModel.findById(id);
    if (!space) throw new NotFoundException('Space not found.');
    const was = space.status as SpaceStatus;
    space.set(this.clean(dto));
    if (dto.neighbourhoodId !== undefined) space.neighbourhood = dto.neighbourhoodId ? oid(dto.neighbourhoodId) : null;
    if (dto.adminNotes !== undefined) space.adminNotes = dto.adminNotes;
    if (dto.status && dto.status !== was) {
      if (dto.status === 'in-use' && !(await this.circleModel.exists({ venue: space._id }))) {
        throw new BadRequestException('Place a circle in the space first; it becomes “In use” by itself.');
      }
      space.status = dto.status;
      if (dto.status === 'approved' && !space.approvedAt) {
        space.approvedAt = new Date();
        const host = await this.userModel.findById(space.host).select('fullName email').lean();
        if (host) void this.email.queue('host.space-approved', { email: host.email, name: host.fullName, userId: host._id }, { spaceName: space.name, url: this.email.link('/host') });
      }
    }
    await space.save();
    return { message: dto.status && dto.status !== was ? `Space marked ${dto.status.replace('-', ' ')}.` : 'Space saved.', space };
  }

  async addVisit(user: Requester, id: string, dto: VisitDto) {
    const space = await this.spaceInScope(user, id);
    const checklist = VISIT_CHECKLIST.map((c) => {
      const item = dto.checklist?.find((x) => x.key === c.key);
      return { key: c.key, ok: !!item?.ok, note: item?.note?.trim().slice(0, 300) ?? '' };
    });
    const by = await this.userModel.findById(user._id).select('fullName').lean();
    space.visits.push({ by: oid(user._id), byName: by?.fullName ?? '', at: new Date(), checklist, notes: dto.notes?.trim() ?? '', recommendation: dto.recommendation } as any);
    if (space.status === 'offered') space.status = 'visited';
    await space.save();
    const ok = checklist.filter((c) => c.ok).length;
    return { message: `Visit saved: ${ok} of ${checklist.length} checks met.${user.role === UserRole.ADMIN ? '' : ' The Noor Circles team will review it.'}`, ok, total: checklist.length };
  }

  /** Circles an admin can place in a space (with their current venue). */
  async circlesForVenue() {
    const circles = await this.circleModel.find().populate('murabbi', 'fullName').populate('neighbourhood', 'name').populate('venue', 'name').select('name murabbi neighbourhood venue meetingDay meetingTime isActive').sort({ name: 1 }).lean();
    return circles.map((c: any) => ({
      _id: c._id, name: c.name, murabbi: c.murabbi?.fullName ?? null, neighbourhood: c.neighbourhood?.name ?? null, schedule: schedule(c),
      venue: c.venue ? { _id: c.venue._id, name: c.venue.name } : null, isActive: c.isActive,
    }));
  }

  async setVenue(circleId: string, spaceId: string | null) {
    if (!Types.ObjectId.isValid(circleId)) throw new BadRequestException('Invalid circle.');
    const circle = await this.circleModel.findById(circleId).populate('murabbi', 'fullName phone');
    if (!circle) throw new NotFoundException('Circle not found.');
    const before = (circle as any).venue ? String((circle as any).venue) : null;
    let space: HostSpaceDocument | null = null;
    if (spaceId) {
      space = await this.spaceModel.findById(spaceId);
      if (!space) throw new NotFoundException('Space not found.');
      if (!['approved', 'in-use'].includes(space.status)) throw new BadRequestException('Only an approved space can be a circle’s venue. Visit and approve it first.');
    }
    (circle as any).venue = space?._id ?? null;
    await circle.save();
    if (space && space.status !== 'in-use') { space.status = 'in-use'; await space.save(); }
    if (before && before !== String(space?._id ?? '') && !(await this.circleModel.exists({ venue: oid(before) }))) {
      await this.spaceModel.updateOne({ _id: oid(before), status: 'in-use' }, { $set: { status: 'approved' } });
    }
    if (space && before !== String(space._id)) {
      const host = await this.userModel.findById(space.host).select('fullName email').lean();
      const m = (circle as any).murabbi;
      if (host) void this.email.queue('host.circle-placed', { email: host.email, name: host.fullName, userId: host._id }, {
        spaceName: space.name, circleName: circle.name, schedule: schedule(circle as any), murabbiName: m?.fullName ?? 'your murabbi', murabbiPhone: m?.phone ?? '', url: this.email.link('/host'),
      });
    }
    return { message: space ? `${circle.name} now meets at ${space.name}.` : `${circle.name} has no venue now.` };
  }

  async trainingOverview() {
    const hosts = await this.userModel.find({ role: UserRole.HOST }).select('fullName email').lean();
    const t = await this.trainingModel.find({ user: { $in: hosts.map((h) => h._id) } }).lean();
    return hosts.map((h) => {
      const r = t.find((x) => String(x.user) === String(h._id));
      return {
        user: h, done: HOST_MODULES.filter((m) => r?.passed?.[m.key]).length, total: HOST_MODULES.length,
        modules: HOST_MODULES.map((m) => ({ key: m.key, passed: !!r?.passed?.[m.key], attempts: r?.attempts?.[m.key] ?? 0 })),
        certificate: r?.certificateNumber ? { number: r.certificateNumber, issuedOn: r.certifiedAt } : null,
      };
    });
  }

  /** The venue as families and the murabbi see it (name and address). */
  static venueOut(v: any) {
    return v ? { name: v.name, address: v.address || null, area: v.area || null, city: v.city || null } : null;
  }
}
