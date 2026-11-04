import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

describe('Registers (murabbis, parents, hosts) and follow-ups', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let parentId: string, hostId: string, hostToken: string;
  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
  });
  const pkDay = (offset = 0) => new Date(Date.now() + 5 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    ctx = await createApp('register');
    w = await seedWorld(ctx);
    const p = await as(w.admin).post('parents', { fullName: 'Sara Khan', phone: '03004445566', studentIds: [w.studentA] });
    parentId = (p.body.data.parent ?? p.body.data)._id;
    await as(w.admin).post('attendance', {
      circle: w.circleA, sessionNumber: 1, sessionDate: '2026-05-01T10:00:00.000Z', records: [{ student: w.studentA, status: 'present' }],
    });
    await as(w.admin).post('attendance', {
      circle: w.circleA, sessionNumber: 2, sessionDate: '2026-05-08T10:00:00.000Z', records: [{ student: w.studentA, status: 'absent' }],
    });
    await ctx.http().post(`${API}/interest`).send({
      role: 'host', firstName: 'Saad', lastName: 'Hussaini', email: 'saad@e2e.test', phone: '03082235245', city: 'Karachi', neighbourhood: 'Gulshan', roleDetail: 'Living room',
    });
    const iid = (await as(w.admin).get('interest')).body.data.find((i: any) => i.email === 'saad@e2e.test')._id;
    const acc = await as(w.admin).post(`interest/${iid}/account`);
    hostId = acc.body.data.user?._id ?? acc.body.data.account?._id;
    hostToken = (await ctx.http().post(`${API}/auth/signin`).send({ email: 'saad@e2e.test', password: acc.body.data.credentials.password })).body.data.accessToken;
    if (!hostId) hostId = (await as(hostToken).get('auth/me')).body.data?._id ?? (await as(hostToken).get('auth/me')).body.data?.user?._id;
  });
  afterAll(async () => ctx.close());

  it('lists every murabbi with circles, students, sessions, training and follow-up', async () => {
    const r = await as(w.admin).get('register/murabbis');
    expect(r.status).toBe(200);
    const a = r.body.data.find((m: any) => m._id === w.A.id);
    expect(a).toMatchObject({
      fullName: 'Murabbi A', area: 'Gulshan', city: 'Karachi',
      circles: [expect.objectContaining({ name: 'Circle A', students: 1 })], students: 1, sessions: 2,
      account: expect.objectContaining({ exists: true, active: true }),
      rewards: { paid: 0, approved: 0 },
      followUp: { status: 'new', nextDate: null, due: null, notes: 0, lastNote: null },
    });
    expect(new Date(a.lastSession).toISOString()).toBe('2026-05-08T10:00:00.000Z');
  });

  it('lists parents with children, age, circle and attendance; profile stays a count', async () => {
    const r = await as(w.admin).get('register/parents');
    expect(r.status).toBe(200);
    const p = r.body.data.find((x: any) => x._id === parentId);
    expect(p).toMatchObject({
      fullName: 'Sara Khan', phone: '03004445566', area: 'Gulshan',
      account: expect.objectContaining({ exists: false, userId: null }),
      children: [expect.objectContaining({ fullName: 'Student A', circle: expect.objectContaining({ name: 'Circle A' }), murabbi: 'Murabbi A', attendance: expect.objectContaining({ present: 1, total: 2, percent: 50 }) })],
      profile: expect.objectContaining({ answered: 0 }),
    });
    expect(JSON.stringify(p)).not.toMatch(/relationship|household/);
  });

  it('lists hosts with their spaces and host training', async () => {
    const r = await as(w.admin).get('register/hosts');
    expect(r.status).toBe(200);
    const h = r.body.data.find((x: any) => x.email === 'saad@e2e.test');
    hostId = h._id;
    expect(h).toMatchObject({
      fullName: expect.stringMatching(/^Saad/), spaces: [expect.objectContaining({ status: 'offered', circles: [] })],
      training: { done: 0, total: 6, certificate: null },
    });
  });

  it('records notes and next dates, and the dashboard shows what is due', async () => {
    const n = await as(w.admin).post(`register/murabbi/${w.A.id}/notes`, { kind: 'call', text: 'Called about Asaas; will start this week.', nextDate: pkDay(-1) });
    expect(n.status).toBe(201);
    expect(n.body.data).toMatchObject({ status: 'in-progress', nextDate: pkDay(-1), due: 'overdue', notes: 1 });
    expect(n.body.data.log[0]).toMatchObject({ kind: 'call', byName: expect.any(String) });

    const u = await as(w.admin).patch(`register/parent/${parentId}/follow-up`, { status: 'to-contact', nextDate: pkDay() });
    expect(u.status).toBe(200);
    expect(u.body.data).toMatchObject({ status: 'to-contact', due: 'today' });
    await as(w.admin).patch(`register/host/${hostId}/follow-up`, { nextDate: pkDay(3) });

    const d = await as(w.admin).get('register/due');
    expect(d.body.data).toMatchObject({ today: 1, overdue: 1, byType: { murabbi: 1, parent: 1, host: 0 } });
    expect(d.body.data.items[0]).toMatchObject({ subjectType: 'murabbi', name: 'Murabbi A', overdue: true });

    const list = await as(w.admin).get('register/murabbis');
    expect(list.body.data.find((m: any) => m._id === w.A.id).followUp).toMatchObject({ due: 'overdue', lastNote: expect.objectContaining({ kind: 'call' }) });

    // Done takes it off the dashboard; clearing the date works too.
    await as(w.admin).patch(`register/murabbi/${w.A.id}/follow-up`, { status: 'done' });
    await as(w.admin).patch(`register/parent/${parentId}/follow-up`, { nextDate: null });
    expect((await as(w.admin).get('register/due')).body.data).toMatchObject({ today: 0, overdue: 0 });
  });

  it('checks input and the subject belongs to that register', async () => {
    expect((await as(w.admin).post(`register/murabbi/${w.A.id}/notes`, { kind: 'telepathy', text: 'x' })).status).toBe(400);
    expect((await as(w.admin).patch(`register/murabbi/${w.A.id}/follow-up`, { nextDate: '5 May' })).status).toBe(400);
    expect((await as(w.admin).patch(`register/host/${w.A.id}/follow-up`, { status: 'done' })).status).toBe(404);
    expect((await as(w.admin).patch(`register/elves/${w.A.id}/follow-up`, { status: 'done' })).status).toBe(400);
    expect((await as(w.admin).get('register/murabbi/not-an-id/follow-up')).status).toBe(404);
  });

  it('is admin only', async () => {
    for (const p of ['register/murabbis', 'register/parents', 'register/hosts', 'register/due', `register/parent/${parentId}/follow-up`]) {
      expect((await as(w.A.token).get(p)).status).toBe(403);
      expect((await as(hostToken).get(p)).status).toBe(403);
    }
    expect((await ctx.http().get(`${API}/register/murabbis`)).status).toBe(401);
  });
});
