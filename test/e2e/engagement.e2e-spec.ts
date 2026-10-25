import { Types } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import {
  API,
  BAD_ID,
  bearer,
  createApp,
  E2EContext,
  MISSING_ID,
  seedWorld,
} from './helpers';

/** Parents (+WhatsApp engagement), incentives, performance reviews, reports, sessions. */
describe('Parents / Incentives / Performance / Reports / Sessions', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('engagement');
    w = await seedWorld(ctx);
    // one attendance session per circle so reports have data
    for (const [tok, circle, student] of [
      [w.A.token, w.circleA, w.studentA],
      [w.B.token, w.circleB, w.studentB],
    ]) {
      await ctx
        .http()
        .post(`${API}/attendance`)
        .set(bearer(tok))
        .send({
          circle,
          sessionNumber: 1,
          sessionDate: '2026-04-01T10:00:00Z',
          records: [{ student, status: 'present' }],
        });
    }
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) =>
      ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) =>
      ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const mA = () => as(w.A.token);
  const mB = () => as(w.B.token);

  // ── Parents ─────────────────────────────────────────────────────────────────
  describe('parents', () => {
    let parentA: string;
    let parentB: string;

    it("murabbi registers a parent for own student; not for others'", async () => {
      const r = await mA().post('parents', {
        fullName: 'Parent A',
        phone: '03001231234',
        whatsappNumber: '03001231234',
        studentIds: [w.studentA],
      });
      expect(r.status).toBe(201);
      parentA = r.body.data.parent._id;
      expect(
        (
          await mA().post('parents', {
            fullName: 'X',
            phone: '03001231234',
            studentIds: [w.studentB],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await mA().post('parents', {
            fullName: 'X',
            phone: '03001231234',
            studentIds: [MISSING_ID],
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await mA().post('parents', {
            fullName: 'X',
            phone: '03001231234',
            studentIds: [],
          })
        ).status,
      ).toBe(400);
    });

    it('admin registers a parent for any student', async () => {
      const r = await adm().post('parents', {
        fullName: 'Parent B',
        phone: '03009998888',
        email: 'pb@e2e.test',
        studentIds: [w.studentB],
      });
      expect(r.status).toBe(201);
      parentB = r.body.data.parent._id;
    });

    it("list / get / update / feedback are scoped to the murabbi's students", async () => {
      const list = await mA().get('parents');
      expect(list.body.data.map((p: any) => p._id)).toEqual([parentA]);
      expect((await mA().get(`parents/${parentB}`)).status).toBe(404);
      expect(
        (await mA().patch(`parents/${parentB}`, { notes: 'x' })).status,
      ).toBe(404);
      expect(
        (
          await mA().post(`parents/${parentB}/feedback`, {
            message: 'Great',
            stars: 5,
            sessionNumber: 1,
          })
        ).status,
      ).toBe(404);
      expect(
        (await mA().patch(`parents/${parentA}`, { notes: 'Prefers calls' }))
          .status,
      ).toBe(200);
      expect(
        (
          await mA().post(`parents/${parentA}/feedback`, {
            message: 'Great session',
            stars: 5,
            sessionNumber: 1,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await mA().post(`parents/${parentA}/feedback`, {
            message: 'x',
            stars: 9,
            sessionNumber: 1,
          })
        ).status,
      ).toBe(400);
    });

    // BUG-32 (high, privacy): /parents/page-data is open to murabbis but is
    // NOT scoped. Any murabbi gets every parent in the system — names, phone
    // and WhatsApp numbers, emails, their children's names and all feedback —
    // bypassing the scoping that GET /parents enforces.
    // BUG-32 (fixed): page-data and stats return system-wide data and are now admin-only.
    it('BUG-32: /parents/page-data and /parents/stats are admin-only', async () => {
      expect((await mA().get('parents/page-data')).status).toBe(403);
      expect((await mA().get('parents/stats')).status).toBe(403);
      const ids = (await mA().get('parents')).body.data.map((p: any) => p._id);
      expect(ids).not.toContain(parentB);
    });

    // BUG-01 + BUG-32 chained (fixed): a stranger can no longer get a session
    // at all, and even an approved murabbi can't reach other parents' data.
    it("BUG-01+32: a self-registered stranger gets no session and can't read parents' data", async () => {
      const email = 'stranger.chain@e2e.test';
      await ctx
        .http()
        .post(`${API}/auth/signup/request-otp`)
        .send({ fullName: 'Stranger', email, password: 'Password123' });
      const v = await ctx
        .http()
        .post(`${API}/auth/signup/verify-otp`)
        .send({ email, otp: ctx.lastOtp(email) });
      expect(v.body.data.accessToken).toBeUndefined();
      const login = await ctx
        .http()
        .post(`${API}/auth/signin`)
        .send({ email, password: 'Password123' });
      expect(login.status).toBe(401);
      const r = await ctx.http().get(`${API}/parents/page-data`);
      expect(r.status).toBe(401);
    });

    it('admin-only parent operations', async () => {
      expect((await mA().del(`parents/${parentA}`)).status).toBe(403);
      expect((await mA().get('parents/engagement')).status).toBe(403);
      expect(
        (await mA().post('parents/engagement/send-whatsapp', {})).status,
      ).toBe(403);
    });

    it('engagement config toggles', async () => {
      expect((await adm().get('parents/engagement')).status).toBe(200);
      expect(
        (await adm().patch('parents/engagement/weekly-card', { active: false }))
          .body.data.config.weeklyCardActive,
      ).toBe(false);
      expect(
        (await adm().patch('parents/engagement/whatsapp', { enabled: false }))
          .body.data.config.whatsappEnabled,
      ).toBe(false);
      expect(
        (await adm().post('parents/engagement/schedule-evening', { month: 13 }))
          .status,
      ).toBe(400);
      expect(
        (await adm().post('parents/engagement/schedule-evening', { month: 5 }))
          .body.data.config.scheduledEveningMonth,
      ).toBe(5);
      const held = await adm().post('parents/engagement/record-evening');
      expect(held.body.data.config).toMatchObject({
        parentEveningsHeld: 1,
        scheduledEveningMonth: null,
      });
    });

    // BUG-33: the toggle endpoints take a raw @Body('field') with no
    // validation. A missing/garbage value returns "disabled" but changes
    // nothing (or casts silently).
    it.failing(
      'BUG-33: weekly-card toggle without a boolean should be 400',
      async () => {
        expect(
          (await adm().patch('parents/engagement/weekly-card', {})).status,
        ).toBe(400);
      },
    );

    // BUG-34: "WhatsApp Updates" can be switched off in engagement settings,
    // but send-whatsapp ignores the flag and messages every parent anyway.
    it(
      'BUG-34: send-whatsapp must respect whatsappEnabled=false',
      async () => {
        await adm().patch('parents/engagement/whatsapp', { enabled: false });
        const r = await adm().post('parents/engagement/send-whatsapp', {
          message: 'hello',
        });
        expect(r.status).toBeGreaterThanOrEqual(400);
      },
    );

    it('send-whatsapp without Green API config is a logged dry-run', async () => {
      await adm().patch('parents/engagement/whatsapp', { enabled: true });
      const r = await adm().post('parents/engagement/send-whatsapp', {
        message: 'Session update',
      });
      expect(r.status).toBe(201);
      expect(r.body.data.sentCount).toBe(2);
      expect(r.body.message).toMatch(/Dev mode/);
    });

    it('test-whatsapp reports not-configured', async () => {
      const r = await adm().get('parents/engagement/test-whatsapp');
      expect(r.body.data.configured).toBe(false);
    });

    const sse = (q: string) =>
      ctx
        .http()
        .get(`${API}/parents/engagement/whatsapp-stream${q}`)
        .buffer(true)
        .parse((res, cb) => {
          let d = '';
          res.on('data', (c: Buffer) => (d += c.toString()));
          res.on('end', () => cb(null, d));
        });
    const sseEvents = (raw: string) =>
      raw
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => JSON.parse(l.slice(6)));

    it('SSE stream: missing/invalid/murabbi tokens get an error event and no send starts', async () => {
      for (const q of ['', '?token=garbage', `?token=${w.A.token}`]) {
        const r = await sse(q);
        expect(r.body).toMatch(/event: error/);
        expect(r.body).not.toMatch(/start/);
      }
    });

    // BUG-43 (high): the global ResponseInterceptor also wraps every SSE
    // MessageEvent, so the browser receives data = {"data":"{\"type\":...}"}
    // instead of {"type":...}. ParentsPage.tsx parses it and checks
    // data.type — which is always undefined — so the WhatsApp broadcast UI
    // never shows progress or completion even though messages are being sent.
    it(
      'BUG-43: SSE events must arrive as {type: ...} (not double-wrapped)',
      async () => {
        const r = await sse(`?token=${w.admin}&message=hi`);
        const first = sseEvents(r.body as unknown as string)[0];
        expect(first.type).toBe('start');
      },
    );

    it('SSE ticket: issued to admins only, works once, and carries the message', async () => {
      expect((await mA().post('parents/engagement/whatsapp-ticket', { message: 'x' })).status).toBe(403);
      const t = await adm().post('parents/engagement/whatsapp-ticket', { message: 'From the ticket' });
      expect(t.status).toBe(201);
      const ticket = t.body.data.ticket as string;
      const first = sseEvents((await sse(`?ticket=${ticket}`)).body as unknown as string)[0];
      expect(first).toMatchObject({ type: 'start', message: 'From the ticket' });
      const again = await sse(`?ticket=${ticket}`);
      expect(again.body).toMatch(/event: error/);
      expect(again.body).not.toMatch(/start/);
    });

    // BUG-35: the SSE endpoint verifies the JWT signature + role claim only;
    // it never loads the user, so a deleted/deactivated admin's unexpired
    // token can still start a mass WhatsApp send to every parent.
    it(
      'BUG-35: a token for a non-existent/deactivated admin must not start a WhatsApp blast',
      async () => {
        const ghostAdmin = jwt.sign(
          { sub: MISSING_ID, email: 'gone@e2e.test', role: 'admin' },
          process.env.JWT_ACCESS_SECRET,
          { expiresIn: '5m' },
        );
        const r = await sse(`?token=${ghostAdmin}`);
        expect(r.body).not.toMatch(/start/);
      },
    );

    it('stats / page-data shape', async () => {
      const s = await adm().get('parents/stats');
      expect(s.body.data).toMatchObject({
        totalParents: 2,
        totalStudents: 2,
        totalFeedbackCount: 1,
      });
      const pd = await adm().get('parents/page-data');
      expect(pd.body.data.stats.totalParents).toBe(2);
      expect(pd.body.data.recentFeedback).toHaveLength(1);
    });

    it('admin deletes a parent', async () => {
      expect((await adm().del(`parents/${parentB}`)).status).toBe(200);
      expect((await adm().get(`parents/${parentB}`)).status).toBe(404);
      expect((await adm().get(`parents/${BAD_ID}`)).status).toBe(400);
    });
  });

  // ── Incentives ──────────────────────────────────────────────────────────────
  describe('incentives', () => {
    it('murabbi awards points to own student; validation', async () => {
      const r = await mA().post('incentives', {
        studentId: w.studentA,
        awardType: 'noor-star',
        note: 'Helped a friend',
      });
      expect(r.status).toBe(201);
      expect(r.body.data.incentive.points).toBe(50);
      expect(
        (
          await mA().post('incentives', {
            studentId: w.studentA,
            awardType: 'gold-star',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await mA().post('incentives', {
            studentId: w.studentA,
            awardType: 'noor-star',
            points: 9999,
          })
        ).status,
      ).toBe(400);
    });

    it("murabbi cannot award or view other murabbis' students", async () => {
      const r = await mA().post('incentives', {
        studentId: w.studentB,
        awardType: 'noor-star',
      });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(
        (await mA().get(`incentives/student/${w.studentB}`)).status,
      ).toBeGreaterThanOrEqual(400);
    });

    // BUG-36: ownership failures return 400 "Bad Request" here, whereas the
    // same check in attendance returns 403. Clients can't tell validation
    // errors from permission errors.
    it.failing(
      "BUG-36: awarding to another murabbi's student should be 403, consistent with attendance",
      async () => {
        const r = await mA().post('incentives', {
          studentId: w.studentB,
          awardType: 'noor-star',
        });
        expect(r.status).toBe(403);
      },
    );

    it('admin awards to anyone; leaderboard + page-data + getAll', async () => {
      expect(
        (
          await adm().post('incentives', {
            studentId: w.studentB,
            awardType: 'circle-champion',
          })
        ).status,
      ).toBe(201);
      const lb = await mA().get('incentives/leaderboard');
      expect(lb.body.data[0]).toMatchObject({
        fullName: 'Student B',
        noorPoints: 100,
      });
      const pd = await mA().get('incentives/page-data');
      expect(pd.body.data.totalPointsAwarded).toBe(150);
      expect((await mA().get('incentives')).status).toBe(403);
      expect((await adm().get('incentives')).body.data).toHaveLength(2);
      expect(
        (await mA().get(`incentives/student/${w.studentA}`)).body.data
          .totalPoints,
      ).toBe(50);
    });

    // BUG-37: points can be awarded to a deactivated student.
    it.failing(
      'BUG-37: awarding points to an inactive student should be rejected',
      async () => {
        const s = await w.mkStudent('Inactive Kid', w.circleA);
        await adm().patch(`admin/students/${s}/deactivate`);
        const r = await mA().post('incentives', {
          studentId: s,
          awardType: 'noor-star',
        });
        expect(r.status).toBe(400);
      },
    );
  });

  // ── Performance ─────────────────────────────────────────────────────────────
  describe('performance reviews', () => {
    it('murabbi submits a review for own circle', async () => {
      const r = await mA().post('performance/reviews', {
        circleId: w.circleA,
        sessionNumber: 1,
        stars: 4,
        honestyScore: 80,
        empathyScore: 60,
      });
      expect(r.status).toBe(201);
      expect(
        (
          await mA().post('performance/reviews', {
            circleId: w.circleA,
            sessionNumber: 0,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await mA().post('performance/reviews', {
            circleId: w.circleA,
            sessionNumber: 1,
            stars: 6,
          })
        ).status,
      ).toBe(400);
    });

    // BUG-38: a murabbi can file reviews against any circle id — another
    // murabbi's circle or one that doesn't exist.
    it.failing(
      'BUG-38: reviews for a circle that is not yours (or does not exist) should be rejected',
      async () => {
        const r1 = await mA().post('performance/reviews', {
          circleId: w.circleB,
          sessionNumber: 1,
        });
        const r2 = await mA().post('performance/reviews', {
          circleId: MISSING_ID,
          sessionNumber: 1,
        });
        await ctx.db.collection('performances').deleteMany({
          _id: {
            $in: [r1, r2]
              .filter((r) => r.status === 201)
              .map((r) => new Types.ObjectId(r.body.data.review._id)),
          },
        });
        expect(r1.status).toBe(403);
        expect(r2.status).toBe(404);
      },
    );

    it('admin submits on behalf of a murabbi → murabbi notified', async () => {
      const r = await adm().post('performance/reviews', {
        murabbiId: w.B.id,
        circleId: w.circleB,
        sessionNumber: 1,
        stars: 5,
        requiresFollowUp: true,
      });
      expect(r.status).toBe(201);
      const n = await mB().get('notifications');
      expect(
        n.body.data.some((x: any) => x.type === 'performance_review'),
      ).toBe(true);
    });

    it('murabbi only sees own reviews even if they pass murabbiId', async () => {
      const r = await mA().get(`performance/reviews?murabbiId=${w.B.id}`);
      expect(r.body.data.every((x: any) => x.murabbi._id === w.A.id)).toBe(
        true,
      );
      expect((await mA().get('performance/my-reviews')).body.data).toHaveLength(
        1,
      );
    });

    it('admin filters, summary, indicators, resolve, delete', async () => {
      const byCircle = await adm().get(
        `performance/reviews?circleId=${w.circleB}`,
      );
      expect(byCircle.body.data).toHaveLength(1);
      const sum = await adm().get('performance/summary');
      expect(sum.body.data).toMatchObject({
        totalReviews: 2,
        followUpCount: 1,
        murabbiCount: 2,
      });
      expect((await mA().get('performance/summary')).status).toBe(403);
      expect((await mA().get('performance/indicators')).status).toBe(200);
      const id = byCircle.body.data[0]._id;
      expect(
        (await adm().patch(`performance/reviews/${id}/resolve`)).body.data
          .review.requiresFollowUp,
      ).toBe(false);
      expect((await adm().del(`performance/reviews/${id}`)).status).toBe(200);
      expect((await adm().del(`performance/reviews/${id}`)).status).toBe(404);
    });

    it(
      'BUG-14: GET /performance/reviews?circleId=<malformed> → 400 (is 500)',
      async () => {
        expect(
          (await adm().get(`performance/reviews?circleId=${BAD_ID}`)).status,
        ).toBe(400);
      },
    );
  });

  // ── Reports ─────────────────────────────────────────────────────────────────
  describe('reports', () => {
    it('murabbi report covers only own circles', async () => {
      const r = await mA().get('reports/murabbi');
      expect(r.status).toBe(200);
      expect(r.body.data.summary).toMatchObject({
        totalStudents: 1,
        sessionsCompleted: 1,
        avgAttendanceRate: 100,
      });
    });

    it('admin reports', async () => {
      expect((await mA().get('reports/admin')).status).toBe(403);
      expect(
        (await adm().get('reports/admin')).body.data.overview.totalSessions,
      ).toBe(2);
      expect(
        (await adm().get('reports/attendance-circles')).body.data,
      ).toHaveLength(2);
    });

    it('circle detail is owner-only for murabbis', async () => {
      expect(
        (await mA().get(`reports/circle/${w.circleA}/detail`)).status,
      ).toBe(200);
      expect(
        (await mA().get(`reports/circle/${w.circleB}/detail`)).status,
      ).toBe(403);
      expect(
        (await adm().get(`reports/circle/${w.circleB}/detail`)).status,
      ).toBe(200);
    });

    // BUG-39: attendance-trend ignores ownership when circleId is supplied —
    // the murabbi-scoping branch only applies when circleId is omitted.
    it(
      "BUG-39: murabbi must not read another circle's attendance trend via ?circleId=",
      async () => {
        const r = await mA().get(
          `reports/attendance-trend?circleId=${w.circleB}`,
        );
        expect(r.status).toBe(403);
      },
    );

    it(
      'BUG-14: GET /reports/attendance-trend?circleId=<malformed> → 400 (is 500)',
      async () => {
        expect(
          (await adm().get(`reports/attendance-trend?circleId=${BAD_ID}`))
            .status,
        ).toBe(400);
      },
    );

    // BUG-40: monthlyEnrollments sorts ascending then $limit 6, so once there
    // are more than 6 months of data the dashboard shows the OLDEST six
    // months and never the current one.
    it.failing(
      'BUG-40: admin report monthlyEnrollments should include the most recent month',
      async () => {
        for (let m = 1; m <= 8; m++) {
          await ctx.db.collection('students').insertOne({
            fullName: `Hist ${m}`,
            fatherName: 'F',
            phone: '03000000000',
            neighbourhood: null,
            circle: null,
            murabbi: null,
            isActive: true,
            enrollmentDate: new Date(Date.UTC(2025, m - 1, 15)),
          });
        }
        const r = await adm().get('reports/admin');
        const months = r.body.data.monthlyEnrollments.map(
          (x: any) => `${x._id.year}-${x._id.month}`,
        );
        const now = new Date();
        expect(months).toContain(
          `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
        );
      },
    );
  });

  // ── Sessions ────────────────────────────────────────────────────────────────
  describe('sessions', () => {
    it('curriculum endpoints', async () => {
      const r = await mA().get('sessions/curriculum');
      expect(r.body.data.themes).toHaveLength(12);
      expect(
        r.body.data.themes.filter((t: any) => t.status === 'current'),
      ).toHaveLength(1);
      expect((await mA().get('sessions')).status).toBe(200);
      expect((await mA().get('sessions/stats')).status).toBe(200);
    });

    // BUG-41: /sessions/list returns every attendance session in the system
    // (all circles, all murabbis) to any murabbi — inconsistent with the
    // per-circle ownership enforced on /attendance.
    it(
      "BUG-41: /sessions/list should only show a murabbi their own circles' sessions",
      async () => {
        const r = await mA().get('sessions/list');
        const circles = r.body.data.map((s: any) => s.circle?._id);
        expect(circles).not.toContain(w.circleB);
      },
    );

    // BUG-42: sessionsCompleted counts DISTINCT session numbers across all
    // circles, so 10 circles each running session 1 shows "1 session".
    it(
      'BUG-42: sessions/stats.sessionsCompleted should count sessions, not distinct numbers',
      async () => {
        const r = await adm().get('sessions/stats');
        expect(r.body.data.sessionsCompleted).toBe(2);
      },
    );
  });
});
