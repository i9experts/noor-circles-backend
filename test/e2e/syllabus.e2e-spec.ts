import { API, bearer, createApp, E2EContext, MISSING_ID, seedWorld } from './helpers';
import { addDays, pkToday, weekdayOf } from '../../src/syllabus/schedule.util';

describe('Syllabus, Murabbi agenda, calendar and family links', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('syllabus');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const mA = () => as(w.A.token);
  const mB = () => as(w.B.token);

  const today = pkToday();
  const start = addDays(today, -21); // four meetings so far: -21, -14, -7 and today
  let track68: string;
  let track910: string;
  let s1: string;
  let s2: string;

  describe('tracks and sessions', () => {
    it('only admins can set up the default tracks', async () => {
      expect((await mA().post('syllabus/tracks/defaults')).status).toBe(403);
    });

    it('creates the three age-group tracks with 40 sessions each, once', async () => {
      const r = await adm().post('syllabus/tracks/defaults');
      expect(r.status).toBe(201);
      const tracks = r.body.data.tracks;
      expect(tracks.map((t: any) => t.ageGroup)).toEqual(['6-8', '9-10', '11-13']);
      expect(tracks.every((t: any) => t.sessionCount === 40)).toBe(true);
      track68 = tracks[0]._id;
      track910 = tracks[1]._id;
      const again = await adm().post('syllabus/tracks/defaults');
      expect(again.body.message).toMatch(/already exist/);
    });

    it('sessions come in order with all six parts and a home activity', async () => {
      const r = await mA().get(`syllabus/tracks/${track68}/sessions`);
      expect(r.status).toBe(200);
      const [first, second] = r.body.data.sessions;
      expect(first).toMatchObject({ number: 1, month: 1, title: 'Identity · Part 1' });
      expect(first.parts.map((p: any) => p.key)).toEqual(['welcome', 'quran', 'tarbiyah', 'activity', 'dhikr', 'closing']);
      expect(first.homeActivity).toMatch(/identity/);
      s1 = first._id;
      s2 = second._id;
    });

    it('admin edits a session; validation applies; murabbis cannot edit', async () => {
      const r = await adm().patch(`syllabus/sessions/${s1}`, {
        title: 'Who am I? My name and my faith',
        homeActivity: 'Ask your child the meaning of their name.',
        parts: [{ key: 'tarbiyah', title: 'The story of the names', details: 'Story of Adam (AS) and the names.' }],
      });
      expect(r.status).toBe(200);
      const tarbiyah = r.body.data.session.parts.find((p: any) => p.key === 'tarbiyah');
      expect(tarbiyah).toMatchObject({ title: 'The story of the names', minutes: 30 });
      expect(r.body.data.session.parts).toHaveLength(6);
      expect((await adm().patch(`syllabus/sessions/${s1}`, { month: 13 })).status).toBe(400);
      expect((await mA().patch(`syllabus/sessions/${s1}`, { title: 'x' })).status).toBe(403);
      // duplicate number within the track
      expect((await adm().post(`syllabus/tracks/${track68}/sessions`, { number: 2, month: 1, title: 'Dup' })).status).toBe(409);
    });
  });

  describe('circle schedule', () => {
    it('validates the track and schedule', async () => {
      expect((await adm().patch(`admin/circles/${w.circleA}`, { trackId: MISSING_ID })).status).toBe(404);
      expect((await adm().patch(`admin/circles/${w.circleA}`, { meetingTime: '7pm' })).status).toBe(400);
      expect((await adm().patch(`admin/circles/${w.circleA}`, { meetingDay: 9 })).status).toBe(400);
    });

    it('assigns a track, meeting day/time and start date', async () => {
      const r = await adm().patch(`admin/circles/${w.circleA}`, {
        trackId: track68, meetingDay: weekdayOf(start), meetingTime: '00:00', startDate: start,
      });
      expect(r.status).toBe(200);
      expect(r.body.data.circle).toMatchObject({ meetingDay: weekdayOf(start), meetingTime: '00:00', startDate: start });
    });
  });

  describe('weekly agenda and coverage', () => {
    it("shows each murabbi only their own circles, with this week's session", async () => {
      const a = await mA().get('syllabus/my-agenda');
      expect(a.status).toBe(200);
      expect(a.body.data).toHaveLength(1);
      const item = a.body.data[0];
      expect(item.circle._id).toBe(w.circleA);
      expect(item.session).toMatchObject({ number: 1, theme: 'Identity' });
      expect(item.students.map((s: any) => s._id)).toContain(w.studentA);
      expect(item.progress).toMatchObject({ covered: 0, total: 40, expected: 4, status: 'behind' });
      const b = await mB().get('syllabus/my-agenda');
      expect(b.body.data[0].progress.status).toBe('no-track');
    });

    it('rejects coverage for another circle, another track or a future date', async () => {
      const base = { circleId: w.circleA, sessionId: s1, partsDone: ['welcome'] };
      expect((await mB().post('syllabus/coverage', base)).status).toBe(403);
      const other = (await adm().get(`syllabus/tracks/${track910}/sessions`)).body.data.sessions[0]._id;
      expect((await mA().post('syllabus/coverage', { ...base, sessionId: other })).status).toBe(400);
      expect((await mA().post('syllabus/coverage', { ...base, date: addDays(today, 3) })).status).toBe(400);
      expect((await mA().post('syllabus/coverage', { ...base, partsDone: ['nap'] })).status).toBe(400);
    });

    it('a partial session stays on the agenda; completing it moves to the next', async () => {
      const partial = await mA().post('syllabus/coverage', {
        circleId: w.circleA, sessionId: s1, partsDone: ['welcome', 'quran', 'tarbiyah'], date: addDays(today, -7),
      });
      expect(partial.status).toBe(201);
      expect(partial.body.data.coverage.completed).toBe(false);
      let agenda = (await mA().get('syllabus/my-agenda')).body.data[0];
      expect(agenda.session.number).toBe(1);
      expect(agenda.coverage.parts.filter((p: any) => p.done)).toHaveLength(3);
      expect(agenda.progress.partial).toBe(1);

      const done = await mA().post('syllabus/coverage', {
        circleId: w.circleA, sessionId: s1, notes: 'Lovely discussion',
        partsDone: ['welcome', 'quran', 'tarbiyah', 'activity', 'dhikr', 'closing'], date: addDays(today, -7),
      });
      expect(done.body.data.coverage.completed).toBe(true);
      agenda = (await mA().get('syllabus/my-agenda')).body.data[0];
      expect(agenda.session.number).toBe(2);
      expect(agenda.progress).toMatchObject({ covered: 1, partial: 0 });
      expect(agenda.recent[0].session.number).toBe(1);
    });

    it('a covered session can no longer be renumbered or deleted', async () => {
      expect((await adm().patch(`syllabus/sessions/${s1}`, { number: 99 })).status).toBe(400);
      expect((await adm().del(`syllabus/sessions/${s1}`)).status).toBe(400);
    });

    it('notes to families: the circle murabbi only', async () => {
      expect((await mB().post('syllabus/notes', { studentId: w.studentA, note: 'Hi' })).status).toBe(403);
      const r = await mA().post('syllabus/notes', { studentId: w.studentA, note: 'Recited Al-Fatiha beautifully today!', sessionId: s1 });
      expect(r.status).toBe(201);
      expect((await mA().get(`syllabus/notes/student/${w.studentA}`)).body.data).toHaveLength(1);
      expect((await mB().get(`syllabus/notes/student/${w.studentA}`)).status).toBe(403);
    });
  });

  describe('progress and calendar', () => {
    it('admin sees every circle with covered vs remaining', async () => {
      expect((await mA().get('syllabus/progress')).status).toBe(403);
      const r = await adm().get('syllabus/progress');
      const a = r.body.data.circles.find((c: any) => c.circle._id === w.circleA);
      expect(a.progress).toMatchObject({ covered: 1, total: 40, expected: 4, behindBy: 3, status: 'behind' });
      expect(a.progress.current.number).toBe(2);
      expect(r.body.data.stats).toMatchObject({ behind: 1, noTrack: 1 });
    });

    it('circle detail lists each session as covered / remaining', async () => {
      const r = await mA().get(`syllabus/progress/${w.circleA}`);
      expect(r.body.data.sessions[0]).toMatchObject({ number: 1, state: 'covered' });
      expect(r.body.data.sessions[1].state).toBe('remaining');
      expect((await mB().get(`syllabus/progress/${w.circleA}`)).status).toBe(403);
    });

    it('a holiday that cancels a meeting lowers the expected count', async () => {
      const ev = await adm().post('syllabus/events', { title: 'Eid break', type: 'holiday', startDate: addDays(start, 7) });
      expect(ev.status).toBe(201);
      expect(ev.body.data.event.cancelsSessions).toBe(true);
      const a = (await adm().get('syllabus/progress')).body.data.circles.find((c: any) => c.circle._id === w.circleA);
      expect(a.progress.expected).toBe(3);
      expect((await adm().post('syllabus/events', { title: 'Bad', type: 'event', startDate: today, endDate: addDays(today, -1) })).status).toBe(400);
    });

    it('calendar shows upcoming meetings with their session, plus events', async () => {
      await adm().post('syllabus/events', { title: 'Parent evening', type: 'parent_evening', startDate: addDays(today, 10) });
      const r = await mA().get(`syllabus/calendar?from=${addDays(today, 1)}&to=${addDays(today, 21)}`);
      expect(r.status).toBe(200);
      const sessions = r.body.data.items.filter((i: any) => i.type === 'session');
      expect(sessions[0]).toMatchObject({ circleId: w.circleA, sessionNumber: 2 });
      expect(sessions[1].sessionNumber).toBe(3);
      expect(r.body.data.items.some((i: any) => i.type === 'parent_evening')).toBe(true);
    });
  });

  describe('family link', () => {
    let parentId: string;
    let url: string;
    const token = (u: string) => u.split('/family/')[1];
    const pub = (t: string) => ctx.http().get(`${API}/family/${t}`);

    beforeAll(async () => {
      await mA().post('attendance', {
        circle: w.circleA, sessionNumber: 1, sessionDate: `${addDays(today, -7)}T12:00:00.000Z`,
        records: [{ student: w.studentA, status: 'present' }],
      });
      await mA().post('incentives', { studentId: w.studentA, awardType: 'noor-star' });
      const p = await adm().post('parents', { fullName: 'Hira Ahmed', phone: '03001112233', studentIds: [w.studentA] });
      parentId = p.body.data.parent?._id ?? p.body.data._id;
    });

    it('admins get the link; murabbis cannot', async () => {
      expect((await mA().get(`parents/${parentId}/family-link`)).status).toBe(403);
      const r = await adm().get(`parents/${parentId}/family-link`);
      expect(r.status).toBe(200);
      url = r.body.data.url;
      expect(url).toMatch(/\/family\/[a-f\d]{24}\.1\.[\w-]{32}$/);
    });

    it("the public page shows the child's progress, this week, notes and calendar", async () => {
      const r = await pub(token(url));
      expect(r.status).toBe(200);
      const d = r.body.data;
      expect(d.family.name).toBe('Hira Ahmed');
      expect(d.children).toHaveLength(1);
      const c = d.children[0];
      expect(c.fullName).toBe('Student A');
      expect(c.attendance).toMatchObject({ present: 1, total: 1, rate: 100 });
      expect(c.points.total).toBe(50);
      expect(c.points.recent[0].award).toBe('Noor Star');
      expect(c.thisWeek).toMatchObject({ number: 1, title: 'Who am I? My name and my faith', homeActivity: 'Ask your child the meaning of their name.' });
      expect(c.next).toMatchObject({ number: 2, theme: 'Identity' });
      expect(c.progress).toEqual({ covered: 1, total: 40 });
      expect(c.notes[0].note).toMatch(/Al-Fatiha/);
      expect(c.circle.murabbi).not.toMatch(/\s/); // first name only
      expect(d.calendar.some((i: any) => i.type === 'session')).toBe(true);
      // nothing private leaks
      expect(JSON.stringify(d)).not.toMatch(/03001112233|password|email/);
    });

    it('tampered or rotated links stop working', async () => {
      const t = token(url);
      expect((await pub(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'))).status).toBe(404);
      expect((await pub('garbage')).status).toBe(404);
      const rot = await adm().post(`parents/${parentId}/family-link/rotate`);
      expect(rot.status).toBe(201);
      expect((await pub(t)).status).toBe(404);
      expect((await pub(token(rot.body.data.url))).status).toBe(200);
    });
  });
});
