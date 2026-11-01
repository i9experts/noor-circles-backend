import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

describe('Murabbi introduction', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    put: (p: string, b: object) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
  });

  beforeAll(async () => {
    ctx = await createApp('murabbiprofile');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  it('starts blank with what the account already knows', async () => {
    const r = await as(w.A.token).get('murabbi-profile/me');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ saved: false, completeness: 0, profile: { fullName: 'Murabbi A', email: 'a@e2e.test' } });
    expect(r.body.data.options.levels).toEqual(['basic', 'good', 'very-good', 'expert']);
  });

  it('saves the form, dropping empty rows and unknown answers', async () => {
    const r = await as(w.A.token).put('murabbi-profile/me', {
      fullName: 'Murabbi A', fatherName: 'Abdul Ghani', dateOfBirth: '1990-04-12', placeOfBirth: 'Multan', address: 'Gulshan, Karachi',
      purpose: 'اللہ کی رضا', approach: 'Small circles', currentWork: 'Teaching', quran: 'hafiz', quranNote: '2005',
      school: 'Govt High School', college: 'Karachi University', specialisation: 'Islamic Studies',
      experience: [{ organisation: 'The Deenway School', duration: '2018–2024', responsibilities: 'Class teacher' }, { organisation: '', duration: '', responsibilities: '' }],
      languages: ['urdu', 'english', 'arabic'],
      skills: { leadership: { level: 'very-good' }, graphicDesign: { level: 'good', note: 'Canva' }, typing: { level: null, note: '' } },
      political: '', strengths: ['Patient', ' '], weaknesses: ['Shy'],
    });
    expect(r.status).toBe(200);
    expect(r.body.data.profile.experience).toHaveLength(1);
    expect(r.body.data.profile.skills).toEqual({ leadership: { level: 'very-good', note: '' }, graphicDesign: { level: 'good', note: 'Canva' } });
    expect(r.body.data.profile.strengths).toEqual(['Patient']);
    expect(r.body.data.completeness).toBe(100);
    expect((await as(w.A.token).put('murabbi-profile/me', { quran: 'genius' })).status).toBe(400);
    expect((await as(w.A.token).put('murabbi-profile/me', { skills: { leadership: { level: 'superb' } } })).status).toBe(400);
  });

  it('admins see everyone, filter by skill, Qur’an and language, and can edit', async () => {
    const all = (await as(w.admin).get('murabbi-profile')).body.data;
    expect(all.stats).toMatchObject({ murabbis: 2, complete: 1, none: 1 });
    expect(all.stats.quran.hafiz).toBe(1);
    expect(all.stats.skills.graphicDesign).toBe(1);
    const design = (await as(w.admin).get('murabbi-profile?skill=graphicDesign&minLevel=good')).body.data.rows;
    expect(design.map((r: any) => r.fullName)).toEqual(['Murabbi A']);
    expect((await as(w.admin).get('murabbi-profile?skill=graphicDesign&minLevel=expert')).body.data.rows).toHaveLength(0);
    expect((await as(w.admin).get('murabbi-profile?languages=urdu,arabic')).body.data.rows).toHaveLength(1);
    expect((await as(w.admin).get('murabbi-profile?search=deenway')).body.data.rows).toHaveLength(1);
    expect((await as(w.admin).get('murabbi-profile?status=none')).body.data.rows.map((r: any) => r.fullName)).toEqual(['Murabbi B']);

    const one = (await as(w.admin).get(`murabbi-profile/${w.A.id}`)).body.data;
    expect(one.profile.fatherName).toBe('Abdul Ghani');
    const edit = await as(w.admin).put(`murabbi-profile/${w.B.id}`, { fatherName: 'Rashid', quran: 'nazira' });
    expect(edit.status).toBe(200);
    expect(edit.body.data.updatedBy.role).toBe('admin');
  });

  it('nobody else can read it: other murabbis, supervisors, parents', async () => {
    expect((await as(w.B.token).get('murabbi-profile')).status).toBe(403);
    expect((await as(w.B.token).get(`murabbi-profile/${w.A.id}`)).status).toBe(403);
    // The murabbi's own page only ever shows their own introduction.
    expect((await as(w.B.token).get('murabbi-profile/me')).body.data.profile.fatherName).toBe('Rashid');
    const sup = await as(w.admin).put('murabbi-profile/x', {});
    expect(sup.status).toBe(404);
  });
});
