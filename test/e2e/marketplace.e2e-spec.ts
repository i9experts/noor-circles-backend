import { Types } from 'mongoose';
import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

/** A real (silent) MP3: `frames` MPEG-1 Layer III frames at 128 kbps / 44.1 kHz, about 26 ms each. */
const mp3 = (frames: number) => {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
};

describe('Trainings marketplace', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let key: string;
  let lessons: { _id: string; durationSec: number }[] = [];
  let parentToken: string;
  let parentId: string;

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    put: (p: string, b: object = {}) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const mA = () => as(w.A.token);
  const oid = (id: string) => new Types.ObjectId(id);
  const explore = async (token: string) => (await as(token).get('trainings')).body.data;

  beforeAll(async () => {
    ctx = await createApp('marketplace');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  describe('building a training', () => {
    it('creates an unpublished training that nobody sees yet', async () => {
      const r = await adm().post('course', { title: 'Asaas Tier 2', audience: 'murabbi', summary: 'Leading a circle with confidence', category: 'Foundations' });
      expect(r.status).toBe(201);
      key = r.body.data.course.key;
      expect(key).toBe('asaas-tier-2');
      expect(r.body.data.course).toMatchObject({ published: false, audience: 'murabbi' });
      expect((await explore(w.A.token)).explore.map((c: any) => c.key)).not.toContain(key);
    });

    it('adds modules and lessons, numbered through the training', async () => {
      const s1 = (await adm().post(`course/${key}/sections`, { title: 'Module 1' })).body.data.section;
      const s2 = (await adm().post(`course/${key}/sections`, { title: 'Module 2' })).body.data.section;
      const l2 = await adm().post(`course/${key}/lessons`, { sectionId: s2._id, title: 'Second', transcript: 'Para one.\n\nPara two.' });
      const l1 = await adm().post(`course/${key}/lessons`, { sectionId: s1._id, title: 'First' });
      expect(l2.status).toBe(201);
      expect(l2.body.message).toMatch(/l01\.mp3/);
      const outline = (await adm().get(`course/${key}`)).body.data;
      expect(outline.sections.map((s: any) => s.lessons.map((l: any) => [l.title, l.order]))).toEqual([[['First', 1]], [['Second', 2]]]);
      const edit = (await adm().get(`course/lessons/${l2.body.data.lesson._id}/edit`)).body.data;
      expect(edit.transcriptText).toBe('Para one.\n\nPara two.');
      // Moving module 2 up puts its lesson first.
      await adm().patch(`course/sections/${s2._id}`, { move: 'up' });
      const again = (await adm().get(`course/${key}`)).body.data;
      expect(again.sections[0].lessons[0]).toMatchObject({ title: 'Second', order: 1 });
      expect((await adm().del(`course/sections/${s1._id}`)).status).toBe(400); // not empty
      lessons = again.sections.flatMap((s: any) => s.lessons);
      expect(l1.status).toBe(201);
    });

    it('can’t be published without audio; an uploaded MP3 sets the lesson length', async () => {
      expect((await adm().patch(`course/${key}/settings`, { published: true })).status).toBe(400);
      for (const l of lessons) {
        const r = await ctx.http().post(`${API}/course/lessons/${l._id}/audio`).set(bearer(w.admin)).attach('file', mp3(383), 'x.mp3');
        expect(r.status).toBe(201);
        expect(r.body.data.durationSec).toBeCloseTo(10, 0);
      }
      const r = await adm().patch(`course/${key}/settings`, { published: true, prerequisites: ['asaas-tier1'], tier: 2, badge: 'Tier 2 Murabbi' });
      expect(r.status).toBe(200);
      lessons = (await adm().get(`course/${key}`)).body.data.sections.flatMap((s: any) => s.lessons);
      expect(lessons[0].durationSec).toBeCloseTo(10, 0);
    });

    it('refuses trainings that require each other, and editing the recorded Asaas lessons', async () => {
      expect((await adm().patch('course/asaas-tier1/settings', { prerequisites: [key] })).status).toBe(400);
      const s = (await adm().get('course/asaas-tier1')).body.data.sections[0];
      expect((await adm().post('course/asaas-tier1/lessons', { sectionId: s._id, title: 'x' })).status).toBe(400);
      expect((await adm().del('course/asaas-tier1')).status).toBe(400);
    });
  });

  describe('asking for a training', () => {
    it('is locked until the required training is certified', async () => {
      const t = (await explore(w.A.token)).explore.find((c: any) => c.key === key);
      expect(t).toMatchObject({ status: 'locked', lessons: 2 });
      expect(t.conditions).toEqual([expect.objectContaining({ label: 'Certified in Asaas Murabbi Training', done: false })]);
      expect((await mA().post(`trainings/${key}/request`)).status).toBe(403);
    });

    it('opens once the earlier training is certified; the request reaches the team', async () => {
      await adm().post('course/asaas-tier1/assign', { userIds: [w.A.id] });
      let t = (await explore(w.A.token));
      // Already enrolled in Asaas but not finished: still locked.
      expect(t.mine.find((m: any) => m.key === 'asaas-tier1').steps[0]).toMatchObject({ label: 'Listen to every lesson', done: false });
      const asaas = await ctx.db.collection('courses').findOne({ key: 'asaas-tier1' });
      await ctx.db.collection('courseassignments').updateOne({ course: asaas!._id, user: oid(w.A.id) }, { $set: { certifiedAt: new Date() } });
      t = await explore(w.A.token);
      expect(t.explore.find((c: any) => c.key === key).status).toBe('available');

      const r = await mA().post(`trainings/${key}/request`, { note: 'Ready for the next step' });
      expect(r.status).toBe(201);
      expect((await mA().post(`trainings/${key}/request`)).status).toBe(409);
      expect((await explore(w.A.token)).explore.find((c: any) => c.key === key).status).toBe('requested');
      await ctx.waitForEmail((e) => /Training request: Murabbi A/.test(e.subject));
      const reqs = (await adm().get('trainings/admin/requests')).body.data;
      expect(reqs[0]).toMatchObject({ note: 'Ready for the next step', status: 'pending' });
      expect(reqs[0].completed.map((c: any) => c.title)).toEqual(['Asaas Murabbi Training']);
      const cat = (await adm().get('trainings/admin/catalogue')).body.data.find((c: any) => c.key === key);
      expect(cat).toMatchObject({ pending: 1, enrolled: 0, lessons: 2, withAudio: 2, published: true });
    });

    it('a declined request tells them why; they can ask again', async () => {
      const id = (await adm().get('trainings/admin/requests')).body.data[0]._id;
      expect((await adm().post(`trainings/admin/requests/${id}/decline`, { reason: 'Finish your practical first' })).status).toBe(200);
      await ctx.waitForEmail((e) => e.to === 'a@e2e.test' && /About your request/.test(e.subject));
      const t = (await explore(w.A.token)).explore.find((c: any) => c.key === key);
      expect(t).toMatchObject({ status: 'available', declined: { reason: 'Finish your practical first' } });
      expect((await adm().post(`trainings/admin/requests/${id}/approve`)).status).toBe(400);
      expect((await mA().post(`trainings/${key}/request`)).status).toBe(201);
    });

    it('an approved request opens the training', async () => {
      const id = (await adm().get('trainings/admin/requests')).body.data[0]._id;
      const r = await adm().post(`trainings/admin/requests/${id}/approve`, { dueDate: '2099-01-31' });
      expect(r.status).toBe(200);
      await ctx.waitForEmail((e) => e.to === 'a@e2e.test' && /New training: Asaas Tier 2/.test(e.subject));
      const t = await explore(w.A.token);
      expect(t.explore.map((c: any) => c.key)).not.toContain(key);
      expect(t.mine.find((m: any) => m.key === key)).toMatchObject({ dueDate: '2099-01-31', lessonsTotal: 2, certifiedAt: null });
      const me = (await mA().get(`course/${key}/me`)).body.data;
      expect(me.course).toMatchObject({ hasAssessment: false, hasReflection: false });
    });
  });

  describe('finishing it', () => {
    const listen = async (l: { _id: string; durationSec: number }) => {
      await mA().post(`course/lessons/${l._id}/heartbeat`, { segments: [[0, 1]], position: 1 });
      await ctx.db.collection('lessonprogresses').updateOne({ lesson: oid(l._id), user: oid(w.A.id) }, { $set: { lastBeatAt: new Date(Date.now() - 120_000) } });
      return mA().post(`course/lessons/${l._id}/heartbeat`, { segments: [[0, l.durationSec]], position: l.durationSec });
    };

    it('with no assessment or reflection, hearing every lesson certifies them', async () => {
      for (const l of lessons) expect((await listen(l)).body.data.completed).toBe(true);
      const mine = (await explore(w.A.token)).mine.find((m: any) => m.key === key);
      expect(mine.certifiedAt).not.toBeNull();
      expect(mine.certificateNumber).toBeNull(); // a tier training issues the tier certificate instead
      const me = (await mA().get(`course/${key}/me`)).body.data;
      expect(me.certificate).toMatchObject({ tier: 2 });
    });

    it('a tier training waits for the admin to move them up', async () => {
      const ups = (await adm().get('trainings/admin/tier-upgrades')).body.data;
      expect(ups).toEqual([expect.objectContaining({ tier: 2, course: 'Asaas Tier 2', user: expect.objectContaining({ fullName: 'Murabbi A', tier: 1 }) })]);
      expect((await adm().post(`trainings/admin/tier-upgrades/${w.A.id}`, { tier: 3 })).status).toBe(400);
      expect((await adm().post(`trainings/admin/tier-upgrades/${w.A.id}`, { tier: 2 })).status).toBe(200);
      expect((await adm().get('trainings/admin/tier-upgrades')).body.data).toEqual([]);
      const u = await ctx.db.collection('users').findOne({ _id: oid(w.A.id) });
      expect(u!.tier).toBe(2);
    });

    it('a training in use can’t be deleted; an unused one can', async () => {
      expect((await adm().del(`course/${key}`)).status).toBe(400);
      const spare = (await adm().post('course', { title: 'Draft idea', audience: 'murabbi' })).body.data.course.key;
      expect((await adm().del(`course/${spare}`)).status).toBe(200);
    });
  });

  describe('parents', () => {
    it('see only parent trainings, locked until Asaas for Parents is finished', async () => {
      await ctx.http().post(`${API}/interest`).send({
        role: 'parent', firstName: 'Nadia', lastName: 'Ali', email: 'nadia@e2e.test', phone: '03005550001', city: 'Karachi', neighbourhood: 'Gulshan',
      });
      const iid = (await adm().get('interest')).body.data.find((i: any) => i.email === 'nadia@e2e.test')._id;
      const acc = await adm().post(`interest/${iid}/account`);
      parentId = acc.body.data.account.id;
      parentToken = (await ctx.http().post(`${API}/auth/signin`).send({ email: 'nadia@e2e.test', password: acc.body.data.credentials.password })).body.data.accessToken;

      const pk = (await adm().post('course', { title: 'Screen time at home', audience: 'parent' })).body.data.course.key;
      const sec = (await adm().post(`course/${pk}/sections`, { title: 'Part 1' })).body.data.section;
      const l = (await adm().post(`course/${pk}/lessons`, { sectionId: sec._id, title: 'Why it matters' })).body.data.lesson;
      await ctx.http().post(`${API}/course/lessons/${l._id}/audio`).set(bearer(w.admin)).attach('file', mp3(100), 'x.mp3');
      expect((await adm().patch(`course/${pk}/settings`, { published: true, prerequisites: [key] })).status).toBe(400); // a murabbi training
      await adm().patch(`course/${pk}/settings`, { published: true });

      const d = await explore(parentToken);
      expect(d.explore.map((c: any) => c.key)).toEqual([pk]);
      expect(d.mine.map((m: any) => m.key)).toEqual(['asaas-parents']);
      expect(d.mine[0].steps.map((s: any) => s.label)).toEqual([
        'Listen to every lesson', 'Pass the module checks', 'Pass the final check', 'Share your closing self-check', 'Certified',
      ]);
      expect(d.explore[0]).toMatchObject({ status: 'locked', conditions: [expect.objectContaining({ label: 'Finish Asaas for Parents' })] });
      expect((await explore(w.A.token)).explore.map((c: any) => c.key)).not.toContain(pk);
      expect((await as(parentToken).post(`trainings/${key}/request`)).status).toBe(404);

      // An admin can still give it directly.
      expect((await adm().post(`course/${pk}/assign`, { userIds: [parentId] })).status).toBe(201);
      expect((await adm().post(`course/${pk}/assign`, { userIds: [w.A.id] })).status).toBe(400);
      expect((await as(parentToken).get(`course/${pk}/me`)).status).toBe(200);
    });

    it('admin pages stay admin-only', async () => {
      expect((await as(parentToken).get('trainings/admin/requests')).status).toBe(403);
      expect((await mA().post('course', { title: 'x', audience: 'murabbi' })).status).toBe(403);
    });
  });
});
