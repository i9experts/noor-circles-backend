import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { MurabbiProfile, MurabbiProfileDocument } from './murabbi-profile.schema';
import {
  HARD_SKILLS, Introduction, LANGUAGES, LEVELS, MurabbiProfileDto, QURAN, SOFT_SKILLS, SkillKey, cleanIntroduction, completeness,
} from './murabbi-profile.options';

export interface ProfileFilters {
  status?: string[];      // none | started | complete
  quran?: string[];
  languages?: string[];
  skill?: string;         // a skill key…
  minLevel?: string;      // …at this level or above
  search?: string;
}

const levelRank = (l?: string | null) => (l ? LEVELS.indexOf(l as any) : -1);
const norm = (s?: string | null) => (s ?? '').toLowerCase();

@Injectable()
export class MurabbiProfileService {
  constructor(
    @InjectModel(MurabbiProfile.name) private readonly profileModel: Model<MurabbiProfileDocument>,
    @InjectModel(User.name)           private readonly userModel:    Model<UserDocument>,
  ) {}

  options() {
    return { levels: LEVELS, quran: QURAN, languages: LANGUAGES, softSkills: SOFT_SKILLS, hardSkills: HARD_SKILLS };
  }

  private async murabbi(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('Murabbi not found.');
    const u = await this.userModel.findOne({ _id: userId, role: UserRole.MURABBI }).select('fullName email phone address tier isActive').lean();
    if (!u) throw new NotFoundException('Murabbi not found.');
    return u;
  }

  /** The introduction, or a blank one with what the account already knows filled in. */
  async get(userId: string) {
    const u = await this.murabbi(userId);
    const p = await this.profileModel.findOne({ user: u._id }).populate('updatedBy', 'fullName role').lean();
    const blank = cleanIntroduction({ fullName: u.fullName, email: u.email, whatsapp: u.phone ?? '', address: (u as any).address ?? '' });
    return {
      murabbi: { _id: u._id, fullName: u.fullName, email: u.email, tier: u.tier ?? 1 },
      profile: p?.data ?? blank,
      saved: !!p, completeness: p?.completeness ?? 0, updatedAt: (p as any)?.updatedAt ?? null, updatedBy: p?.updatedBy ?? null,
      options: this.options(),
    };
  }

  async save(userId: string, dto: MurabbiProfileDto, byId: string) {
    const u = await this.murabbi(userId);
    const data = cleanIntroduction(dto);
    await this.profileModel.updateOne(
      { user: u._id },
      { $set: { data, completeness: completeness(data), updatedBy: new Types.ObjectId(byId) } },
      { upsert: true },
    );
    return { message: 'Your introduction is saved. Jazak Allahu khayran.', ...(await this.get(userId)) };
  }

  /** Admin: every murabbi with how far their introduction has got, filtered, plus counts for the page. */
  async list(f: ProfileFilters) {
    const [users, profiles] = await Promise.all([
      this.userModel.find({ role: UserRole.MURABBI, isEmailVerified: true }).select('fullName email phone tier isActive image').sort({ fullName: 1 }).lean(),
      this.profileModel.find().lean(),
    ]);
    const byUser = new Map(profiles.map((p) => [String(p.user), p]));
    const rows = users.map((u) => {
      const p = byUser.get(String(u._id));
      const d = p?.data as Introduction | undefined;
      const pct = p?.completeness ?? 0;
      return {
        _id: u._id, fullName: u.fullName, email: u.email, phone: u.phone, tier: u.tier ?? 1, isActive: u.isActive, image: (u as any).image ?? null,
        status: !p ? 'none' : pct >= 100 ? 'complete' : 'started', completeness: pct, updatedAt: (p as any)?.updatedAt ?? null,
        quran: d?.quran ?? null, languages: d?.languages ?? [], specialisation: d?.specialisation ?? '',
        skills: Object.fromEntries(Object.entries(d?.skills ?? {}).map(([k, v]) => [k, v.level])) as Partial<Record<SkillKey, string | null>>,
        experienceCount: d?.experience?.length ?? 0,
        _search: [u.fullName, u.email, d?.school, d?.college, d?.courses, d?.specialisation, ...(d?.experience ?? []).map((e) => e.organisation)].map(norm).join(' '),
      };
    });
    const filtered = rows.filter((r) =>
      (!f.status?.length || f.status.includes(r.status))
      && (!f.quran?.length || (r.quran && f.quran.includes(r.quran)))
      && (!f.languages?.length || f.languages.every((l) => r.languages.includes(l)))
      && (!f.skill || levelRank(r.skills[f.skill as SkillKey]) >= Math.max(0, levelRank(f.minLevel ?? 'good')))
      && (!f.search || r._search.includes(norm(f.search))));

    const withProfile = rows.filter((r) => r.status !== 'none');
    const count = (pick: (r: (typeof rows)[number]) => boolean) => withProfile.filter(pick).length;
    return {
      stats: {
        murabbis: rows.length, started: count((r) => r.status === 'started'), complete: count((r) => r.status === 'complete'),
        none: rows.length - withProfile.length,
        quran: Object.fromEntries(QURAN.map((q) => [q, count((r) => r.quran === q)])),
        languages: Object.fromEntries(LANGUAGES.map((l) => [l, count((r) => r.languages.includes(l))])),
        // How many are good or better at each skill.
        skills: Object.fromEntries([...SOFT_SKILLS, ...HARD_SKILLS].map((k) => [k, count((r) => levelRank(r.skills[k]) >= 1)])),
      },
      rows: filtered.map(({ _search, ...r }) => r),
      options: this.options(),
    };
  }
}
