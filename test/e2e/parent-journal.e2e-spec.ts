import { Types } from 'mongoose';
import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';
import { PARENT_JOURNAL_PAGES } from '../../src/parent-journal/parent-journal.pages';

const KEY = 'asaas-parents';

describe('Parent Journal', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let parentToken: string, parentId: string;
  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    put: (p: string, b: object = {}) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const parent = () => as(parentToken);
  const oid = (id: string) => new Types.ObjectId(id);
  const markHeard = async (codes: string[]) => {
    const c = await ctx.db.collection('courses').findOne({ key: KEY });
    const lessons = await ctx.db.collection('courselessons').find({ course: c!._id, code: { $in: codes } }).toArray();
    await ctx.db.collection('lessonprogresses').insertMany(lessons.map((l) => ({
      course: c!._id, lesson: l._id, user: oid(parentId), heard: [[0, l.durationSec]], heardSec: l.durationSec, percent: 100,
      completed: true, completedAt: new Date(), lastPosition: 0, listenSec: l.durationSec, lastBeatAt: new Date(),
    })));
  };

  beforeAll(async () => {
    ctx = await createApp('parentjournal');
    w = await seedWorld(ctx);
    await adm().get(`course/${KEY}`); // seeds the course
    await ctx.http().post(`${API}/interest`).send({
      role: 'parent', firstName: 'Nadia', lastName: 'Ali', email: 'nadia@e2e.test', phone: '03005550001',
      city: 'Karachi', neighbourhood: 'Gulshan', roleDetail: '6–8 years',
    });
    const id = (await adm().get('interest')).body.data.find((i: any) => i.email === 'nadia@e2e.test')._id;
    const acc = await adm().post(`interest/${id}/account`);
    parentId = acc.body.data.account.id;
    parentToken = (await ctx.http().post(`${API}/auth/signin`).send({ email: 'nadia@e2e.test', password: acc.body.data.credentials.password })).body.data.accessToken;
  });
  afterAll(async () => ctx.close());

  it('every page’s lesson exists in Asaas for Parents', async () => {
    const c = await ctx.db.collection('courses').findOne({ key: KEY });
    const codes = new Set((await ctx.db.collection('courselessons').find({ course: c!._id }).toArray()).map((l) => l.code));
    for (const p of PARENT_JOURNAL_PAGES) expect(codes.has(p.lessonCode)).toBe(true);
  });

  it('shows 12 pages, all closed until their lesson is heard', async () => {
    const r = await parent().get('parent-journal');
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ owner: expect.stringMatching(/^Nadia/), assigned: true, progress: { done: 0, total: 12 }, moments: { open: false, list: [] } });
    expect(d.pages.map((p: any) => p.key)).toEqual(PARENT_JOURNAL_PAGES.map((p) => p.key));
    expect(d.pages.every((p: any) => p.open === false && p.lesson?.code === p.lessonCode)).toBe(true);
    expect((await parent().put('parent-journal/pages/roots', { answers: { roots: 'x' } })).status).toBe(403);
    expect((await parent().post('parent-journal/moments', { text: 'x' })).status).toBe(403);
  });

  it('opens a page after its lesson, saves drafts, completes it and awards points once', async () => {
    await markHeard(['P1-05', 'PW-02', 'P5-05']);
    const draft = await parent().put('parent-journal/pages/roots', { answers: { roots: 'Fajr with my grandfather', extra: 'ignored' } });
    expect(draft.status).toBe(200);
    expect(draft.body.data).toMatchObject({ done: false, points: 0 });
    const full = await parent().put('parent-journal/pages/roots', { answers: { roots: 'Fajr with my grandfather', branches: 'Confidence', letGo: 'Comparison with cousins' } });
    expect(full.body.data).toMatchObject({ done: true, points: 10 });
    const again = await parent().put('parent-journal/pages/roots', { answers: { roots: 'Fajr', branches: 'Confidence', letGo: 'Comparison' } });
    expect(again.body.data).toMatchObject({ done: true, points: 0 });
    // Optional boxes don't hold a page back.
    expect((await parent().put('parent-journal/pages/strengths', { answers: { child1: 'Hamza: kind, shared lunch on Tuesday' } })).body.data.done).toBe(true);

    const d = (await parent().get('parent-journal')).body.data;
    expect(d.progress.done).toBe(2);
    const roots = d.pages.find((p: any) => p.key === 'roots');
    expect(roots).toMatchObject({ open: true, done: true, answers: { roots: 'Fajr', branches: 'Confidence', letGo: 'Comparison' } });
    expect(roots.answers.extra).toBeUndefined();
    expect(await ctx.db.collection('murabbipoints').countDocuments({ user: oid(parentId), reason: 'parent-journal' })).toBe(2);
    expect((await parent().put('parent-journal/pages/nope', { answers: {} })).status).toBe(404);
  });

  it('keeps moments at home, private to the parent', async () => {
    const m = await parent().post('parent-journal/moments', { text: 'Hamza read the dua by himself tonight.', date: '2026-11-01' });
    expect(m.status).toBe(201);
    expect((await parent().post('parent-journal/moments', { text: 'later', date: '2999-01-01' })).status).toBe(400);
    expect((await parent().post('parent-journal/moments', { text: '' })).status).toBe(400);
    const list = (await parent().get('parent-journal')).body.data.moments;
    expect(list).toMatchObject({ open: true, list: [expect.objectContaining({ text: 'Hamza read the dua by himself tonight.' })] });
    // Another user can't delete it.
    expect((await as(w.A.token).del(`parent-journal/moments/${m.body.data.moment._id}`)).status).toBe(403);
    expect((await parent().del(`parent-journal/moments/${m.body.data.moment._id}`)).status).toBe(200);
  });

  it('the team sees counts only, never the words', async () => {
    const r = await adm().get('parent-journal/admin/progress');
    expect(r.status).toBe(200);
    const row = r.body.data.find((x: any) => x.user._id === parentId);
    expect(row).toMatchObject({ pagesDone: 2, totalPages: 12, moments: 0 });
    expect(JSON.stringify(r.body)).not.toMatch(/grandfather|Fajr|Hamza/);
    // Murabbis and admins can't open a parent's journal; parents can't see the counts.
    expect((await as(w.A.token).get('parent-journal')).status).toBe(403);
    expect((await adm().get('parent-journal')).status).toBe(403);
    expect((await parent().get('parent-journal/admin/progress')).status).toBe(403);
    // And it never shows in the murabbis' Noor Journal views.
    expect(JSON.stringify((await adm().get('journal/admin/moments')).body)).not.toMatch(/Hamza/);
  });
});
