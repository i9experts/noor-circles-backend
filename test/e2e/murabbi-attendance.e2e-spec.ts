import {
  API,
  BAD_ID,
  bearer,
  createApp,
  E2EContext,
  MISSING_ID,
  seedWorld,
} from './helpers';

describe('Murabbi portal + Attendance', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('murabbi');
    w = await seedWorld(ctx);
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
  const mA = () => as(w.A.token);
  const mB = () => as(w.B.token);
  const adm = () => as(w.admin);

  // ── /murabbi ────────────────────────────────────────────────────────────────
  describe('/murabbi', () => {
    it('profile get/update (only fullName allowed)', async () => {
      expect((await mA().get('murabbi/profile')).body.data.email).toBe(
        'a@e2e.test',
      );
      expect(
        (await mA().patch('murabbi/profile', { fullName: 'Murabbi A' })).status,
      ).toBe(200);
      expect(
        (await mA().patch('murabbi/profile', { role: 'admin' })).status,
      ).toBe(400);
    });

    it('dashboard / my-circles / my-students only show own data', async () => {
      const d = await mA().get('murabbi/dashboard');
      expect(d.status).toBe(200);
      expect(d.body.data.stats).toMatchObject({
        totalStudents: 1,
        circleCount: 1,
      });
      const c = await mA().get('murabbi/my-circles');
      expect(c.body.data.map((x: any) => x._id)).toEqual([w.circleA]);
      const s = await mA().get('murabbi/my-students');
      expect(s.body.data.map((x: any) => x._id)).toEqual([w.studentA]);
    });

    it('enrol into own circle → 201, admins notified', async () => {
      const r = await mA().post('murabbi/enroll-student', {
        fullName: 'Yusuf',
        fatherName: 'Umar',
        phone: '03007654321',
        circleId: w.circleA,
        neighbourhoodId: w.nbhId,
      });
      expect(r.status).toBe(201);
      const n = await adm().get('notifications');
      expect(n.body.data.some((x: any) => x.type === 'murabbi_action')).toBe(
        true,
      );
    });

    it("enrol into someone else's circle → 400", async () => {
      const r = await mA().post('murabbi/enroll-student', {
        fullName: 'Sneaky',
        fatherName: 'F',
        phone: '03007654321',
        circleId: w.circleB,
        neighbourhoodId: w.nbhId,
      });
      expect(r.status).toBe(400);
    });

    // BUG-22: murabbi enrolment never checks that neighbourhoodId exists.
    it(
      'BUG-22: murabbi enrolment with a non-existent neighbourhood should fail',
      async () => {
        const r = await mA().post('murabbi/enroll-student', {
          fullName: 'Ghost Nbh',
          fatherName: 'F',
          phone: '03007654321',
          circleId: w.circleA,
          neighbourhoodId: MISSING_ID,
        });
        expect(r.status).toBe(404);
      },
    );

    it("update own student → 200; other murabbi's student → 404", async () => {
      expect(
        (
          await mA().patch(`murabbi/students/${w.studentA}`, {
            address: 'Street 1',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await mA().patch(`murabbi/students/${w.studentB}`, {
            address: 'Hacked',
          })
        ).status,
      ).toBe(404);
    });

    it(
      'BUG-14: PATCH /murabbi/students/<malformed id> → 400 (is 500)',
      async () => {
        expect(
          (await mA().patch(`murabbi/students/${BAD_ID}`, { address: 'x' }))
            .status,
        ).toBe(400);
      },
    );

    it('delete-request flow: murabbi requests → admin accepts → student deleted', async () => {
      const s = await w.mkStudent('To Be Removed', w.circleA);
      expect(
        (await mB().post(`murabbi/request-delete/student/${s}`)).status,
      ).toBe(404); // not B's
      expect(
        (await mA().post(`murabbi/request-delete/student/${s}`)).status,
      ).toBe(201);
      const n = await adm().get('notifications');
      const req = n.body.data.find(
        (x: any) => x.type === 'delete_request' && x.payload.targetId === s,
      );
      expect(req.status).toBe('pending');
      expect(
        (await adm().patch(`notifications/${req._id}/accept`)).status,
      ).toBe(200);
      expect((await adm().get(`admin/students/${s}`)).status).toBe(404);
      expect(
        (await adm().patch(`notifications/${req._id}/accept`)).status,
      ).toBe(404); // not pending anymore
    });

    it('delete-request reject keeps the student', async () => {
      const s = await w.mkStudent('Keep Me', w.circleA);
      await mA().post(`murabbi/request-delete/student/${s}`);
      const n = await adm().get('notifications');
      const req = n.body.data.find((x: any) => x.payload?.targetId === s);
      expect(
        (await adm().patch(`notifications/${req._id}/reject`)).status,
      ).toBe(200);
      expect((await adm().get(`admin/students/${s}`)).status).toBe(200);
    });

    it('murabbi cannot approve delete requests', async () => {
      const r = await mA().patch(`notifications/${MISSING_ID}/accept`);
      expect(r.status).toBe(403);
    });
  });

  // ── /attendance ─────────────────────────────────────────────────────────────
  describe('/attendance', () => {
    let sessionId: string;
    const day = (d: number) =>
      `2026-03-${String(d).padStart(2, '0')}T10:00:00.000Z`;

    it('murabbi submits attendance for own circle', async () => {
      const r = await mA().post('attendance', {
        circle: w.circleA,
        sessionNumber: 1,
        sessionDate: day(1),
        topic: 'Identity',
        records: [{ student: w.studentA, status: 'present' }],
      });
      expect(r.status).toBe(201);
      sessionId = r.body.data._id;
    });

    it('validation: empty records, bad status, bad ids', async () => {
      expect(
        (
          await mA().post('attendance', {
            circle: w.circleA,
            sessionNumber: 2,
            sessionDate: day(2),
            records: [],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await mA().post('attendance', {
            circle: w.circleA,
            sessionNumber: 2,
            sessionDate: day(2),
            records: [{ student: w.studentA, status: 'late' }],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await mA().post('attendance', {
            circle: BAD_ID,
            sessionNumber: 2,
            sessionDate: day(2),
            records: [{ student: w.studentA, status: 'present' }],
          })
        ).status,
      ).toBe(400);
    });

    it('duplicate submission for same circle+day → 409', async () => {
      const r = await mA().post('attendance', {
        circle: w.circleA,
        sessionNumber: 2,
        sessionDate: day(1),
        records: [{ student: w.studentA, status: 'present' }],
      });
      expect(r.status).toBe(409);
    });

    it("murabbi cannot submit for another murabbi's circle → 403", async () => {
      const r = await mA().post('attendance', {
        circle: w.circleB,
        sessionNumber: 1,
        sessionDate: day(1),
        records: [{ student: w.studentB, status: 'present' }],
      });
      expect(r.status).toBe(403);
    });

    // BUG-23: the students listed in `records` are never checked against the
    // circle. A murabbi can record attendance for other murabbis' students
    // (or non-existent ids) inside their own circle's session, corrupting
    // those students' attendance rates and every report built on them.
    it(
      'BUG-23: attendance records must only contain students of that circle',
      async () => {
        const r = await mA().post('attendance', {
          circle: w.circleA,
          sessionNumber: 3,
          sessionDate: day(3),
          records: [
            { student: w.studentA, status: 'present' },
            { student: w.studentB, status: 'absent' },
          ],
        });
        expect(r.status).toBe(400);
      },
    );

    it(
      'BUG-23: duplicate student entries in one session should be rejected',
      async () => {
        const r = await mA().post('attendance', {
          circle: w.circleA,
          sessionNumber: 4,
          sessionDate: day(4),
          records: [
            { student: w.studentA, status: 'present' },
            { student: w.studentA, status: 'absent' },
          ],
        });
        expect(r.status).toBe(400);
      },
    );

    it('reads: by circle / by student / rate (own only)', async () => {
      expect((await mA().get(`attendance/circle/${w.circleA}`)).status).toBe(
        200,
      );
      expect((await mA().get(`attendance/circle/${w.circleB}`)).status).toBe(
        403,
      );
      expect(
        (await mA().get(`attendance/by-student/${w.studentB}`)).status,
      ).toBe(403);
      const rate = await mA().get(`attendance/student/${w.studentA}/rate`);
      expect(rate.status).toBe(200);
      expect(rate.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('admin-only reads are forbidden to murabbis', async () => {
      expect((await mA().get('attendance')).status).toBe(403);
      expect((await mA().get(`attendance/${sessionId}`)).status).toBe(403);
      expect((await mA().get(`attendance/by-murabbi/${w.A.id}`)).status).toBe(
        403,
      );
    });

    it('admin reads all / by id / by murabbi', async () => {
      expect(
        (await adm().get('attendance')).body.data.length,
      ).toBeGreaterThanOrEqual(1);
      expect((await adm().get(`attendance/${sessionId}`)).status).toBe(200);
      expect((await adm().get(`attendance/${MISSING_ID}`)).status).toBe(404);
      expect(
        (await adm().get(`attendance/by-murabbi/${w.A.id}`)).body.data.length,
      ).toBeGreaterThanOrEqual(1);
    });

    it(
      'BUG-14: GET /attendance/by-murabbi/<malformed id> → 400 (is 500)',
      async () => {
        expect(
          (await adm().get(`attendance/by-murabbi/${BAD_ID}`)).status,
        ).toBe(400);
      },
    );

    it('submitting murabbi can edit; other murabbi cannot', async () => {
      expect(
        (
          await mA().patch(`attendance/${sessionId}`, {
            topic: 'Identity (edited)',
          })
        ).status,
      ).toBe(200);
      expect(
        (await mB().patch(`attendance/${sessionId}`, { topic: 'Hijack' }))
          .status,
      ).toBe(403);
    });

    // BUG-24: editing a session's date skips the one-session-per-circle-per-day
    // rule that submission enforces.
    it(
      'BUG-24: editing a session onto a day that already has one should be rejected',
      async () => {
        const r2 = await mA().post('attendance', {
          circle: w.circleA,
          sessionNumber: 5,
          sessionDate: day(5),
          records: [{ student: w.studentA, status: 'present' }],
        });
        const r = await mA().patch(`attendance/${r2.body.data._id}`, {
          sessionDate: day(1),
        });
        expect(r.status).toBe(409);
      },
    );

    // BUG-25: sessionNumber is not unique per circle — two different days can
    // both be "Session 1". Trend reports group by sessionNumber and silently
    // merge them.
    it(
      'BUG-25: the same sessionNumber twice in one circle should be rejected',
      async () => {
        const r = await mA().post('attendance', {
          circle: w.circleA,
          sessionNumber: 1,
          sessionDate: day(20),
          records: [{ student: w.studentA, status: 'present' }],
        });
        expect(r.status).toBe(409);
      },
    );

    it('admin deletes a session', async () => {
      expect((await mA().del(`attendance/${sessionId}`)).status).toBe(403);
      expect((await adm().del(`attendance/${sessionId}`)).status).toBe(200);
      expect((await adm().del(`attendance/${sessionId}`)).status).toBe(404);
    });
  });
});
