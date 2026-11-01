import { Types } from 'mongoose';
import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

describe('Parent rating and parent rewards', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let parentToken: string;
  let parentId: string;
  const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
  });
  const adm = () => as(w.admin);
  const parent = () => as(parentToken);
  const part = (r: any, key: string) => r.components.find((c: any) => c.key === key);

  beforeAll(async () => {
    ctx = await createApp('parentrating');
    w = await seedWorld(ctx);
    await ctx.http().post(`${API}/interest`).send({
      role: 'parent', firstName: 'Nadia', lastName: 'Ali', email: 'nadia@e2e.test', phone: '03005550001', city: 'Karachi', neighbourhood: 'Gulshan',
    });
    const iid = (await adm().get('interest')).body.data.find((i: any) => i.email === 'nadia@e2e.test')._id;
    const acc = await adm().post(`interest/${iid}/account`);
    parentId = acc.body.data.account.id;
    parentToken = (await ctx.http().post(`${API}/auth/signin`).send({ email: 'nadia@e2e.test', password: acc.body.data.credentials.password })).body.data.accessToken;
    // Nadia is Student A's mother; Student A came to one session this month and missed one.
    await ctx.db.collection('parents').updateOne({ account: new Types.ObjectId(parentId) }, { $set: { students: [new Types.ObjectId(w.studentA)] } });
    const att = (status: string, n: number) => ({
      circle: new Types.ObjectId(w.circleA), submittedBy: new Types.ObjectId(w.A.id), sessionNumber: n, sessionDate: new Date(),
      topic: 'x', records: [{ student: new Types.ObjectId(w.studentA), status, note: '' }],
    });
    await ctx.db.collection('attendances').insertMany([att('present', 1), att('absent', 2)]);
  });
  afterAll(async () => ctx.close());

  it('scores a parent on five parts; opening the family page counts as an active day', async () => {
    await parent().get('family/me');
    await parent().get('parent-course/me');
    const r = (await parent().get('parent-ratings/me')).body.data;
    expect(r.components.map((c: any) => [c.key, c.weight])).toEqual([
      ['attendance', 25], ['training', 25], ['targets', 20], ['reflections', 15], ['engagement', 15],
    ]);
    expect(part(r, 'attendance')).toMatchObject({ score: 50, detail: '1 of 2 sessions attended' });
    expect(part(r, 'training').score).toBe(0);
    expect(part(r, 'targets').score).toBe(0);
    expect(part(r, 'reflections')).toMatchObject({ score: 0, detail: 'A self-check or reflection is waiting' });
    expect(part(r, 'engagement')).toMatchObject({ score: 25, detail: 'Active on 1 day' });
    expect(r.month).toBe(month);
  });

  it('sharing the self-check fills the reflections part', async () => {
    const items = (await parent().get('parent-course/me')).body.data.selfCheck.items;
    expect((await parent().post('parent-course/self-check/start', { answers: items.map(() => 2) })).status).toBe(201);
    const r = (await parent().get('parent-ratings/me')).body.data;
    expect(part(r, 'reflections')).toMatchObject({ score: 100, detail: '1 shared this month' });
  });

  it('admins see every parent ranked and can adjust; the parent never sees the note', async () => {
    const list = (await adm().get(`parent-ratings?month=${month}`)).body.data;
    const row = list.find((x: any) => x.parent.email === 'nadia@e2e.test');
    expect(row.children).toEqual([{ fullName: 'Student A', circle: 'Circle A' }]);
    const before = row.finalScore;
    const r = await adm().patch(`parent-ratings/${parentId}?month=${month}`, { adjustment: 10, note: 'Helped at the parents’ evening' });
    expect(r.body.data.rating.finalScore).toBe(Math.min(100, before + 10));
    const mine = (await parent().get('parent-ratings/me')).body.data;
    expect(mine.adjustment).toBe(10);
    expect(mine.adjustmentNote).toBeUndefined();
    expect((await as(w.A.token).get('parent-ratings')).status).toBe(403);
    expect((await parent().get('parent-ratings')).status).toBe(403);
    expect((await adm().patch(`parent-ratings/${w.A.id}?month=${month}`, { adjustment: 5 })).status).toBe(404);
  });

  it('the reward pool can reward parents by their rating, and they see it', async () => {
    expect((await adm().post('rewards/pools', { month, budgetMode: 'fixed', budgetValue: 10000, studentSharePct: 80, parentSharePct: 30 })).status).toBe(400);
    const pool = await adm().post('rewards/pools', {
      month, budgetMode: 'fixed', budgetValue: 10000, studentSharePct: 50, parentSharePct: 30, maxParents: 5, minParentScore: 0,
    });
    expect(pool.status).toBe(201);
    expect(pool.body.data.totals).toMatchObject({ studentBudget: 5000, parentBudget: 3000, murabbiBudget: 2000 });
    const mine = pool.body.data.allocations.find((a: any) => a.recipientType === 'parent');
    expect(mine).toMatchObject({ amount: 3000, parent: expect.objectContaining({ email: 'nadia@e2e.test' }) });
    expect(pool.body.data.totals.toParents).toBe(3000);

    await adm().post(`rewards/pools/${month}/approve`);
    expect((await adm().post(`rewards/allocations/${mine._id}/pay`, { method: 'gift' })).status).toBe(201);
    const my = (await parent().get('rewards/my')).body.data;
    expect(my).toEqual([expect.objectContaining({ amount: 3000, status: 'paid' })]);
    const notes = JSON.stringify((await parent().get('notifications')).body.data);
    expect(notes).toMatch(/You received a reward of PKR 3,000/);
  });
});
