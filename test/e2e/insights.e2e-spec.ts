import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

describe('Family profiles and Parent Insights', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('insights');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    put: (p: string, b: object = {}) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
  });
  const adm = () => as(w.admin);

  const interest = (body: object) =>
    ctx.http().post(`${API}/interest`).send({
      role: 'parent', lastName: 'Khan', city: 'Karachi', neighbourhood: 'Gulshan', roleDetail: '6–8 years', ...body,
    });
  const findInterest = async (email: string) => (await adm().get('interest')).body.data.find((i: any) => i.email === email);

  const single = {
    relationship: 'mother', livesWith: 'mother-only', household: 'joint', work: { self: 'full-time' },
    days: ['saturday', 'sunday'], times: ['weekend-morning'], transport: 'needs-lift',
    children: [{ ageBand: '9-10', gender: 'girl', school: 'government', quran: 'qaida' }, { ageBand: '6-8', gender: 'boy', school: '' }],
    language: 'urdu', needs: ['learning'], needsNote: '  Needs a little extra time reading. ', involvement: ['parent-evenings'],
    heardFrom: 'masjid', contactBy: 'whatsapp', contactTime: 'evening', consent: true,
  };

  describe('website interest form', () => {
    it('stores a parent’s answers, cleaned, with the source', async () => {
      const r = await interest({ firstName: 'Amna', email: 'amna@e2e.test', phone: '03001231231', profile: single });
      expect(r.status).toBe(201);
      const row = await findInterest('amna@e2e.test');
      expect(row.profile).toMatchObject({
        relationship: 'mother', livesWith: 'mother-only', work: { self: 'full-time' }, source: 'website', consent: true,
        needsNote: 'Needs a little extra time reading.',
        children: [{ ageBand: '9-10', gender: 'girl', school: 'government', quran: 'qaida' }, { ageBand: '6-8', gender: 'boy' }],
      });
    });

    it('works without any answers (everything is optional)', async () => {
      expect((await interest({ firstName: 'Bushra', email: 'bushra@e2e.test', phone: '03001231232' })).status).toBe(201);
      expect((await findInterest('bushra@e2e.test')).profile).toBeNull();
    });

    it('needs the consent tick, and only listed options', async () => {
      const noConsent = await interest({ firstName: 'C', email: 'c@e2e.test', phone: '03001231233', profile: { livesWith: 'both-parents' } });
      expect(noConsent.status).toBe(400);
      const bad = await interest({ firstName: 'C', email: 'c@e2e.test', phone: '03001231233', profile: { livesWith: 'divorced', consent: true } });
      expect(bad.status).toBe(400);
      const badChild = await interest({
        firstName: 'C', email: 'c@e2e.test', phone: '03001231233', profile: { children: [{ ageBand: '15-18' }], consent: true },
      });
      expect(badChild.status).toBe(400);
    });

    it('ignores answers sent with a murabbi request', async () => {
      const r = await interest({
        role: 'mentor', roleDetail: 'Educator / teacher', firstName: 'Dawood', email: 'dawood@e2e.test', phone: '03001231234',
        profile: { livesWith: 'both-parents', consent: true },
      });
      expect(r.status).toBe(201);
      expect((await findInterest('dawood@e2e.test')).profile).toBeNull();
    });
  });

  describe('family page', () => {
    let parentId: string;
    let link: string;

    beforeAll(async () => {
      const p = await adm().post('parents', { fullName: 'Hira Ahmed', phone: '03001112233', studentIds: [w.studentA] });
      parentId = p.body.data.parent?._id ?? p.body.data._id;
      link = (await adm().get(`parents/${parentId}/family-link`)).body.data.url.split('/family/')[1];
    });

    it('a parent saves their answers from the private link and sees them again', async () => {
      const r = await ctx.http().put(`${API}/family/${link}/profile`).send({
        relationship: 'father', livesWith: 'mother-away', work: { self: 'shift', other: 'away' }, days: ['weekdays'], times: ['evening'],
        transport: 'walks', children: [{ ageBand: '11-13', gender: 'boy', quran: 'nazra' }], consent: true,
      });
      expect(r.status).toBe(200);
      const page = await ctx.http().get(`${API}/family/${link}`);
      expect(page.body.data.family.profile).toMatchObject({ relationship: 'father', livesWith: 'mother-away', source: 'family-page' });
    });

    it('a bad link can’t save', async () => {
      const bad = `${link.slice(0, -4)}xxxx`;
      expect((await ctx.http().put(`${API}/family/${bad}/profile`).send({ livesWith: 'both-parents', consent: true })).status).toBeGreaterThanOrEqual(400);
    });

    it('a signed-in parent saves from their account; murabbis can’t', async () => {
      await interest({ firstName: 'Sana', email: 'sana@e2e.test', phone: '03004445566' });
      const req = await findInterest('sana@e2e.test');
      const acc = await adm().post(`interest/${req._id}/account`);
      expect(acc.status).toBe(201);
      const s = await ctx.http().post(`${API}/auth/signin`).send({ email: acc.body.data.credentials.email, password: acc.body.data.credentials.password });
      const parentToken = s.body.data.accessToken;

      const r = await as(parentToken).put('family/me/profile', { livesWith: 'both-parents', relationship: 'mother', work: { self: 'homemaker', other: 'full-time' }, consent: true });
      expect(r.status).toBe(200);
      expect((await as(parentToken).get('family/me')).body.data.family.profile).toMatchObject({ livesWith: 'both-parents' });
      expect((await as(w.A.token).put('family/me/profile', { livesWith: 'both-parents', consent: true })).status).toBe(403);
    });

    it('converting a request carries its answers over to the new parent', async () => {
      const req = await findInterest('amna@e2e.test');
      const acc = await adm().post(`interest/${req._id}/account`);
      expect(acc.status).toBe(201);
      const parents = (await adm().get('parents')).body.data;
      const amna = parents.find((p: any) => p.email === 'amna@e2e.test');
      const insights = (await adm().get('insights/parents?search=amna')).body.data;
      expect(insights.rows).toHaveLength(1);
      expect(insights.rows[0]).toMatchObject({ id: `p:${amna._id}`, source: 'parent', status: 'registered' });
      expect(insights.rows[0].profile).toMatchObject({ livesWith: 'mother-only', source: 'website' });
    });
  });

  describe('Parent Insights dashboard', () => {
    it('is for admins only: never murabbis or parents', async () => {
      expect((await as(w.A.token).get('insights/parents')).status).toBe(403);
      expect((await ctx.http().get(`${API}/insights/parents`)).status).toBe(401);
      expect((await as(w.A.token).put('insights/families/p:000000000000000000000000/profile', { consent: true })).status).toBe(403);
    });

    it('counts families, answers and situations', async () => {
      const r = await adm().get('insights/parents');
      expect(r.status).toBe(200);
      const d = r.body.data;
      // Amna (converted), Hira, Sana (converted) as parents; Bushra as a request. Dawood is a murabbi.
      expect(d.totals).toMatchObject({ families: 4, requests: 1, enrolled: 1, answered: 3, singleParent: 1, parentAway: 1, needsLift: 1, supportNeeds: 1 });
      // Amna works full-time (mother), Sana's answers say she's a homemaker; Hira (father) said the mother is away.
      expect(d.totals.workingMothers).toBe(2);
      expect(d.breakdowns.livesWith).toMatchObject({ 'mother-only': 1, 'mother-away': 1, 'both-parents': 1, unanswered: 0 });
      expect(d.breakdowns.mothersWork).toMatchObject({ 'full-time': 1, away: 1, homemaker: 1 });
      expect(d.breakdowns.fathersWork).toMatchObject({ shift: 1, 'full-time': 1, unanswered: 1 });
      expect(d.breakdowns.gender).toMatchObject({ girl: 1, boy: 2 });
      expect(d.availability.find((a: any) => a.day === 'saturday' && a.time === 'weekend-morning').families).toBe(1);
      expect(d.places.cities).toContain('Karachi');
      expect(d.rows.every((x: any) => /^[pi]:[a-f\d]{24}$/.test(x.id))).toBe(true);
    });

    it('filters combine: any-of within a question, all across questions', async () => {
      const q = async (s: string) => (await adm().get(`insights/parents?${s}`)).body.data;
      expect((await q('livesWith=mother-only,father-only')).totals.families).toBe(1);
      expect((await q('livesWith=mother-only,mother-away')).totals.families).toBe(2);
      expect((await q('livesWith=mother-only,mother-away&transport=walks')).totals.families).toBe(1);
      expect((await q('work=full-time')).totals.families).toBe(2);
      expect((await q('answered=no')).rows.map((x: any) => x.name)).toEqual(['Bushra Khan']);
      expect((await q('status=new')).totals.families).toBe(1);
      expect((await q('ageBand=11-13')).totals.families).toBe(1);
      expect((await q('from=2099-01-01')).totals.families).toBe(0);
    });

    it('an admin records answers given over the phone', async () => {
      const bushra = (await adm().get('insights/parents?answered=no')).body.data.rows[0];
      const r = await adm().put(`insights/families/${bushra.id}/profile`, { livesWith: 'grandparents-relatives', consent: true });
      expect(r.status).toBe(200);
      expect(r.body.data.profile.source).toBe('admin');
      expect((await adm().get('insights/parents?livesWith=grandparents-relatives')).body.data.totals.families).toBe(1);
      expect((await adm().put('insights/families/x:123/profile', { consent: true })).status).toBe(400);
      expect((await adm().put('insights/families/i:000000000000000000000000/profile', { consent: true })).status).toBe(404);
    });

    it('emails the families an admin picked', async () => {
      const ids = (await adm().get('insights/parents?livesWith=mother-only,grandparents-relatives')).body.data.rows.map((x: any) => x.id);
      expect(ids).toHaveLength(2);
      const prev = await adm().post('email/audience', { type: 'families', families: ids });
      expect(prev.status).toBe(200);
      expect(prev.body.data).toMatchObject({ count: 2, label: '2 chosen families (Parent Insights)' });
      expect((await adm().post('email/audience', { type: 'families', families: ['nope'] })).status).toBe(400);
      expect((await adm().post('email/audience', { type: 'families' })).status).toBe(400);
    });
  });
});
