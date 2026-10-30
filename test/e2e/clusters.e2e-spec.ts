import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';
import { Types } from 'mongoose';

describe('Clusters and cluster supervisors', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let otherNbh: string;
  let otherCircle: string;
  let clusterId: string;
  let sup: { id: string; email: string; password: string; token: string };

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const me = () => as(sup.token);
  const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    ctx = await createApp('clusters');
    w = await seedWorld(ctx);
    // A second neighbourhood (outside the cluster) with its own circle.
    const n = await adm().post('admin/neighbourhoods', { name: 'Clifton', city: 'Karachi' });
    otherNbh = n.body.data.neighbourhood._id;
    const c = await adm().post('admin/circles', { name: 'Clifton Circle', neighbourhoodId: otherNbh, murabbiId: w.B.id });
    otherCircle = c.body.data.circle._id;
  });
  afterAll(async () => ctx.close());

  describe('admin', () => {
    it('creates a cluster from neighbourhoods', async () => {
      const r = await adm().post('clusters', { name: 'Gulshan Cluster', city: 'Karachi', neighbourhoodIds: [w.nbhId] });
      expect(r.status).toBe(201);
      clusterId = r.body.data.cluster._id;
    });

    it('refuses a neighbourhood that is already in another cluster', async () => {
      const r = await adm().post('clusters', { name: 'Overlap', neighbourhoodIds: [w.nbhId] });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/already in the cluster “Gulshan Cluster”/);
    });

    it('refuses a murabbi as a supervisor', async () => {
      const r = await adm().patch(`clusters/${clusterId}`, { supervisorIds: [w.A.id] });
      expect(r.status).toBe(400);
    });

    it('creates a supervisor account in the cluster and welcomes them', async () => {
      const r = await adm().post('clusters/supervisors', { fullName: 'Ayesha Siddiqui', email: 'Ayesha@E2E.test', clusterIds: [clusterId] });
      expect(r.status).toBe(201);
      expect(r.body.data.account).toMatchObject({ role: 'supervisor', email: 'ayesha@e2e.test' });
      const mail = await ctx.waitForEmail((e) => e.to === 'ayesha@e2e.test');
      expect(mail.text).toMatch(/cluster supervisor account is ready/);
      const s = await ctx.http().post(`${API}/auth/signin`).send({ email: 'ayesha@e2e.test', password: r.body.data.credentials.password });
      expect(s.status).toBe(200);
      sup = { id: r.body.data.account.id, email: 'ayesha@e2e.test', password: r.body.data.credentials.password, token: s.body.data.accessToken };
    });

    it('lists clusters with their numbers, supervisors and unassigned neighbourhoods', async () => {
      const r = await adm().get('clusters');
      expect(r.status).toBe(200);
      const c = r.body.data.clusters.find((x: any) => x._id === clusterId);
      expect(c.stats).toMatchObject({ circles: 2, murabbis: 2, students: 2 });
      expect(c.supervisors.map((s: any) => s.fullName)).toEqual(['Ayesha Siddiqui']);
      expect(r.body.data.unassigned.map((n: any) => n._id)).toEqual([otherNbh]);
      expect(r.body.data.supervisors[0].clusters.map((x: any) => x.name)).toEqual(['Gulshan Cluster']);
    });

    it('can reset a supervisor’s password', async () => {
      const r = await adm().post(`accounts/${sup.id}/reset-password`);
      expect(r.status).toBe(200);
      const s = await ctx.http().post(`${API}/auth/signin`).send({ email: sup.email, password: r.body.data.credentials.password });
      sup.token = s.body.data.accessToken;
    });
  });

  describe('supervisor scope', () => {
    it('is kept out of admin routes', async () => {
      expect((await me().get('admin/circles')).status).toBe(403);
      expect((await me().get('clusters')).status).toBe(403);
      expect((await as(w.A.token).get('supervisor/dashboard')).status).toBe(403);
    });

    it('sees only their cluster on the dashboard, with alerts', async () => {
      const r = await me().get('supervisor/dashboard');
      expect(r.status).toBe(200);
      const names = r.body.data.circles.map((c: any) => c.name).sort();
      expect(names).toEqual(['Circle A', 'Circle B']);
      expect(r.body.data.totals).toMatchObject({ circles: 2, students: 2, murabbis: 2 });
      const kinds = r.body.data.alerts.map((a: any) => a.kind);
      expect(kinds).toEqual(expect.arrayContaining(['no-session', 'not-visited', 'not-certified']));
    });

    it('can’t open a cluster that isn’t theirs', async () => {
      const other = await adm().post('clusters', { name: 'Clifton Cluster', neighbourhoodIds: [otherNbh] });
      const r = await me().get(`supervisor/dashboard?clusterId=${other.body.data.cluster._id}`);
      expect(r.status).toBe(403);
    });

    it('creates and edits circles only in their neighbourhoods', async () => {
      const ok = await me().post('supervisor/circles', { name: 'Circle C', neighbourhoodId: w.nbhId, murabbiId: w.A.id, meetingDay: 6, meetingTime: '16:00' });
      expect(ok.status).toBe(201);
      const bad = await me().post('supervisor/circles', { name: 'Sneaky', neighbourhoodId: otherNbh, murabbiId: w.A.id });
      expect(bad.status).toBe(403);
      expect((await me().patch(`supervisor/circles/${w.circleA}`, { capacity: 20 })).status).toBe(200);
      expect((await me().patch(`supervisor/circles/${otherCircle}`, { capacity: 20 })).status).toBe(403);
      expect((await me().patch(`supervisor/circles/${w.circleA}`, { neighbourhoodId: otherNbh })).status).toBe(403);
    });

    it('enrols, edits, moves and deactivates children in the cluster only', async () => {
      const e = await me().post('supervisor/students', { fullName: 'Zara', fatherName: 'Imran', phone: '03001112222', circleId: w.circleA, neighbourhoodId: otherNbh });
      expect(e.status).toBe(201);
      // The neighbourhood always follows the circle.
      expect(e.body.data.student.neighbourhood).toBe(w.nbhId);
      const id = e.body.data.student._id;
      expect((await me().patch(`supervisor/students/${id}`, { fatherName: 'Imran Ali' })).status).toBe(200);
      expect((await me().patch(`supervisor/students/${id}/circle`, { circleId: w.circleB })).status).toBe(200);
      expect((await me().patch(`supervisor/students/${id}/circle`, { circleId: otherCircle })).status).toBe(403);
      expect((await me().patch(`supervisor/students/${id}/active`, { active: false })).status).toBe(200);
      expect((await me().post('supervisor/students', { fullName: 'X', fatherName: 'Y', phone: '03001112222', circleId: otherCircle, neighbourhoodId: otherNbh })).status).toBe(403);

      const outside = await adm().post('admin/students/enroll', { fullName: 'Out', fatherName: 'Side', phone: '03001112222', circleId: otherCircle, neighbourhoodId: otherNbh });
      expect((await me().patch(`supervisor/students/${outside.body.data.student._id}`, { fatherName: 'Hack' })).status).toBe(403);

      const list = await me().get('supervisor/students');
      expect(list.body.data.students.some((s: any) => s.fullName === 'Out')).toBe(false);
    });

    it('lists the murabbis of their circles', async () => {
      const r = await me().get('supervisor/murabbis');
      expect(r.body.data.murabbis.map((m: any) => m.fullName).sort()).toEqual(['Murabbi A', 'Murabbi B']);
      expect(r.body.data.murabbis[0].training).toBe('not-assigned');
    });

    it('sees website interest from their neighbourhoods, without the family profile', async () => {
      const mk = (email: string, neighbourhood: string) => ctx.http().post(`${API}/interest`).send({
        role: 'parent', firstName: 'Hina', lastName: 'Raza', email, phone: '03004445555', city: 'Karachi', neighbourhood,
      });
      await mk('hina@e2e.test', 'gulshan block 13');
      await mk('far@e2e.test', 'Clifton');
      // Same neighbourhood name, different city.
      await ctx.http().post(`${API}/interest`).send({
        role: 'parent', firstName: 'Omar', lastName: 'Raza', email: 'lahore@e2e.test', phone: '03004445556', city: 'Lahore', neighbourhood: 'Gulshan',
      });
      await ctx.db.collection('interests').updateOne({ email: 'hina@e2e.test' }, { $set: { profile: { secret: 'family answers' } } });
      const r = await me().get('supervisor/interest');
      expect(r.body.data.requests.map((x: any) => x.email)).toEqual(['hina@e2e.test']);
      expect(r.body.data.requests[0].profile).toBeUndefined();

      const farId = (await ctx.db.collection('interests').findOne({ email: 'far@e2e.test' }))!._id.toString();
      expect((await me().patch(`supervisor/interest/${farId}`, { status: 'contacted' })).status).toBe(403);
      expect((await me().post(`supervisor/interest/${farId}/account`)).status).toBe(403);

      const id = r.body.data.requests[0]._id;
      const up = await me().patch(`supervisor/interest/${id}`, { status: 'contacted', notes: 'Called on Tuesday' });
      expect(up.status).toBe(200);
      expect(up.body.data.interest.profile).toBeUndefined();
      const acc = await me().post(`supervisor/interest/${id}/account`);
      expect(acc.status).toBe(201);
      expect(acc.body.data.account.role).toBe('parent');
    });

    it('keeps Parent Insights and parents’ course progress closed', async () => {
      expect((await me().get('insights/parents')).status).toBe(403);
      expect((await me().get('parent-course/admin/progress')).status).toBe(403);
    });

    it('adds calendar events only for their own circles', async () => {
      const none = await me().post('supervisor/events', { title: 'Picnic', type: 'event', startDate: '2026-12-01' });
      expect(none.status).toBe(400);
      const bad = await me().post('supervisor/events', { title: 'Picnic', type: 'event', startDate: '2026-12-01', circleIds: [otherCircle] });
      expect(bad.status).toBe(403);
      const ok = await me().post('supervisor/events', { title: 'Parents evening', type: 'parent_evening', startDate: '2099-12-01', circleIds: [w.circleA] });
      expect(ok.status).toBe(201);
      const id = ok.body.data.event._id;
      const cal = await me().get('supervisor/calendar?from=2099-11-01&to=2099-12-31');
      expect(cal.body.data.events.map((e: any) => e._id)).toContain(id);
      expect((await me().patch(`supervisor/events/${id}`, { circleIds: [otherCircle] })).status).toBe(403);

      const global = await adm().post('syllabus/events', { title: 'Eid', type: 'holiday', startDate: '2099-12-10' });
      expect((await me().del(`supervisor/events/${global.body.data.event._id}`)).status).toBe(403);
      expect((await me().del(`supervisor/events/${id}`)).status).toBe(200);
    });
  });

  describe('visits', () => {
    let visitId: string;

    it('logs a visit with the checklist; unknown items and other circles are refused', async () => {
      const body = {
        circleId: w.circleA, date: today(), childrenPresent: 9, overall: 'good',
        checklist: [{ key: 'welcome', score: 2 }, { key: 'quran', score: 1, note: 'Tajweed needs work' }],
        highlights: 'Lovely dhikr', followUps: ['Share the Quran flip chart', ''],
      };
      expect((await me().post('supervisor/visits', { ...body, circleId: otherCircle })).status).toBe(403);
      expect((await me().post('supervisor/visits', { ...body, checklist: [{ key: 'nope', score: 1 }] })).status).toBe(400);
      expect((await me().post('supervisor/visits', { ...body, date: '2099-01-01' })).status).toBe(400);
      const r = await me().post('supervisor/visits', body);
      expect(r.status).toBe(201);
      visitId = r.body.data.visit._id;
      expect(r.body.data.visit.checklist).toHaveLength(13);
      expect(r.body.data.visit.checklist.find((x: any) => x.key === 'setting').score).toBeNull();
      expect(r.body.data.visit.followUps).toHaveLength(1);
    });

    it('shows on the dashboard and in the admin view', async () => {
      const d = await me().get('supervisor/dashboard');
      const a = d.body.data.circles.find((c: any) => c._id === w.circleA);
      expect(a.lastVisit).toMatchObject({ last: today(), overall: 'good' });
      expect(a.openFollowUps).toBe(1);
      expect(d.body.data.totals.visits30).toBe(1);
      const adminList = await adm().get(`clusters/visits?clusterId=${clusterId}`);
      expect(adminList.body.data.visits[0].supervisor.fullName).toBe('Ayesha Siddiqui');
    });

    it('ticks off a follow-up', async () => {
      const v = (await me().get('supervisor/visits')).body.data.visits[0];
      const r = await me().patch(`supervisor/visits/${visitId}/follow-ups/${v.followUps[0]._id}`, { done: true });
      expect(r.status).toBe(200);
      expect(r.body.data.visit.followUps[0].done).toBe(true);
    });

    it('a safeguarding concern alerts the admins at once', async () => {
      const r = await me().post('supervisor/visits', {
        circleId: w.circleB, date: today(), overall: 'urgent', checklist: [], safeguarding: true, concerns: 'Only one adult present',
      });
      expect(r.status).toBe(201);
      expect(r.body.message).toMatch(/alerted/);
      const mail = await ctx.waitForEmail((e) => /Safeguarding concern/.test(e.subject));
      expect(mail.text).toMatch(/Only one adult present/);
      const notes = await adm().get('notifications');
      expect(JSON.stringify(notes.body.data)).toMatch(/raised a safeguarding concern/);
      const d = await me().get('supervisor/dashboard');
      expect(d.body.data.alerts[0]).toMatchObject({ level: 'red', kind: 'safeguarding', circleName: 'Circle B' });
    });
  });

  describe('messages', () => {
    it('counts and sends to parents of the cluster only', async () => {
      await ctx.db.collection('parents').insertOne({ fullName: 'Parent A', phone: '0300', email: 'pa@e2e.test', students: [new Types.ObjectId(w.studentA)], createdAt: new Date(), updatedAt: new Date() });
      const a = await me().post('supervisor/messages/audience', { clusterId, to: 'parents' });
      expect(a.status).toBe(200);
      expect(a.body.data.count).toBe(1);
      const m = await me().post('supervisor/messages/audience', { clusterId, to: 'murabbis' });
      expect(m.body.data.count).toBe(2);
      const s = await me().post('supervisor/messages', { clusterId, to: 'parents', subject: 'Parents evening', body: 'See you on Saturday.' });
      expect(s.status).toBe(201);
      await ctx.waitForEmail((e) => e.to === 'pa@e2e.test' && /Parents evening/.test(e.subject));
      expect((await me().get('supervisor/messages')).body.data.messages).toHaveLength(1);
    });

    it('can’t message another cluster', async () => {
      const list = await adm().get('clusters');
      const other = list.body.data.clusters.find((c: any) => c.name === 'Clifton Cluster')._id;
      expect((await me().post('supervisor/messages', { clusterId: other, to: 'parents', subject: 'x', body: 'y' })).status).toBe(403);
    });
  });

  it('admin deletes a cluster with its visit reports', async () => {
    const r = await adm().del(`clusters/${clusterId}`);
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/2 visit reports/);
    expect((await me().get('supervisor/dashboard')).body.data.circles).toHaveLength(0);
  });
});
