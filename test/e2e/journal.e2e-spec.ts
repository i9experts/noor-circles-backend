import { Types } from 'mongoose';
import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

describe('Noor Journal', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    put: (p: string, b: object) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
    post: (p: string, b: object) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const hear = async (code: string, userId: string) => {
    const course = await ctx.db.collection('courses').findOne({ key: 'asaas-tier1' });
    const lesson = await ctx.db.collection('courselessons').findOne({ course: course!._id, code });
    await ctx.db.collection('lessonprogresses').updateOne(
      { lesson: lesson!._id, user: new Types.ObjectId(userId) },
      { $set: { course: course!._id, completed: true, percent: 100, heardSec: lesson!.durationSec } }, { upsert: true },
    );
  };
  const PRIVATE = 'Because my nephew has nobody to talk to';

  beforeAll(async () => {
    ctx = await createApp('journal');
    w = await seedWorld(ctx);
    await as(w.admin).post('course/asaas-tier1/assign', { userIds: [w.A.id] });
  });
  afterAll(async () => ctx.close());

  it('lists the 12 pages from the training, each closed until its lesson is heard', async () => {
    const r = await as(w.A.token).get('journal');
    expect(r.status).toBe(200);
    expect(r.body.data.pages.map((p: any) => p.key)).toEqual([
      'purpose', 'gaps', 'qualities', 'listening', 'takeaway', 'overnight', 'age', 'questions', 'mock', 'parents', 'sustainability', 'reflection',
    ]);
    expect(r.body.data.pages[0]).toMatchObject({ open: false, lessonCode: 'M1-13', lesson: { code: 'M1-13' }, titleUr: 'میری نیت' });
    expect(r.body.data.moments.open).toBe(false);
    expect((await as(w.A.token).put('journal/pages/purpose', { answers: { why: 'x' } })).status).toBe(403);
  });

  it('opens a page with its audio and saves; a complete page earns points once', async () => {
    await hear('M1-13', w.A.id);
    const half = await as(w.A.token).put('journal/pages/purpose', { answers: { why: PRIVATE, junk: 'ignored' } });
    expect(half.status).toBe(200);
    expect(half.body.data).toMatchObject({ done: false, points: 0 });
    const full = await as(w.A.token).put('journal/pages/purpose', { answers: { why: PRIVATE, deserve: 'patience', year: 'a kinder street' } });
    expect(full.body.data).toMatchObject({ done: true, points: 10 });
    expect((await as(w.A.token).put('journal/pages/purpose', { answers: { why: PRIVATE, deserve: 'patience', year: 'more' } })).body.data.points).toBe(0);
    const page = (await as(w.A.token).get('journal')).body.data.pages[0];
    expect(page).toMatchObject({ open: true, done: true, answers: { why: PRIVATE, deserve: 'patience', year: 'more' } });
    expect(page.answers.junk).toBeUndefined();
  });

  it('checks choices', async () => {
    await hear('M3-11', w.A.id);
    expect((await as(w.A.token).put('journal/pages/age', { answers: { theme: 'pizza' } })).status).toBe(400);
    expect((await as(w.A.token).put('journal/pages/age', { answers: { theme: 'gratitude', young: 'a', older: 'b' } })).body.data.done).toBe(true);
  });

  it('moments of light open with M6-02 and stay private', async () => {
    expect((await as(w.A.token).post('journal/moments', { text: 'Zaid smiled' })).status).toBe(403);
    await hear('M6-02', w.A.id);
    const m = await as(w.A.token).post('journal/moments', { text: 'Zaid answered for the first time', circleId: w.circleA });
    expect(m.status).toBe(201);
    expect((await as(w.A.token).post('journal/moments', { text: 'x', circleId: w.circleB })).status).toBe(404); // not their circle
    expect((await as(w.A.token).post('journal/moments', { text: 'x', date: '2099-01-01' })).status).toBe(400);
    const list = (await as(w.A.token).get('journal')).body.data.moments.list;
    expect(list[0]).toMatchObject({ text: 'Zaid answered for the first time', circle: { name: 'Circle A' } });
    expect((await as(w.B.token).del(`journal/moments/${list[0]._id}`)).status).toBe(404);
    expect((await as(w.A.token).del(`journal/moments/${list[0]._id}`)).status).toBe(200);
  });

  it('admins see only progress, never what was written; other murabbis see nothing', async () => {
    const r = await as(w.admin).get('journal/admin/progress');
    expect(r.status).toBe(200);
    const row = r.body.data.find((x: any) => x.user.fullName === 'Murabbi A');
    expect(row).toMatchObject({ pagesDone: 2, totalPages: 12, moments: 0 });
    expect(JSON.stringify(r.body)).not.toContain(PRIVATE);
    expect((await as(w.B.token).get('journal/admin/progress')).status).toBe(403);
    expect((await as(w.B.token).get('journal')).body.data.pages[0].answers).toEqual({});
    expect((await as(w.admin).get('journal')).status).toBe(403);
  });
});
