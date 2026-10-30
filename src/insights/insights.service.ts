import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { Interest, InterestDocument } from '../interest/interest.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Neighbourhood, NeighbourhoodDocument } from '../neighbourhood/neighbourhood.schema';
import { FamilyProfile, FamilyProfileDto, PROFILE_OPTIONS, cleanProfile } from './family-profile';

type Status = 'new' | 'contacted' | 'closed' | 'registered' | 'enrolled';

export interface FamilyRow {
  /** "p:<parentId>" for parents on file, "i:<interestId>" for requests not yet on file. */
  id: string;
  source: 'parent' | 'request';
  name: string;
  email: string | null;
  phone: string;
  city: string;
  neighbourhood: string;
  status: Status;
  createdAt: Date;
  children: number;
  enrolledChildren: number;
  ageBands: string[];
  profile: Partial<FamilyProfile> | null;
}

/** Filters: each is a list (any of), combined with AND across fields. */
export type InsightFilters = Partial<Record<
  'status' | 'source' | 'city' | 'neighbourhood' | 'relationship' | 'livesWith' | 'household' | 'work' | 'days' | 'times'
  | 'transport' | 'ageBand' | 'gender' | 'school' | 'quran' | 'language' | 'needs' | 'involvement' | 'heardFrom' | 'answered',
  string[]
>> & { from?: string; to?: string; search?: string };

const WORKING = new Set(['full-time', 'part-time', 'from-home', 'business', 'shift', 'away']);
const AGE_FROM_TEXT: Record<string, string> = { '6–8 years': '6-8', '9–10 years': '9-10', '11–13 years': '11-13' };
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/** The mother's / father's work, when we know who answered. */
function workOf(p: Partial<FamilyProfile> | null, who: 'mother' | 'father') {
  if (!p?.work) return null;
  if (p.relationship === who) return p.work.self ?? null;
  if (p.relationship === (who === 'mother' ? 'father' : 'mother')) return p.work.other ?? null;
  return null;
}

@Injectable()
export class InsightsService {
  constructor(
    @InjectModel(Parent.name)        private readonly parentModel:   Model<ParentDocument>,
    @InjectModel(Interest.name)      private readonly interestModel: Model<InterestDocument>,
    @InjectModel(Student.name)       private readonly studentModel:  Model<StudentDocument>,
    @InjectModel(Circle.name)        private readonly circleModel:   Model<CircleDocument>,
    @InjectModel(Neighbourhood.name) private readonly areaModel:     Model<NeighbourhoodDocument>,
  ) {}

  /** Parents on file plus parent interest requests that haven't become a parent record yet. */
  async families(): Promise<FamilyRow[]> {
    const [parents, requests, students, areas] = await Promise.all([
      this.parentModel.find().select('fullName email phone students profile account createdAt').lean(),
      this.interestModel.find({ role: 'parent' }).lean(),
      this.studentModel.find().select('isActive neighbourhood').lean(),
      this.areaModel.find().select('name city').lean(),
    ]);
    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const areaById = new Map(areas.map((a) => [String(a._id), a]));
    const accounts = new Set(parents.map((p) => p.account && String(p.account)).filter(Boolean));
    const requestByAccount = new Map(requests.filter((r) => r.account).map((r) => [String(r.account), r]));

    const rows: FamilyRow[] = parents.map((p) => {
      const kids = (p.students ?? []).map((id) => studentById.get(String(id))).filter((s) => !!s);
      const active = kids.filter((s) => s.isActive);
      const area = kids.map((s) => areaById.get(String(s.neighbourhood))).find(Boolean);
      const req = p.account ? requestByAccount.get(String(p.account)) : undefined;
      const profile = (p.profile ?? req?.profile ?? null) as Partial<FamilyProfile> | null;
      return {
        id: `p:${String(p._id)}`, source: 'parent' as const, name: p.fullName, email: p.email, phone: p.phone,
        city: area?.city ?? req?.city ?? '', neighbourhood: area?.name ?? req?.neighbourhood ?? '',
        status: active.length ? 'enrolled' : 'registered', createdAt: (req as any)?.createdAt ?? (p as any).createdAt,
        children: Math.max(kids.length, profile?.children?.length ?? 0, 1), enrolledChildren: active.length,
        ageBands: (profile?.children ?? []).map((c) => c.ageBand).filter((x): x is string => !!x)
          .concat(!profile?.children?.length && req?.roleDetail && AGE_FROM_TEXT[req.roleDetail] ? [AGE_FROM_TEXT[req.roleDetail]] : []),
        profile,
      };
    });
    for (const r of requests) {
      if (r.account && accounts.has(String(r.account))) continue; // counted as the parent above
      const profile = (r.profile ?? null) as Partial<FamilyProfile> | null;
      rows.push({
        id: `i:${String(r._id)}`, source: 'request', name: `${r.firstName} ${r.lastName}`.trim(), email: r.email, phone: r.phone,
        city: r.city, neighbourhood: r.neighbourhood, status: r.status as Status, createdAt: (r as any).createdAt,
        children: Math.max(profile?.children?.length ?? 0, 1), enrolledChildren: 0,
        ageBands: (profile?.children ?? []).map((c) => c.ageBand).filter((x): x is string => !!x)
          .concat(!profile?.children?.length && AGE_FROM_TEXT[r.roleDetail] ? [AGE_FROM_TEXT[r.roleDetail]] : []),
        profile,
      });
    }
    return rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  private matches(f: FamilyRow, q: InsightFilters) {
    const p = f.profile ?? {};
    const kids = p.children ?? [];
    const any = (vals: string[] | undefined, have: (string | null | undefined)[]) => !vals?.length || have.some((h) => !!h && vals.includes(h));
    if (q.from && new Date(f.createdAt) < new Date(q.from)) return false;
    if (q.to && new Date(f.createdAt) > new Date(`${q.to}T23:59:59`)) return false;
    if (q.search) {
      const s = norm(q.search);
      if (![f.name, f.email, f.phone, f.neighbourhood, f.city].some((v) => norm(v).includes(s))) return false;
    }
    if (q.answered?.length && !q.answered.includes(f.profile ? 'yes' : 'no')) return false;
    return any(q.status, [f.status])
      && any(q.source, [f.source])
      && (!q.city?.length || q.city.map(norm).includes(norm(f.city)))
      && (!q.neighbourhood?.length || q.neighbourhood.map(norm).includes(norm(f.neighbourhood)))
      && any(q.relationship, [p.relationship])
      && any(q.livesWith, [p.livesWith])
      && any(q.household, [p.household])
      && any(q.work, [p.work?.self, p.work?.other])
      && any(q.days, p.days ?? [])
      && any(q.times, p.times ?? [])
      && any(q.transport, [p.transport])
      && any(q.ageBand, f.ageBands)
      && any(q.gender, kids.map((k) => k.gender))
      && any(q.school, kids.map((k) => k.school))
      && any(q.quran, kids.map((k) => k.quran))
      && any(q.language, [p.language])
      && any(q.needs, p.needs ?? [])
      && any(q.involvement, p.involvement ?? [])
      && any(q.heardFrom, [p.heardFrom]);
  }

  async parents(q: InsightFilters) {
    const all = await this.families();
    const rows = all.filter((f) => this.matches(f, q));
    const answered = rows.filter((f) => f.profile);
    const kids = answered.flatMap((f) => f.profile?.children ?? []);

    // Counts per option ("unanswered" = has answers but skipped this one).
    const count = (values: (string | null | undefined)[], options: readonly string[]) => {
      const c: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]));
      let none = 0;
      for (const v of values) { if (v && v in c) c[v]++; else none++; }
      return { ...c, unanswered: none };
    };
    const countMulti = (lists: (string[] | undefined)[], options: readonly string[]) => {
      const c: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]));
      let none = 0;
      for (const l of lists) { if (!l?.length) none++; for (const v of l ?? []) if (v in c) c[v]++; }
      return { ...c, unanswered: none };
    };
    const P = PROFILE_OPTIONS;
    const mothersWork = answered.map((f) => workOf(f.profile, 'mother'));

    const availability = P.days.flatMap((d) => P.times.map((t) => ({
      day: d, time: t, families: answered.filter((f) => f.profile?.days?.includes(d as any) && f.profile?.times?.includes(t as any)).length,
    })));

    // Demand by neighbourhood against what circles there can still take.
    const [circles, activeStudents, areas] = await Promise.all([
      this.circleModel.find({ isActive: true }).select('neighbourhood capacity').lean(),
      this.studentModel.aggregate([{ $match: { isActive: true, circle: { $ne: null } } }, { $group: { _id: '$circle', n: { $sum: 1 } } }]),
      this.areaModel.find().select('name city').lean(),
    ]);
    const seatsUsed = new Map(activeStudents.map((s) => [String(s._id), s.n as number]));
    const areaByName = new Map(areas.map((a) => [norm(a.name), a]));
    const byArea = new Map<string, { name: string; city: string; waiting: number; waitingChildren: number; enrolled: number; circles: number; seatsFree: number }>();
    for (const f of rows) {
      const key = norm(f.neighbourhood) || '(not given)';
      const e = byArea.get(key) ?? { name: f.neighbourhood || '(not given)', city: f.city, waiting: 0, waitingChildren: 0, enrolled: 0, circles: 0, seatsFree: 0 };
      if (f.status === 'enrolled') e.enrolled++;
      else if (f.status !== 'closed') { e.waiting++; e.waitingChildren += f.children; }
      byArea.set(key, e);
    }
    for (const [key, e] of byArea) {
      const area = areaByName.get(key);
      if (!area) continue;
      const cs = circles.filter((c) => String(c.neighbourhood) === String(area._id));
      e.circles = cs.length;
      e.seatsFree = cs.reduce((s, c) => s + Math.max(0, (c.capacity ?? 0) - (seatsUsed.get(String(c._id)) ?? 0)), 0);
    }

    const months: Record<string, number> = {};
    for (const f of rows) {
      const m = new Date(new Date(f.createdAt).getTime() + 5 * 3600_000).toISOString().slice(0, 7);
      months[m] = (months[m] ?? 0) + 1;
    }

    return {
      totals: {
        families: rows.length,
        requests: rows.filter((f) => f.source === 'request').length,
        enrolled: rows.filter((f) => f.status === 'enrolled').length,
        waiting: rows.filter((f) => !['enrolled', 'closed'].includes(f.status)).length,
        answered: answered.length,
        children: rows.reduce((s, f) => s + f.children, 0),
        singleParent: answered.filter((f) => ['mother-only', 'father-only'].includes(f.profile?.livesWith ?? '')).length,
        parentAway: answered.filter((f) => ['father-away', 'mother-away'].includes(f.profile?.livesWith ?? '')).length,
        workingMothers: mothersWork.filter((w) => w && WORKING.has(w)).length,
        needsLift: answered.filter((f) => f.profile?.transport === 'needs-lift').length,
        supportNeeds: answered.filter((f) => f.profile?.needs?.length).length,
      },
      breakdowns: {
        status: count(rows.map((f) => f.status), ['new', 'contacted', 'registered', 'enrolled', 'closed']),
        relationship: count(answered.map((f) => f.profile?.relationship), P.relationship),
        livesWith: count(answered.map((f) => f.profile?.livesWith), P.livesWith),
        household: count(answered.map((f) => f.profile?.household), P.household),
        mothersWork: count(mothersWork, P.work),
        fathersWork: count(answered.map((f) => workOf(f.profile, 'father')), P.work),
        transport: count(answered.map((f) => f.profile?.transport), P.transport),
        ageBand: count(rows.flatMap((f) => (f.ageBands.length ? f.ageBands : [null])), P.ageBand),
        gender: count(kids.map((k) => k.gender), P.gender),
        school: count(kids.map((k) => k.school), P.school),
        quran: count(kids.map((k) => k.quran), P.quran),
        language: count(answered.map((f) => f.profile?.language), P.language),
        needs: countMulti(answered.map((f) => f.profile?.needs), P.needs),
        involvement: countMulti(answered.map((f) => f.profile?.involvement), P.involvement),
        heardFrom: count(answered.map((f) => f.profile?.heardFrom), P.heardFrom),
        contactBy: count(answered.map((f) => f.profile?.contactBy), P.contactBy),
      },
      availability,
      neighbourhoods: [...byArea.values()].sort((a, b) => b.waiting - a.waiting || b.enrolled - a.enrolled).slice(0, 25),
      overTime: Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, n]) => ({ month, families: n })),
      // For the filter menus: every city / neighbourhood seen (not just the filtered ones).
      places: {
        cities: [...new Set(all.map((f) => f.city).filter(Boolean))].sort(),
        neighbourhoods: [...new Set(all.map((f) => f.neighbourhood).filter(Boolean))].sort(),
      },
      rows: rows.slice(0, 2000),
    };
  }

  /** Admin records or corrects a family's answers (e.g. over the phone). */
  async saveProfile(familyId: string, dto: FamilyProfileDto) {
    const [kind, id] = familyId.split(':');
    if (!Types.ObjectId.isValid(id) || !['p', 'i'].includes(kind)) throw new BadRequestException('Invalid family.');
    const profile = cleanProfile(dto, 'admin');
    const model: Model<any> = kind === 'p' ? this.parentModel : this.interestModel;
    const r = await model.updateOne({ _id: new Types.ObjectId(id) }, { $set: { profile } });
    if (!r.matchedCount) throw new NotFoundException('Family not found.');
    return { message: 'Family details saved.', profile };
  }
}
