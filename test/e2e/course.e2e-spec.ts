import { Types } from 'mongoose';
import { API, bearer, createApp, E2EContext, MISSING_ID, seedWorld } from './helpers';

const KEY = 'asaas-tier1';
/** A tiny buffer that passes the MP3 check (ID3 header). */
const mp3 = (n = 4000) => Buffer.concat([Buffer.from('ID3'), Buffer.alloc(n, 7)]);

describe('Asaas audio training: assign, listen, assess, certify', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('course');
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
  const mA = () => as(w.A.token);
  const mB = () => as(w.B.token);

  let lessons: { _id: string; code: string; durationSec: number }[] = [];
  // Raw collections, so test-only changes (e.g. back-dating) skip Mongoose's casting and immutable fields.
  const Progress = () => ctx.db.collection('lessonprogresses');
  const oid = (id: string) => new Types.ObjectId(id);

  describe('content and audio', () => {
    it('seeds the course: 9 parts, 119 lessons, 30 questions', async () => {
      const r = await adm().get(`course/${KEY}`);
      expect(r.status).toBe(200);
      const d = r.body.data;
      expect(d.sections).toHaveLength(9);
      expect(d.stats).toMatchObject({ lessons: 119, withAudio: 0, assigned: 0 });
      expect(d.course.questions).toHaveLength(30);
      expect(d.criteria).toHaveLength(6);
      lessons = d.sections.flatMap((s: any) => s.lessons);
      expect(lessons[0].code).toBe('OP-01');
    });

    it('is admin-only', async () => {
      expect((await mA().get(`course/${KEY}`)).status).toBe(403);
      expect((await mA().get(`course/${KEY}/progress`)).status).toBe(403);
    });

    it('bulk upload matches files to lessons by name and rejects non-MP3s', async () => {
      const req = ctx.http().post(`${API}/course/${KEY}/audio`).set(bearer(w.admin));
      for (const l of lessons) req.attach('files', mp3(), `${l.code.toLowerCase()}.mp3`);
      req.attach('files', Buffer.from('not audio at all'), 'op-02.mp3');
      req.attach('files', mp3(), 'unknown-99.mp3');
      const r = await req;
      expect(r.status).toBe(201);
      expect(r.body.data.matched).toHaveLength(119);
      expect(r.body.data.unmatched).toEqual(['unknown-99.mp3']);
      expect(r.body.data.rejected).toEqual([{ file: 'op-02.mp3', reason: 'not an MP3 file' }]);
      expect(r.body.data.missing).toEqual([]);
      expect(r.body.message).toMatch(/Every lesson has audio/);
    });

    it('re-uploading replaces a lesson’s audio (upload-style prefixes are stripped)', async () => {
      const r = await ctx.http().post(`${API}/course/${KEY}/audio`).set(bearer(w.admin))
        .attach('files', mp3(9000), '1a2b3c4d-op-01.mp3');
      expect(r.body.data.matched).toEqual(['OP-01']);
      const files = await ctx.db.collection('courseAudio.files').countDocuments();
      expect(files).toBe(119);
    });
  });

  describe('assignment', () => {
    it('murabbis can’t open an unassigned training', async () => {
      expect((await mA().get(`course/${KEY}/me`)).status).toBe(403);
      expect((await mA().get('course/my')).body.data).toEqual([]);
    });

    it('admin assigns a murabbi with a due date; they are notified', async () => {
      const r = await adm().post(`course/${KEY}/assign`, { userIds: [w.A.id], dueDate: '2030-01-31', note: 'Before the new term' });
      expect(r.status).toBe(201);
      expect(r.body.data.added).toBe(1);
      const n = await mA().get('notifications');
      expect(JSON.stringify(n.body)).toMatch(/New training: Asaas Murabbi Training/);
      const my = await mA().get('course/my');
      expect(my.body.data[0]).toMatchObject({ key: KEY, lessonsCompleted: 0, lessonsTotal: 119, dueDate: '2030-01-31' });
    });

    it('re-assigning updates the due date only; non-murabbis are refused', async () => {
      const r = await adm().post(`course/${KEY}/assign`, { userIds: [w.A.id], dueDate: '2030-02-28' });
      expect(r.body.data).toMatchObject({ added: 0, updated: 1 });
      const bad = await adm().post(`course/${KEY}/assign`, { userIds: [MISSING_ID] });
      expect(bad.status).toBe(400);
    });
  });

  describe('listening', () => {
    it('lessons open in order', async () => {
      const me = await mA().get(`course/${KEY}/me`);
      expect(me.status).toBe(200);
      const ls = me.body.data.sections.flatMap((s: any) => s.lessons);
      expect(ls[0].locked).toBe(false);
      expect(ls[1].locked).toBe(true);
      expect((await mA().get(`course/lessons/${lessons[1]._id}/play`)).status).toBe(403);
    });

    it('play returns the transcript and a signed audio link that supports ranges', async () => {
      const r = await mA().get(`course/lessons/${lessons[0]._id}/play`);
      expect(r.status).toBe(200);
      expect(r.body.data.lesson.transcript.length).toBeGreaterThan(0);
      const url = new URL(r.body.data.audioUrl);
      const full = await ctx.http().get(url.pathname + url.search);
      expect(full.status).toBe(200);
      expect(full.headers['content-type']).toBe('audio/mpeg');
      expect(Number(full.headers['content-length'])).toBe(9003);
      const part = await ctx.http().get(url.pathname + url.search).set('Range', 'bytes=0-2');
      expect(part.status).toBe(206);
      expect(part.headers['content-range']).toBe('bytes 0-2/9003');
      expect(Buffer.from(part.body).toString('latin1')).toBe('ID3');
    });

    it('audio links can’t be forged or reused for another lesson', async () => {
      const r = await mA().get(`course/lessons/${lessons[0]._id}/play`);
      const token = new URL(r.body.data.audioUrl).searchParams.get('token')!;
      expect((await ctx.http().get(`${API}/course/lessons/${lessons[1]._id}/audio?token=${token}`)).status).toBe(403);
      expect((await ctx.http().get(`${API}/course/lessons/${lessons[0]._id}/audio?token=${token.slice(0, -2)}xx`)).status).toBe(403);
      expect((await ctx.http().get(`${API}/course/lessons/${lessons[0]._id}/audio`)).status).toBe(403);
    });

    it('a single report can’t claim the whole lesson', async () => {
      const l = lessons[0]; // 73s
      const r = await mA().post(`course/lessons/${l._id}/heartbeat`, { segments: [[0, l.durationSec]], position: l.durationSec });
      expect(r.status).toBe(201);
      expect(r.body.data.completed).toBe(false);
      expect(r.body.data.percent).toBe(Math.round((40 / l.durationSec) * 100));
    });

    it('steady listening completes the lesson, awards points and unlocks the next', async () => {
      const l = lessons[0];
      // As if the last report was 30s ago.
      await Progress().updateOne({ lesson: oid(l._id) }, { $set: { lastBeatAt: new Date(Date.now() - 30_000) } });
      const r = await mA().post(`course/lessons/${l._id}/heartbeat`, { segments: [[40, l.durationSec]], position: l.durationSec });
      expect(r.body.data).toMatchObject({ completed: true, justCompleted: true, percent: 100 });
      const me = await mA().get(`course/${KEY}/me`);
      expect(me.body.data.points).toBe(10);
      expect(me.body.data.progress.lessonsCompleted).toBe(1);
      expect(me.body.data.sections[0].lessons[1].locked).toBe(false);
      expect((await mA().get(`course/lessons/${lessons[1]._id}/play`)).status).toBe(200);
    });

    it('listening again doesn’t award points twice', async () => {
      const l = lessons[0];
      await Progress().updateOne({ lesson: oid(l._id) }, { $set: { lastBeatAt: new Date(Date.now() - 30_000) } });
      const r = await mA().post(`course/lessons/${l._id}/heartbeat`, { segments: [[0, 30]], position: 30 });
      expect(r.body.data.justCompleted).toBe(false);
      expect((await mA().get(`course/${KEY}/me`)).body.data.points).toBe(10);
    });

    it('another murabbi can’t report on a training they don’t have', async () => {
      expect((await mB().post(`course/lessons/${lessons[0]._id}/heartbeat`, { segments: [[0, 10]], position: 10 })).status).toBe(403);
    });

    it('admin sees progress per murabbi and per lesson', async () => {
      const r = await adm().get(`course/${KEY}/progress`);
      expect(r.body.data.stats).toMatchObject({ assigned: 1, inProgress: 1, certified: 0 });
      expect(r.body.data.rows[0]).toMatchObject({ lessonsCompleted: 1, lessonsTotal: 119, status: 'in-progress' });
      const d = await adm().get(`course/${KEY}/progress/${w.A.id}`);
      expect(d.body.data.sections[0].lessons[0]).toMatchObject({ code: 'OP-01', completed: true, percent: 100 });
    });
  });

  describe('assessment, reflection and certificate', () => {
    let answers: number[] = [];

    it('the assessment and reflection stay locked until every lesson is heard', async () => {
      expect((await mA().get(`course/${KEY}/assessment`)).status).toBe(403);
      expect((await mA().post(`course/${KEY}/reflection`, { text: 'x'.repeat(400) })).status).toBe(403);
    });

    it('opens once all lessons are heard, without revealing answers', async () => {
      const uid = oid(w.A.id);
      const course = await ctx.db.collection('courses').findOne({ key: KEY }) as any;
      await Progress().bulkWrite(lessons.map((l) => ({
        updateOne: {
          filter: { lesson: oid(l._id), user: uid },
          update: { $set: { course: course._id, completed: true, percent: 100, heardSec: l.durationSec } },
          upsert: true,
        },
      })));
      answers = course.questions.map((q: any) => q.correctIndex);
      const r = await mA().get(`course/${KEY}/assessment`);
      expect(r.status).toBe(200);
      expect(r.body.data.questions).toHaveLength(30);
      expect(JSON.stringify(r.body.data)).not.toMatch(/correctIndex|explanation/);
    });

    it('failing shows no answers; three failures a day is the limit', async () => {
      const wrong = answers.map((a) => (a + 1) % 4);
      for (let i = 0; i < 3; i++) {
        const r = await mA().post(`course/${KEY}/assessment`, { answers: wrong });
        expect(r.status).toBe(201);
        expect(r.body.data).toMatchObject({ passed: false, scorePercent: 0, review: null, attemptsLeftToday: 2 - i });
      }
      const blocked = await mA().post(`course/${KEY}/assessment`, { answers });
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/today's 3 attempts/);
      await ctx.db.collection('courseattempts').updateMany({}, { $set: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    });

    it('must answer every question', async () => {
      expect((await mA().post(`course/${KEY}/assessment`, { answers: [0] })).status).toBe(400);
    });

    it('passing (70%+) awards points and explains the answers, but doesn’t certify yet', async () => {
      const mostly = answers.map((a, i) => (i < 21 ? a : (a + 1) % 4)); // 21/30 = 70%
      const r = await mA().post(`course/${KEY}/assessment`, { answers: mostly });
      expect(r.body.data).toMatchObject({ passed: true, scorePercent: 70, certificate: null });
      expect(r.body.data.review).toHaveLength(30);
      expect((await mA().get(`course/${KEY}/me`)).body.data.points).toBe(110);
    });

    it('the reflection needs enough words; admins are told when it arrives', async () => {
      const short = await mA().post(`course/${KEY}/reflection`, { text: 'Too short.' });
      expect(short.status).toBe(400);
      const r = await mA().post(`course/${KEY}/reflection`, { text: 'My child-understanding changed: '.repeat(20) });
      expect(r.status).toBe(201);
      const n = await adm().get('notifications');
      expect(JSON.stringify(n.body)).toMatch(/Training reflection to review/);
    });

    it('asking for a revision needs feedback', async () => {
      const list = await adm().get(`course/${KEY}/reflections?status=submitted`);
      const id = list.body.data[0]._id;
      expect((await adm().patch(`course/reflections/${id}`, { status: 'revision' })).status).toBe(400);
      const r = await adm().patch(`course/reflections/${id}`, { status: 'revision', feedback: 'Add one example from your own circle.' });
      expect(r.body.data.certificate).toBeNull();
      const me = await mA().get(`course/${KEY}/me`);
      expect(me.body.data.reflection).toMatchObject({ status: 'revision', feedback: 'Add one example from your own circle.' });
    });

    it('when a practical is required, an approved reflection alone isn’t enough', async () => {
      await adm().patch(`course/${KEY}/settings`, { requirePractical: true });
      await mA().post(`course/${KEY}/reflection`, { text: 'Revised, with an example from my circle. '.repeat(15) });
      const id = (await adm().get(`course/${KEY}/reflections?status=submitted`)).body.data[0]._id;
      const r = await adm().patch(`course/reflections/${id}`, { status: 'approved' });
      expect(r.body.data.certificate).toBeNull();
    });

    it('a practical under 8/18 means one more practice session', async () => {
      const r = await adm().put(`course/${KEY}/practical/${w.A.id}`, { scores: [1, 1, 1, 1, 1, 2] });
      expect(r.body.data).toMatchObject({ total: 7, band: 'practice', certificate: null });
      expect((await adm().put(`course/${KEY}/practical/${w.A.id}`, { scores: [4, 1, 1, 1, 1, 1] })).status).toBe(400);
    });

    it('a conditional pass certifies: certificate, badge and notification', async () => {
      const r = await adm().put(`course/${KEY}/practical/${w.A.id}`, { scores: [2, 2, 1, 2, 1, 2] });
      expect(r.body.data.band).toBe('conditional');
      expect(r.body.data.certificate.number).toMatch(/^NC-T1-\d{6}$/);

      const me = await mA().get(`course/${KEY}/me`);
      expect(me.body.data.certificate.number).toBe(r.body.data.certificate.number);
      expect(me.body.data.assignment.certifiedAt).toBeTruthy();

      const badges = await mA().get('course/badges');
      expect(badges.body.data).toEqual([expect.objectContaining({ user: w.A.id, badge: 'Certified Asaas Murabbi' })]);
      const n = await mA().get('notifications');
      expect(JSON.stringify(n.body)).toMatch(/You are a Certified Asaas Murabbi/);

      const pdf = await mA().get('training/certificate/1/download');
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toMatch(/pdf/);

      const report = await adm().get(`course/${KEY}/progress`);
      expect(report.body.data.stats.certified).toBe(1);
      expect(report.body.data.rows[0].status).toBe('certified');
    });

    it('admins see every murabbi’s badge', async () => {
      const r = await adm().get('course/badges');
      expect(r.body.data.map((b: any) => b.user)).toEqual([w.A.id]);
    });
  });

  describe('admin settings and questions', () => {
    it('validates questions', async () => {
      const bad = await adm().put(`course/${KEY}/questions`, { questions: [{ question: 'Q', options: ['a', 'b'], correctIndex: 2 }] });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toMatch(/correct answer must be one of its 2 options/);
    });

    it('saves settings within limits', async () => {
      expect((await adm().patch(`course/${KEY}/settings`, { passingScore: 150 })).status).toBe(400);
      const r = await adm().patch(`course/${KEY}/settings`, { passingScore: 75, points: { lesson: 5 } });
      expect(r.body.data.course).toMatchObject({ passingScore: 75, points: { lesson: 5, section: 25, assessment: 100 } });
    });

    it('unassigning keeps history', async () => {
      const r = await adm().del(`course/${KEY}/assign/${w.A.id}`);
      expect(r.status).toBe(200);
      expect((await mA().get(`course/${KEY}/me`)).status).toBe(403);
      expect(await Progress().countDocuments()).toBe(119);
    });
  });
});
