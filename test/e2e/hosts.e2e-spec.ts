import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';
import { HOST_MODULES } from '../../src/host/host.content';

describe('Hosts and their spaces', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let host: string, other: string, sup: string, spaceId: string;
  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    put: (p: string, b: object) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const signin = async (email: string, password: string) =>
    (await ctx.http().post(`${API}/auth/signin`).send({ email, password })).body.data.accessToken as string;
  const hostFromInterest = async (first: string, email: string, space = 'Living room') => {
    await ctx.http().post(`${API}/interest`).send({
      role: 'host', firstName: first, lastName: 'Hussaini', email, phone: '03082235245', city: 'Karachi', neighbourhood: 'Gulshan', roleDetail: space,
    });
    const id = (await as(w.admin).get('interest')).body.data.find((i: any) => i.email === email)._id;
    const r = await as(w.admin).post(`interest/${id}/account`);
    return { r, token: await signin(email, r.body.data.credentials.password) };
  };
  const tomorrow = () => new Date(Date.now() + 5 * 3600_000 + 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    ctx = await createApp('hosts');
    w = await seedWorld(ctx);
    const cl = await as(w.admin).post('clusters', { name: 'Gulshan Cluster', city: 'Karachi', neighbourhoodIds: [w.nbhId] });
    const s = await as(w.admin).post('clusters/supervisors', { fullName: 'Sana Supervisor', email: 'sana@e2e.test', clusterIds: [cl.body.data.cluster._id] });
    sup = await signin('sana@e2e.test', s.body.data.credentials.password);
  });
  afterAll(async () => ctx.close());

  it('creates a host account and their space from the website interest', async () => {
    const { r, token } = await hostFromInterest('Saad', 'saad@e2e.test');
    expect(r.status).toBe(201);
    expect(r.body.message).toMatch(/^Host account created/);
    host = token;
    const me = await as(host).get('host/me');
    expect(me.status).toBe(200);
    expect(me.body.data.spaces).toHaveLength(1);
    const s = me.body.data.spaces[0];
    expect(s).toMatchObject({ type: 'living-room', status: 'offered', city: 'Karachi', area: 'Gulshan', neighbourhood: { name: 'Gulshan' }, circles: [] });
    expect(s.visits).toBeUndefined();
    spaceId = s._id;
    expect(me.body.data.training).toMatchObject({ done: 0, total: 6, certificate: null });
    other = (await hostFromInterest('Bilal', 'bilal.host@e2e.test', 'Lawn / garden')).token;
    const mail = await ctx.waitForEmail((e) => e.to === 'saad@e2e.test' && /account is ready/.test(e.subject));
    expect(mail.text).toMatch(/host account is ready/);
  });

  it('lets the host describe their own space, and no one else’s', async () => {
    const r = await as(host).put(`host/spaces/${spaceId}`, {
      name: 'Hussaini family lawn', type: 'lawn', address: 'House 12, Block 7, Gulshan-e-Iqbal', capacity: 18,
      facilities: ['wudu', 'toilet', 'jacuzzi'], availability: [{ day: 5, from: '16:00', to: '19:00' }],
    });
    expect([r.status, r.body.message]).toEqual([200, expect.anything()]);
    expect(r.body.data.space).toMatchObject({ name: 'Hussaini family lawn', capacity: 18, facilities: ['wudu', 'toilet'] });
    expect((await as(other).put(`host/spaces/${spaceId}`, { name: 'Mine now' })).status).toBe(404);
    expect((await as(host).put(`host/spaces/${spaceId}`, { availability: [{ day: 9, from: '25:00', to: 'x' }] })).status).toBe(400);
  });

  it('keeps hosts, murabbis and others out of the admin routes', async () => {
    for (const t of [host, w.A.token]) {
      expect((await as(t).get('host/admin/spaces')).status).toBe(403);
      expect((await as(t).patch(`host/admin/spaces/${spaceId}`, { status: 'approved' })).status).toBe(403);
    }
    expect((await as(w.A.token).get('host/me')).status).toBe(403);
    expect((await as(sup).patch(`host/admin/spaces/${spaceId}`, { status: 'approved' })).status).toBe(403);
  });

  it('the cluster supervisor sees the space and records the visit', async () => {
    const list = await as(sup).get('host/admin/spaces');
    expect(list.status).toBe(200);
    expect(list.body.data.map((s: any) => s.name)).toContain('Hussaini family lawn');
    const row = list.body.data.find((s: any) => s._id === spaceId);
    expect(row).toMatchObject({ cluster: 'Gulshan Cluster', host: { fullName: 'Saad Hussaini' }, status: 'offered' });
    const v = await as(sup).post(`host/admin/spaces/${spaceId}/visits`, {
      checklist: [{ key: 'entrance', ok: true }, { key: 'adults', ok: true, note: 'Mother at home' }, { key: 'firstaid', ok: false, note: 'Needs a box' }],
      notes: 'Lovely shaded lawn.', recommendation: 'approve',
    });
    expect(v.status).toBe(201);
    expect(v.body.data).toMatchObject({ ok: 2, total: 10 });
    const d = (await as(sup).get(`host/admin/spaces/${spaceId}`)).body.data;
    expect(d.status).toBe('visited');
    expect(d.visits[0]).toMatchObject({ byName: 'Sana Supervisor', recommendation: 'approve', notes: 'Lovely shaded lawn.' });
    expect(d.adminNotes).toBeUndefined();
  });

  it('only an approved space can be a circle’s venue; the host is told', async () => {
    expect((await as(w.admin).put(`host/admin/circles/${w.circleA}/venue`, { spaceId })).status).toBe(400);
    expect((await as(w.admin).patch(`host/admin/spaces/${spaceId}`, { status: 'in-use' })).status).toBe(400);
    const ok = await as(w.admin).patch(`host/admin/spaces/${spaceId}`, { status: 'approved', adminNotes: 'Bring a first-aid box.' });
    expect(ok.status).toBe(200);
    expect((await ctx.waitForEmail((e) => e.to === 'saad@e2e.test' && /approved/.test(e.subject))).text).toMatch(/approved it for a circle/);
    const v = await as(w.admin).put(`host/admin/circles/${w.circleA}/venue`, { spaceId });
    expect(v.status).toBe(200);
    expect((await ctx.waitForEmail((e) => e.to === 'saad@e2e.test' && /will meet/.test(e.subject))).text).toMatch(/Circle A/);
    expect((await as(w.admin).get(`host/admin/spaces/${spaceId}`)).body.data).toMatchObject({ status: 'in-use', circles: [{ name: 'Circle A' }] });
    const me = (await as(host).get('host/me')).body.data.spaces[0];
    expect(me.circles[0]).toMatchObject({ name: 'Circle A', murabbi: { fullName: 'Murabbi A' } });
    const mine = (await as(w.A.token).get('murabbi/my-circles')).body.data.find((c: any) => c.name === 'Circle A');
    expect(mine.venue).toMatchObject({ name: 'Hussaini family lawn', address: 'House 12, Block 7, Gulshan-e-Iqbal', host: { fullName: 'Saad Hussaini' } });
  });

  it('a date the space can’t be used tells the murabbi and the team', async () => {
    const d = tomorrow();
    const r = await as(host).post(`host/spaces/${spaceId}/unavailable`, { date: d, reason: 'Family wedding' });
    expect(r.status).toBe(201);
    expect(r.body.data.notified).toBe(1);
    const murabbiEmail = (await ctx.db.collection('users').findOne({ fullName: 'Murabbi A' }))!.email;
    const mail = await ctx.waitForEmail((e) => e.to === murabbiEmail && /Space unavailable/.test(e.subject));
    expect(mail.text).toMatch(/Family wedding/);
    expect((await as(host).post(`host/spaces/${spaceId}/unavailable`, { date: d })).status).toBe(400);
    expect((await as(host).post(`host/spaces/${spaceId}/unavailable`, { date: '2020-01-01' })).status).toBe(400);
    const me = (await as(host).get('host/me')).body.data.spaces[0];
    expect(me.unavailable).toEqual([expect.objectContaining({ date: d, reason: 'Family wedding' })]);
    expect((await as(other).del(`host/unavailable/${me.unavailable[0]._id}`)).status).toBe(404);
    expect((await as(host).del(`host/unavailable/${me.unavailable[0]._id}`)).status).toBe(200);
  });

  it('Asaas for Hosts: six modules, a check after each, then a certificate', async () => {
    const t = (await as(host).get('host/training')).body.data;
    expect(t.modules.map((m: any) => m.key)).toEqual(['why', 'space', 'safety', 'day', 'people', 'adab']);
    expect(t.modules[0].check.questions[0].correct).toBeUndefined(); // answers aren't sent
    const fail = await as(host).post('host/training/why/check', { answers: [0, 0, 0, 0] });
    expect(fail.body.data.passed).toBe(false);
    expect((await as(host).post('host/training/why/check', { answers: [1] })).status).toBe(400);
    let last: any;
    for (const m of HOST_MODULES) {
      last = await as(host).post(`host/training/${m.key}/check`, { answers: m.check.map((q) => q.correct) });
      expect(last.body.data.passed).toBe(true);
    }
    expect(last.body.data.certificate).toMatch(/^NCH-\d{4}-[A-F0-9]{6}$/);
    const after = (await as(host).get('host/training')).body.data;
    expect(after).toMatchObject({ done: 6, total: 6, certificate: { number: last.body.data.certificate } });
    const overview = (await as(w.admin).get('host/admin/training')).body.data;
    const mods = (await as(w.admin).get('host/admin/training/modules')).body.data;
    expect(mods.map((m: any) => [m.key, m.audio])).toEqual(HOST_MODULES.map((m) => [m.key, null]));
    expect((await as(host).get('host/admin/training/modules')).status).toBe(403);
    expect(overview.find((h: any) => h.user.fullName === 'Saad Hussaini')).toMatchObject({ done: 6, certificate: { number: last.body.data.certificate } });
  });

  it('moving the circle frees the space again', async () => {
    expect((await as(w.admin).put(`host/admin/circles/${w.circleA}/venue`, { spaceId: null })).status).toBe(200);
    expect((await as(w.admin).get(`host/admin/spaces/${spaceId}`)).body.data.status).toBe('approved');
  });
});
