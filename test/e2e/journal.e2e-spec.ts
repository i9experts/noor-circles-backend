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
    patch: (p: string, b: object) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
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

  it('admins see progress and insights; other murabbis see nothing', async () => {
    const r = await as(w.admin).get('journal/admin/progress');
    expect(r.status).toBe(200);
    expect(r.body.data.find((x: any) => x.user.fullName === 'Murabbi A')).toMatchObject({ pagesDone: 2, totalPages: 12, moments: 0 });

    const i = await as(w.admin).get('journal/admin/insights');
    expect(i.status).toBe(200);
    const { summary, pages, murabbis, months } = i.body.data;
    expect(summary).toMatchObject({ murabbis: 1, writing: 1, pagesDone: 2, totalPages: 12 });
    expect(pages.find((p: any) => p.key === 'purpose')).toMatchObject({ open: 1, done: 1 });
    expect(pages.find((p: any) => p.key === 'qualities')).toMatchObject({ open: 0, done: 0 });
    const a = murabbis[0];
    expect(a).toMatchObject({ user: { fullName: 'Murabbi A' }, pagesDone: 2, pagesOpen: 2, waiting: 0, circles: ['Circle A'] });
    expect(murabbis.some((m: any) => m.user.fullName === 'Murabbi B')).toBe(false); // not given the training
    expect(months).toHaveLength(6);

    for (const path of ['journal/admin/progress', 'journal/admin/insights', `journal/admin/murabbis/${w.A.id}`, 'journal/admin/moments']) {
      expect((await as(w.B.token).get(path)).status).toBe(403);
    }
    expect((await as(w.B.token).get('journal')).body.data.pages[0].answers).toEqual({});
    expect((await as(w.admin).get('journal')).status).toBe(403);
  });

  it('admins can read a murabbi’s whole journal', async () => {
    const r = await as(w.admin).get(`journal/admin/murabbis/${w.A.id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.user).toMatchObject({ fullName: 'Murabbi A' });
    expect(r.body.data.pages[0].answers.why).toBe(PRIVATE);
    expect((await as(w.admin).get(`journal/admin/murabbis/${new Types.ObjectId()}`)).status).toBe(404);
  });

  it('sends a reminder at most once a day', async () => {
    await hear('M2-06', w.A.id);
    const r = await as(w.admin).post('journal/admin/remind', { userIds: [w.A.id] });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ sent: 1 });
    const again = await as(w.admin).post('journal/admin/remind', { userIds: [w.A.id] });
    expect(again.body.data).toMatchObject({ sent: 0, already: 1 });
    const mail = await ctx.db.collection('emaillogs').findOne({ kind: 'journal.reminder', to: { $regex: /./ } });
    expect(mail!.subject).toBe('Your Noor Journal is waiting');
    expect(mail!.html).toContain('Qualities Inventory');
    const row = (await as(w.admin).get('journal/admin/insights')).body.data.murabbis[0];
    expect(row).toMatchObject({ waiting: 1, nextPage: 'Qualities Inventory', reminders: 1 });
    expect(row.lastReminderAt).toBeTruthy();
    expect((await as(w.admin).post('journal/admin/remind', { userIds: [] })).status).toBe(400);
  });

  it('features moments, and shows the murabbi’s name only with consent', async () => {
    const m = (await as(w.A.token).post('journal/moments', { text: 'Hira led the dua', circleId: w.circleA })).body.data.moment;
    let list = (await as(w.admin).get('journal/admin/moments')).body.data;
    expect(list[0]).toMatchObject({ text: 'Hira led the dua', murabbi: { fullName: 'Murabbi A' }, circle: 'Circle A', shareName: false, featured: false });
    expect(list[0].byline).toMatch(/^A Noor Circles murabbi, Circle A/);
    expect((await as(w.admin).patch(`journal/admin/moments/${m._id}`, { featured: true })).status).toBe(200);
    expect((await as(w.B.token).patch(`journal/moments/${m._id}`, { shareName: true })).status).toBe(404);
    expect((await as(w.A.token).patch(`journal/moments/${m._id}`, { shareName: true })).status).toBe(200);
    list = (await as(w.admin).get('journal/admin/moments?featured=true')).body.data;
    expect(list).toHaveLength(1);
    expect(list[0].byline).toMatch(/^Murabbi A, Circle A/);
    expect((await as(w.admin).get('journal/admin/insights')).body.data.summary).toMatchObject({ moments: 1, featured: 1 });
  });
});
