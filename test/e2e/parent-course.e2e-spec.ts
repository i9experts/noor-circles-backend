import { Types } from 'mongoose';
import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';
import quizzes from '../../src/parent-course/content/quizzes.json';

const KEY = 'asaas-parents';
const mp3 = (n = 4000) => Buffer.concat([Buffer.from('ID3'), Buffer.alloc(n, 7)]);
const DAY = 24 * 3600_000;

describe('Asaas for Parents', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let parentToken: string;
  let parentId: string;

  beforeAll(async () => {
    ctx = await createApp('parentcourse');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    put: (p: string, b: object = {}) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const parent = () => as(parentToken);
  const oid = (id: string) => new Types.ObjectId(id);
  const course = async () => ctx.db.collection('courses').findOne({ key: KEY });
  /** Moves this parent's start date back, as if `days` had passed. */
  const backdate = async (days: number) => {
    const c = await course();
    await ctx.db.collection('courseassignments').updateOne({ course: c!._id, user: oid(parentId) }, { $set: { createdAt: new Date(Date.now() - days * DAY) } });
  };
  const correct = (key: string) => (quizzes as any)[key].map((q: any) => q.correctIndex);
  const markHeard = async (codes?: string[]) => {
    const c = await course();
    const lessons = await ctx.db.collection('courselessons').find({ course: c!._id, ...(codes && { code: { $in: codes } }) }).toArray();
    await ctx.db.collection('lessonprogresses').insertMany(lessons.map((l) => ({
      course: c!._id, lesson: l._id, user: oid(parentId), heard: [[0, l.durationSec]], heardSec: l.durationSec, percent: 100,
      completed: true, completedAt: new Date(), lastPosition: 0, listenSec: l.durationSec, lastBeatAt: new Date(),
    })));
  };

  describe('content', () => {
    it('seeds the course: 10 parts, 52 clips, 24 flip charts, parents only', async () => {
      const r = await adm().get(`course/${KEY}`);
      expect(r.status).toBe(200);
      const d = r.body.data;
      expect(d.course).toMatchObject({ audience: 'parent', tier: null, sequential: false });
      expect(d.sections.map((s: any) => s.key)).toEqual(['welcome', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'closing']);
      expect(d.stats).toMatchObject({ lessons: 52, withAudio: 0 });
      expect(d.course.flipCharts).toHaveLength(24);
      const pw01 = d.sections[0].lessons[0];
      expect(pw01.code).toBe('PW-01');
      // The parents' course never shows up as a murabbi badge.
      expect((await adm().get('course/badges')).body.data.some((b: any) => b.courseKey === KEY)).toBe(false);
    });

    it('takes the 52 clips by file name', async () => {
      const c = await course();
      const codes = (await ctx.db.collection('courselessons').find({ course: c!._id }).toArray()).map((l) => l.code);
      const req = ctx.http().post(`${API}/course/${KEY}/audio`).set(bearer(w.admin));
      for (const code of codes) req.attach('files', mp3(), `4e679dd8-${code.toLowerCase()}.mp3`);
      const r = await req;
      expect(r.status).toBe(201);
      expect(r.body.data.matched).toHaveLength(52);
      expect(r.body.data.missing).toEqual([]);
    });
  });

  describe('a parent account opens the course', () => {
    it('is enrolled automatically when the account is created', async () => {
      await ctx.http().post(`${API}/interest`).send({
        role: 'parent', firstName: 'Nadia', lastName: 'Ali', email: 'nadia@e2e.test', phone: '03005550001',
        city: 'Karachi', neighbourhood: 'Gulshan', roleDetail: '6–8 years',
      });
      const id = (await adm().get('interest')).body.data.find((i: any) => i.email === 'nadia@e2e.test')._id;
      const acc = await adm().post(`interest/${id}/account`);
      expect(acc.status).toBe(201);
      parentId = acc.body.data.account.id;
      const s = await ctx.http().post(`${API}/auth/signin`).send({ email: 'nadia@e2e.test', password: acc.body.data.credentials.password });
      parentToken = s.body.data.accessToken;

      const me = await parent().get('parent-course/me');
      expect(me.status).toBe(200);
      const d = me.body.data;
      expect(d.day).toBe(0);
      expect(d.privacy).toMatch(/Noor Circles team/);
      expect(d.privacy).not.toMatch(/TDW/);
      expect(d.sections.map((s: any) => s.open)).toEqual([true, true, false, false, false, false, false, false, false, false]);
      expect(d.sections[1].quiz).toMatchObject({ open: false, questions: 10, passMark: 7, attemptsLeft: 2 });
      expect(d.sections[1].target).toMatchObject({ kind: 'daily', slots: 14, needed: 10, lighterNeeded: 7, today: 0 });
      expect(d.finalQuiz).toMatchObject({ open: false, questions: 20, passMark: 14 });
      expect(d.selfCheck.items).toHaveLength(12);
      expect(d.pledge).toBeNull();
    });

    it('only parents see their course; progress is admins only', async () => {
      expect((await as(w.A.token).get('parent-course/me')).status).toBe(403);
      expect((await as(w.A.token).get('parent-course/admin/progress')).status).toBe(403);
      expect((await parent().get('parent-course/admin/progress')).status).toBe(403);
      expect((await parent().get(`course/${KEY}`)).status).toBe(403);
      // A murabbi can't play a parents' clip either.
      const c = await course();
      const pw01 = await ctx.db.collection('courselessons').findOne({ course: c!._id, code: 'PW-01' });
      expect((await as(w.A.token).get(`course/lessons/${pw01!._id}/play`)).status).toBe(403);
    });

    it('plays open clips; a later module stays closed until its fortnight', async () => {
      const c = await course();
      const [pw01, p201] = await Promise.all(['PW-01', 'P2-01'].map((code) => ctx.db.collection('courselessons').findOne({ course: c!._id, code })));
      const play = await parent().get(`course/lessons/${pw01!._id}/play`);
      expect(play.status).toBe(200);
      expect(play.body.data.lesson.transcript.some((p: any) => p.k === 'ar' && p.t.includes('الْحَمْدُ لِلَّهِ'))).toBe(true);
      const beat = await parent().post(`course/lessons/${pw01!._id}/heartbeat`, { segments: [[0, 30]], position: 30 });
      expect(beat.status).toBe(201);
      expect((await parent().get(`course/lessons/${p201!._id}/play`)).status).toBe(403);
      await backdate(14);
      expect((await parent().get(`course/lessons/${p201!._id}/play`)).status).toBe(200);
    });
  });

  describe('knowledge checks', () => {
    it('opens in the module’s second week, without the answers', async () => {
      await backdate(3);
      expect((await parent().get('parent-course/quiz/m1')).status).toBe(403);
      await backdate(7);
      const q = await parent().get('parent-course/quiz/m1');
      expect(q.status).toBe(200);
      expect(q.body.data.questions).toHaveLength(10);
      expect(JSON.stringify(q.body.data)).not.toMatch(/correctIndex|explanation/);
      expect((await parent().get('parent-course/quiz/m9')).status).toBe(400);
    });

    it('explains every answer; one retake after under 7; then closed', async () => {
      const wrong = correct('m1').map((i: number) => (i + 1) % 4);
      const r1 = await parent().post('parent-course/quiz/m1', { answers: wrong });
      expect(r1.body.data).toMatchObject({ correct: 0, passed: false, retakeLeft: true });
      expect(r1.body.data.review[0]).toHaveProperty('explanation');
      const r2 = await parent().post('parent-course/quiz/m1', { answers: correct('m1') });
      expect(r2.body.data).toMatchObject({ correct: 10, passed: true });
      expect((await parent().post('parent-course/quiz/m1', { answers: correct('m1') })).status).toBe(400);
      expect((await parent().post('parent-course/quiz/m2', { answers: correct('m2').slice(0, 5) })).status).toBe(403); // not open yet
    });
  });

  describe('self-check and targets', () => {
    it('self-check: once at the start; the end waits for the closing clip', async () => {
      const answers = Array(12).fill(1);
      expect((await parent().post('parent-course/self-check/start', { answers: [1, 2] })).status).toBe(400);
      expect((await parent().post('parent-course/self-check/start', { answers })).status).toBe(201);
      expect((await parent().post('parent-course/self-check/start', { answers })).status).toBe(400);
      expect((await parent().post('parent-course/self-check/end', { answers })).status).toBe(403);
    });

    it('daily target: no ticking future days; the lighter target counts', async () => {
      // Day 10 of the fortnight for module 1.
      expect((await parent().put('parent-course/targets/1', { slot: 11, on: true })).status).toBe(400);
      for (const slot of [0, 1, 2, 3, 4, 5]) expect((await parent().put('parent-course/targets/1', { slot, on: true })).body.data.met).toBe(false);
      expect((await parent().patch('parent-course/targets/1/lighter', { lighter: true })).body.data.met).toBe(false);
      const r = await parent().put('parent-course/targets/1', { slot: 6, on: true });
      expect(r.body.data).toMatchObject({ met: true, lighter: true, ticks: [0, 1, 2, 3, 4, 5, 6] });
      expect((await parent().patch('parent-course/targets/6/lighter', { lighter: true })).status).toBe(403); // module 6 not open
      expect((await parent().put('parent-course/targets/9', { slot: 0, on: true })).status).toBe(400);
    });
  });

  describe('admin and the certificate', () => {
    it('admin opens every module; final check after the closing clip; certificate when all is done', async () => {
      expect((await adm().patch(`parent-course/admin/parents/${parentId}`, { allOpen: true })).status).toBe(200);
      const me = (await parent().get('parent-course/me')).body.data;
      expect(me.sections.every((s: any) => s.open)).toBe(true);
      expect(me.finalQuiz.open).toBe(false);

      await ctx.db.collection('lessonprogresses').deleteMany({ user: oid(parentId) });
      await markHeard();
      for (const k of ['m2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'final']) {
        const r = await parent().post(`parent-course/quiz/${k}`, { answers: correct(k) });
        expect(r.body.data.passed).toBe(true);
        expect(r.body.data.certificate).toBeNull(); // the closing self-check is still missing
      }
      const end = await parent().post('parent-course/self-check/end', { answers: Array(12).fill(3) });
      expect(end.status).toBe(201);
      expect(end.body.data.start).toEqual(Array(12).fill(1));
      expect(end.body.data.certificate).toMatch(/^NCP-\d{4}-[A-F\d]{6}$/);

      const after = (await parent().get('parent-course/me')).body.data;
      expect(after.certificate.number).toBe(end.body.data.certificate);
      expect(after.pledge.length).toBeGreaterThan(5);
    });

    it('progress and detail for admins', async () => {
      const p = await adm().get('parent-course/admin/progress');
      expect(p.status).toBe(200);
      expect(p.body.data.stats).toMatchObject({ enrolled: 1, certified: 1 });
      expect(p.body.data.rows[0]).toMatchObject({ lessonsCompleted: 52, quizzesPassed: 8, finalPassed: true, targetsMet: 1, status: 'certified' });
      const d = await adm().get(`parent-course/admin/parents/${parentId}`);
      expect(d.body.data.selfCheck).toMatchObject({ start: Array(12).fill(1), end: Array(12).fill(3) });
      expect(d.body.data.quizzes.find((q: any) => q.key === 'm1').attempts).toHaveLength(2);
    });

    it('admin can open it for all parent accounts, and remove someone', async () => {
      const r = await adm().post('parent-course/admin/assign', { all: true });
      expect(r.status).toBe(201);
      expect(r.body.data.added).toBe(0); // the only parent account already has it
      expect((await adm().post('parent-course/admin/assign', { userIds: [w.A.id] })).status).toBe(400); // a murabbi
      expect((await adm().del(`parent-course/admin/parents/${parentId}`)).status).toBe(200);
      expect((await parent().get('parent-course/me')).status).toBe(403);
    });
  });

  describe('module emails', () => {
    let rabiaId: string;
    const svc = async () => ctx.app.get((await import('../../src/parent-course/parent-course.service')).ParentCourseService);
    const sent = (re: RegExp) => ctx.emails.filter((e) => e.to === 'rabia@e2e.test' && re.test(e.subject));
    const shift = async (days: number) => {
      const c = await course();
      await ctx.db.collection('courseassignments').updateOne({ course: c!._id, user: oid(rabiaId) }, { $set: { createdAt: new Date(Date.now() - days * DAY) } });
    };

    it('the course start is emailed when the account is created', async () => {
      await ctx.http().post(`${API}/interest`).send({
        role: 'parent', firstName: 'Rabia', lastName: 'Khan', email: 'rabia@e2e.test', phone: '03005550002',
        city: 'Karachi', neighbourhood: 'Gulshan', roleDetail: '9–10 years',
      });
      const id = (await adm().get('interest')).body.data.find((i: any) => i.email === 'rabia@e2e.test')._id;
      rabiaId = (await adm().post(`interest/${id}/account`)).body.data.account.id;
      const e = await ctx.waitForEmail((m) => m.to === 'rabia@e2e.test' && /Asaas for Parents has started/.test(m.subject));
      expect(e.html).toContain('پہلا مربی');
      expect(e.html).toContain('/parent/asaas');
      expect(e.headers?.['List-Unsubscribe'] ?? e.html).toBeTruthy();
    });

    it('each new module is emailed once, on the day it opens; never a backlog', async () => {
      const s = await svc();
      expect(await s.sendModuleEmails(new Date(), [rabiaId])).toBe(0); // the start email already went
      await shift(14);
      expect(await s.sendModuleEmails(new Date(), [rabiaId])).toBe(1);
      await ctx.waitForEmail((m) => m.to === 'rabia@e2e.test' && /Module 2 is open/.test(m.subject));
      expect(await s.sendModuleEmails(new Date(), [rabiaId])).toBe(0);
      // Three fortnights on with no run in between: only the current module, not 3 and 4.
      await shift(45);
      expect(await s.sendModuleEmails(new Date(), [rabiaId])).toBe(1);
      const m4 = await ctx.waitForEmail((m) => m.to === 'rabia@e2e.test' && /Module 4 is open/.test(m.subject));
      expect(m4.html).toContain('دوست اور دوستوں کا دباؤ');
      expect(sent(/Module 3 is open/)).toHaveLength(0);
    });

    it('the closing, and one email when an admin opens everything', async () => {
      const s = await svc();
      await shift(112);
      expect(await s.sendModuleEmails(new Date(), [rabiaId])).toBe(1);
      await ctx.waitForEmail((m) => m.to === 'rabia@e2e.test' && /last part of Asaas for Parents/.test(m.subject));
      expect((await adm().patch(`parent-course/admin/parents/${rabiaId}`, { allOpen: true })).status).toBe(200);
      await ctx.waitForEmail((m) => m.to === 'rabia@e2e.test' && /Every module of Asaas for Parents is open/.test(m.subject));
      expect(await s.sendModuleEmails(new Date(), [rabiaId])).toBe(0);
      expect(sent(/Every module/)).toHaveLength(1);
    });

    it('parents who switched off training emails don’t get them', async () => {
      await ctx.db.collection('emailpreferences').updateOne({ email: 'rabia@e2e.test' }, { $set: { optOut: ['training-reminders'] } }, { upsert: true });
      await ctx.db.collection('courseassignments').updateOne({ user: oid(rabiaId) }, { $set: { allOpen: false, createdAt: new Date(Date.now() - 28 * DAY) } });
      await ctx.db.collection('emaillogs').deleteMany({ to: 'rabia@e2e.test', dedupeKey: /:m3$/ });
      expect(await (await svc()).sendModuleEmails(new Date(), [rabiaId])).toBe(0);
    });
  });
});
