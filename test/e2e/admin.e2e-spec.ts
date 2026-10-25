import { Types } from 'mongoose';
import {
  ADMIN_EMAIL,
  API,
  BAD_ID,
  bearer,
  createApp,
  createMurabbi,
  E2EContext,
  MISSING_ID,
  seedWorld,
} from './helpers';

describe('Admin', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  const A = () => bearer(w.admin);

  beforeAll(async () => {
    ctx = await createApp('admin');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const get = (p: string) => ctx.http().get(`${API}/admin/${p}`).set(A());
  const post = (p: string, b: object = {}) =>
    ctx.http().post(`${API}/admin/${p}`).set(A()).send(b);
  const patch = (p: string, b: object = {}) =>
    ctx.http().patch(`${API}/admin/${p}`).set(A()).send(b);
  const del = (p: string) => ctx.http().delete(`${API}/admin/${p}`).set(A());

  it('every /admin route rejects murabbis (403) and anonymous users (401)', async () => {
    const routes = [
      'stats',
      'dashboard/extended',
      'users',
      'murabbis',
      'murabbis/with-stats',
      'neighbourhoods',
      'neighbourhoods/page-data',
      'neighbourhoods/pipeline',
      'circles',
      'circles/page-data',
      'students',
    ];
    for (const r of routes) {
      expect(
        (await ctx.http().get(`${API}/admin/${r}`).set(bearer(w.A.token)))
          .status,
      ).toBe(403);
      expect((await ctx.http().get(`${API}/admin/${r}`)).status).toBe(401);
    }
  });

  // ── Dashboard ───────────────────────────────────────────────────────────────
  describe('dashboard', () => {
    it('GET stats returns consistent counts', async () => {
      const r = await get('stats');
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({
        totalMurabbis: 2,
        activeMurabbis: 2,
        totalStudents: 2,
        totalCircles: 2,
        totalNeighbourhoods: 1,
      });
    });

    it('GET dashboard/extended lists active circles with enrolment counts + activity feed', async () => {
      const r = await get('dashboard/extended');
      expect(r.status).toBe(200);
      expect(r.body.data.activeCircles).toHaveLength(2);
      expect(r.body.data.activeCircles[0].enrolledCount).toBe(1);
      expect(Array.isArray(r.body.data.recentActivity)).toBe(true);
    });
  });

  // ── Murabbis ────────────────────────────────────────────────────────────────
  describe('murabbis', () => {
    it('create: duplicate email → 409', async () => {
      const r = await post('murabbis', {
        fullName: 'Dup',
        email: 'a@e2e.test',
        password: 'Password123',
      });
      expect(r.status).toBe(409);
    });

    it('create: validates password policy + phone', async () => {
      const r = await post('murabbis', {
        fullName: 'X',
        email: 'x1@e2e.test',
        password: 'weak',
        phone: 'abc',
      });
      expect(r.status).toBe(400);
    });

    it('list + with-stats never leak secrets', async () => {
      for (const p of ['murabbis', 'murabbis/with-stats', 'users']) {
        const body = JSON.stringify((await get(p)).body);
        expect(body).not.toMatch(/"password"|refreshTokens|otpCode/);
      }
    });

    it('with-stats aggregates circles/students per murabbi', async () => {
      const r = await get('murabbis/with-stats');
      const a = r.body.data.murabbis.find((m: any) => m._id === w.A.id);
      expect(a.circles).toHaveLength(1);
      expect(a.studentCount).toBe(1);
      expect(r.body.data.tiers.tier1).toBe(2);
    });

    it('update tier: valid → 200, invalid → 400', async () => {
      const m = await createMurabbi(ctx, w.admin, 'tier@e2e.test');
      expect((await patch(`murabbis/${m.id}/tier`, { tier: 2 })).status).toBe(
        200,
      );
      expect((await patch(`murabbis/${m.id}/tier`, { tier: 7 })).status).toBe(
        400,
      );
      expect(
        (await patch(`murabbis/${MISSING_ID}/tier`, { tier: 2 })).status,
      ).toBe(404);
    });

    it('update murabbi profile fields', async () => {
      const m = await createMurabbi(ctx, w.admin, 'upd@e2e.test');
      const r = await patch(`murabbis/${m.id}`, {
        fullName: 'Updated',
        phone: '+92 300 1234567',
      });
      expect(r.status).toBe(200);
      expect(r.body.data.fullName).toBe('Updated');
    });

    it('deactivate → murabbi is locked out immediately; activate → back in', async () => {
      const m = await createMurabbi(ctx, w.admin, 'toggle@e2e.test');
      expect((await patch(`murabbis/${m.id}/deactivate`)).status).toBe(200);
      expect(
        (await ctx.http().get(`${API}/murabbi/dashboard`).set(bearer(m.token)))
          .status,
      ).toBe(401);
      expect(
        (
          await ctx
            .http()
            .post(`${API}/auth/signin`)
            .send({ email: 'toggle@e2e.test', password: 'Password123' })
        ).status,
      ).toBe(401);
      expect((await patch(`murabbis/${m.id}/activate`)).status).toBe(200);
      expect(
        (
          await ctx
            .http()
            .post(`${API}/auth/signin`)
            .send({ email: 'toggle@e2e.test', password: 'Password123' })
        ).status,
      ).toBe(200);
    });

    // BUG-11: /admin/murabbis/:id routes don't check the target's role, so
    // the "murabbi" update endpoint will happily edit an admin account.
    it(
      'BUG-11: PATCH /admin/murabbis/:id should refuse to edit a non-murabbi (admin) account',
      async () => {
        const me = await ctx.http().get(`${API}/auth/me`).set(A());
        const r = await patch(`murabbis/${me.body.data.id}`, {
          fullName: 'Hijacked',
        });
        await ctx.db
          .collection('users')
          .updateOne(
            { email: ADMIN_EMAIL },
            { $set: { fullName: 'Test Admin' } },
          );
        expect(r.status).toBeGreaterThanOrEqual(400);
      },
    );

    it('delete: admin account cannot be deleted', async () => {
      const me = await ctx.http().get(`${API}/auth/me`).set(A());
      const r = await del(`murabbis/${me.body.data.id}`);
      expect(r.status).toBeGreaterThanOrEqual(400);
    });

    // BUG-12: deleting a murabbi leaves their circles pointing at a user that
    // no longer exists. Every circle/report view then shows murabbi=null and
    // the circle can't be used for attendance (ownership check compares to a
    // dead id). Should be blocked while circles are assigned, or reassign.
    it(
      'BUG-12: deleting a murabbi who still owns circles should be blocked (or circles reassigned)',
      async () => {
        const m = await createMurabbi(ctx, w.admin, 'orphan@e2e.test');
        const c = await w.mkCircle('Orphan Circle', m.id);
        const r = await del(`murabbis/${m.id}`);
        await ctx.db
          .collection('circles')
          .deleteOne({ _id: new Types.ObjectId(c) });
        expect(r.status).toBe(400);
      },
    );

    it('malformed ids → 400 on every murabbi :id route', async () => {
      expect(
        (await patch(`murabbis/${BAD_ID}`, { fullName: 'x' })).status,
      ).toBe(400);
      expect((await patch(`murabbis/${BAD_ID}/tier`, { tier: 2 })).status).toBe(
        400,
      );
      expect((await patch(`murabbis/${BAD_ID}/activate`)).status).toBe(400);
      expect((await del(`murabbis/${BAD_ID}`)).status).toBe(400);
    });
  });

  // ── Neighbourhoods ──────────────────────────────────────────────────────────
  describe('neighbourhoods', () => {
    let id: string;

    it('create → 201; duplicate (case-insensitive) → 409', async () => {
      const r = await post('neighbourhoods', {
        name: 'Clifton',
        city: 'Karachi',
      });
      expect(r.status).toBe(201);
      id = r.body.data.neighbourhood._id;
      expect((await post('neighbourhoods', { name: 'clifton' })).status).toBe(
        409,
      );
    });

    it('invalid status → 400', async () => {
      expect(
        (await post('neighbourhoods', { name: 'Bad Status', status: 'banana' }))
          .status,
      ).toBe(400);
    });

    it('get one / list / page-data', async () => {
      expect((await get(`neighbourhoods/${id}`)).status).toBe(200);
      expect(
        (await get('neighbourhoods')).body.data.length,
      ).toBeGreaterThanOrEqual(2);
      const pd = await get('neighbourhoods/page-data');
      expect(pd.status).toBe(200);
      const g = pd.body.data.neighbourhoods.find((n: any) => n._id === w.nbhId);
      expect(g).toMatchObject({
        circleCount: 2,
        studentCount: 2,
        murabbiCount: 2,
      });
    });

    it('update: rename + status; duplicate rename → 409', async () => {
      expect(
        (
          await patch(`neighbourhoods/${id}`, {
            name: 'Clifton Block 5',
            status: 'review',
          })
        ).status,
      ).toBe(200);
      expect(
        (await patch(`neighbourhoods/${id}`, { name: 'gulshan' })).status,
      ).toBe(409);
      expect(
        (await patch(`neighbourhoods/${id}`, { status: 'banana' })).status,
      ).toBe(400);
    });

    // BUG-13: names are interpolated raw into a Mongo $regex for the
    // duplicate check. A name with regex metacharacters (perfectly normal
    // for addresses, e.g. "Block [A]" or "Phase (2") crashes with 500, and
    // "." wildcards produce false duplicates.
    it(
      'BUG-13: neighbourhood names containing regex characters should be accepted',
      async () => {
        const r = await post('neighbourhoods', { name: 'DHA Phase (2' });
        expect(r.status).toBe(201);
      },
    );

    it(
      'BUG-13: "Block.A" must not be reported as a duplicate of "BlockXA"',
      async () => {
        await post('neighbourhoods', { name: 'BlockXA' });
        const r = await post('neighbourhoods', { name: 'Block.A' });
        expect(r.status).toBe(201);
      },
    );

    it('delete is blocked while circles exist', async () => {
      const r = await del(`neighbourhoods/${w.nbhId}`);
      expect(r.status).toBe(400);
    });

    it('delete an empty neighbourhood → 200, then 404', async () => {
      expect((await del(`neighbourhoods/${id}`)).status).toBe(200);
      expect((await del(`neighbourhoods/${id}`)).status).toBe(404);
    });

    // BUG-14: several services build `new Types.ObjectId(id)` straight from a
    // route/query param. A malformed id throws a BSONError (not a Mongoose
    // CastError), which the global filter doesn't recognise → 500.
    it(
      'BUG-14: PATCH /admin/neighbourhoods/:id with malformed id → 400 (is 500)',
      async () => {
        expect(
          (await patch(`neighbourhoods/${BAD_ID}`, { name: 'Whatever' }))
            .status,
        ).toBe(400);
      },
    );
    it(
      'BUG-14: DELETE /admin/neighbourhoods/:id with malformed id → 400 (is 500)',
      async () => {
        expect((await del(`neighbourhoods/${BAD_ID}`)).status).toBe(400);
      },
    );
    it(
      'BUG-14: GET /admin/students?murabbiId=<malformed> → 400 (is 500)',
      async () => {
        expect((await get(`students?murabbiId=${BAD_ID}`)).status).toBe(400);
      },
    );

    it('GET neighbourhoods/:id malformed → 400, missing → 404', async () => {
      expect((await get(`neighbourhoods/${BAD_ID}`)).status).toBe(400);
      expect((await get(`neighbourhoods/${MISSING_ID}`)).status).toBe(404);
    });
  });

  // ── Pipeline ────────────────────────────────────────────────────────────────
  describe('neighbourhood pipeline', () => {
    let pid: string;

    it('GET pipeline is reachable (not swallowed by neighbourhoods/:id)', async () => {
      const r = await get('neighbourhoods/pipeline');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.data)).toBe(true);
    });

    it('create / update / validation', async () => {
      const r = await post('neighbourhoods/pipeline', {
        name: 'Malir',
        area: 'East',
        targetCircles: 3,
        interestLevel: 80,
      });
      expect(r.status).toBe(201);
      pid = r.body.data._id;
      expect(
        (await patch(`neighbourhoods/pipeline/${pid}`, { status: 'in-talks' }))
          .status,
      ).toBe(200);
      expect(
        (
          await post('neighbourhoods/pipeline', {
            name: 'X',
            interestLevel: 150,
          })
        ).status,
      ).toBe(400);
    });

    // BUG-15: update uses findByIdAndUpdate without runValidators, and the
    // DTO only checks @IsString, so any status string is saved.
    it(
      'BUG-15: pipeline update should reject an invalid status',
      async () => {
        const r = await patch(`neighbourhoods/pipeline/${pid}`, {
          status: 'banana',
        });
        expect(r.status).toBe(400);
      },
    );

    it('launch converts entry into an active neighbourhood and removes it from pipeline', async () => {
      const r = await post(`neighbourhoods/pipeline/${pid}/launch`);
      expect(r.status).toBe(201);
      expect(r.body.data.neighbourhood.name).toBe('Malir');
      expect((await post(`neighbourhoods/pipeline/${pid}/launch`)).status).toBe(
        404,
      );
    });

    it('launch with an existing neighbourhood name → 409', async () => {
      const r = await post('neighbourhoods/pipeline', { name: 'Malir' });
      expect(
        (await post(`neighbourhoods/pipeline/${r.body.data._id}/launch`))
          .status,
      ).toBe(409);
      expect(
        (await del(`neighbourhoods/pipeline/${r.body.data._id}`)).status,
      ).toBe(200);
    });
  });

  // ── Circles ─────────────────────────────────────────────────────────────────
  describe('circles', () => {
    it('create validates ids and existence', async () => {
      expect(
        (
          await post('circles', {
            name: 'X',
            neighbourhoodId: BAD_ID,
            murabbiId: w.A.id,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await post('circles', {
            name: 'X',
            neighbourhoodId: MISSING_ID,
            murabbiId: w.A.id,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await post('circles', {
            name: 'X',
            neighbourhoodId: w.nbhId,
            murabbiId: MISSING_ID,
          })
        ).status,
      ).toBe(404);
    });

    it('cannot assign a circle to an admin as murabbi', async () => {
      const me = await ctx.http().get(`${API}/auth/me`).set(A());
      expect(
        (
          await post('circles', {
            name: 'X',
            neighbourhoodId: w.nbhId,
            murabbiId: me.body.data.id,
          })
        ).status,
      ).toBe(404);
    });

    it('creating a circle notifies the murabbi', async () => {
      const r = await ctx
        .http()
        .get(`${API}/notifications`)
        .set(bearer(w.A.token));
      expect(r.body.data.some((n: any) => n.type === 'circle_assigned')).toBe(
        true,
      );
    });

    it('list / page-data / get one', async () => {
      expect((await get('circles')).body.data).toHaveLength(2);
      const pd = await get('circles/page-data');
      expect(pd.body.data.stats).toMatchObject({
        total: 2,
        active: 2,
        neighbourhoods: 1,
      });
      expect(
        (await get(`circles/${w.circleA}`)).body.data.murabbi.fullName,
      ).toBe('Murabbi A');
      expect((await get(`circles/${BAD_ID}`)).status).toBe(400);
      expect((await get(`circles/${MISSING_ID}`)).status).toBe(404);
    });

    it('update name/capacity', async () => {
      const r = await patch(`circles/${w.circleA}`, {
        name: 'Circle A Renamed',
        capacity: 25,
      });
      expect(r.status).toBe(200);
      expect(r.body.data.circle.capacity).toBe(25);
      expect(
        (await patch(`circles/${w.circleA}`, { capacity: 0 })).status,
      ).toBe(400);
    });

    // BUG-16: capacity can be reduced below the number of students already
    // enrolled, leaving the circle permanently "over capacity".
    it(
      'BUG-16: reducing capacity below current enrolment should be rejected',
      async () => {
        const c = await w.mkCircle('Cap Circle', w.A.id, 5);
        await w.mkStudent('Cap 1', c);
        await w.mkStudent('Cap 2', c);
        const r = await patch(`circles/${c}`, { capacity: 1 });
        expect(r.status).toBe(400);
      },
    );

    // BUG-17: there is no way to deactivate/reactivate a circle — isActive is
    // checked in enrol/assign/reports, but no endpoint or DTO field sets it.
    it(
      'BUG-17: admin should be able to deactivate a circle',
      async () => {
        const c = await w.mkCircle('To Deactivate', w.A.id);
        const r = await patch(`circles/${c}`, { isActive: false });
        expect(r.status).toBe(200);
        expect(r.body.data.circle.isActive).toBe(false);
      },
    );

    it('delete unassigns its students', async () => {
      const c = await w.mkCircle('Doomed', w.A.id);
      const s = await w.mkStudent('Doomed Student', c);
      expect((await del(`circles/${c}`)).status).toBe(200);
      const st = await get(`students/${s}`);
      expect(st.body.data.circle).toBeNull();
    });
  });

  // ── Students ────────────────────────────────────────────────────────────────
  describe('students', () => {
    it('enrol validates input', async () => {
      const r = await post('students/enroll', {
        fullName: '',
        fatherName: '',
        phone: 'abc',
        circleId: BAD_ID,
        neighbourhoodId: BAD_ID,
      });
      expect(r.status).toBe(400);
      expect(r.body.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('enrol sets murabbi from the circle and notifies the murabbi', async () => {
      const r = await post('students/enroll', {
        fullName: 'Hamza',
        fatherName: 'Ali',
        phone: '03001112222',
        circleId: w.circleB,
        neighbourhoodId: w.nbhId,
      });
      expect(r.status).toBe(201);
      expect(r.body.data.student.murabbi).toBe(w.B.id);
      const n = await ctx
        .http()
        .get(`${API}/notifications`)
        .set(bearer(w.B.token));
      expect(n.body.data.some((x: any) => x.type === 'student_assigned')).toBe(
        true,
      );
    });

    it('enrol into a full circle → 400', async () => {
      const c = await w.mkCircle('Tiny', w.A.id, 1);
      await w.mkStudent('Only One', c);
      const r = await post('students/enroll', {
        fullName: 'Too Many',
        fatherName: 'F',
        phone: '03001234567',
        circleId: c,
        neighbourhoodId: w.nbhId,
      });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/full/i);
    });

    // BUG-18: enrolment accepts any neighbourhoodId, even one unrelated to
    // the circle's neighbourhood. The student then appears under the wrong
    // neighbourhood in neighbourhood stats.
    it(
      "BUG-18: enrolling with a neighbourhood that is not the circle's should be rejected",
      async () => {
        const other = await post('neighbourhoods', { name: 'Elsewhere' });
        const r = await post('students/enroll', {
          fullName: 'Mismatch',
          fatherName: 'F',
          phone: '03001234567',
          circleId: w.circleA,
          neighbourhoodId: other.body.data.neighbourhood._id,
        });
        expect(r.status).toBe(400);
      },
    );

    it("BUG-18: a student's neighbourhood follows their circle on reassignment and when the circle moves", async () => {
      const elsewhere = (await post('neighbourhoods', { name: 'Gulistan' })).body.data.neighbourhood._id;
      const there = (await post('circles', { name: 'Gulistan Circle', neighbourhoodId: elsewhere, murabbiId: w.A.id })).body.data.circle._id;
      const s = await w.mkStudent('Moving Family', w.circleA);
      expect((await patch(`students/${s}/circle`, { circleId: there })).status).toBe(200);
      expect((await get(`students/${s}`)).body.data.neighbourhood._id).toBe(elsewhere);
      // moving the circle itself moves its students
      expect((await patch(`circles/${there}`, { neighbourhoodId: w.nbhId })).status).toBe(200);
      expect((await get(`students/${s}`)).body.data.neighbourhood._id).toBe(w.nbhId);
    });

    it('list (optionally filtered by murabbi) / get one', async () => {
      const all = await get('students');
      expect(all.body.data.length).toBeGreaterThanOrEqual(3);
      const onlyB = await get(`students?murabbiId=${w.B.id}`);
      expect(onlyB.body.data.every((s: any) => s.murabbi._id === w.B.id)).toBe(
        true,
      );
      expect((await get(`students/${w.studentA}`)).status).toBe(200);
      expect((await get(`students/${MISSING_ID}`)).status).toBe(404);
    });

    it('update student fields', async () => {
      const r = await patch(`students/${w.studentA}`, {
        fullName: 'Student A+',
        dateOfBirth: '2014-05-01',
      });
      expect(r.status).toBe(200);
      expect(r.body.data.student.fullName).toBe('Student A+');
    });

    it('assign to another circle moves murabbi too', async () => {
      const s = await w.mkStudent('Mover', w.circleA);
      const r = await patch(`students/${s}/circle`, { circleId: w.circleB });
      expect(r.status).toBe(200);
      expect(r.body.data.student.murabbi).toBe(w.B.id);
    });

    // BUG-19: re-assigning a student to the circle they are already in is
    // rejected as "Circle is full" when that circle is at capacity, because
    // the student counts against themselves.
    it(
      'BUG-19: re-assigning a student to their current (full) circle should not fail with "full"',
      async () => {
        const c = await w.mkCircle('Exactly Full', w.A.id, 1);
        const s = await w.mkStudent('Sole', c);
        const r = await patch(`students/${s}/circle`, { circleId: c });
        expect(r.status).toBe(200);
      },
    );

    // BUG-20: re-activating a student skips the capacity check that enrol
    // and assign enforce, so a circle can silently exceed capacity.
    it(
      'BUG-20: activating a student into a full circle should be rejected',
      async () => {
        const c = await w.mkCircle('Reactivate Full', w.A.id, 1);
        const s1 = await w.mkStudent('First', c);
        await patch(`students/${s1}/deactivate`);
        await w.mkStudent('Second', c);
        const r = await patch(`students/${s1}/activate`);
        expect(r.status).toBe(400);
      },
    );

    it('deactivate / activate / delete', async () => {
      const s = await w.mkStudent('Lifecycle', w.circleA);
      expect((await patch(`students/${s}/deactivate`)).status).toBe(200);
      expect((await get(`students/${s}`)).body.data.isActive).toBe(false);
      expect((await patch(`students/${s}/activate`)).status).toBe(200);
      expect((await del(`students/${s}`)).status).toBe(200);
      expect((await get(`students/${s}`)).status).toBe(404);
    });
  });

  // ── Circle reassignment consistency ─────────────────────────────────────────
  describe("changing a circle's murabbi", () => {
    // BUG-21 (high): reassigning a circle to a new murabbi updates only the
    // circle; the students keep `murabbi = old murabbi`. Ownership checks in
    // attendance/incentives/parents use student.murabbi, while the murabbi
    // portal uses (student.murabbi OR circle). Result: the OLD murabbi keeps
    // seeing and editing those students, and the NEW murabbi is refused
    // (403/400) when awarding points, viewing attendance history or
    // registering parents for students in their own circle.
    it(
      'BUG-21: after reassigning a circle, its students follow the new murabbi',
      async () => {
        const c = await w.mkCircle('Handover', w.A.id);
        const s = await w.mkStudent('Handover Kid', c);
        expect(
          (await patch(`circles/${c}`, { murabbiId: w.B.id })).status,
        ).toBe(200);
        const st = await get(`students/${s}`);
        expect(st.body.data.murabbi).toBe(w.B.id);
      },
    );

    it(
      'BUG-21: old murabbi must lose access to the moved students',
      async () => {
        const c = await w.mkCircle('Handover 2', w.A.id);
        const s = await w.mkStudent('Handover Kid 2', c);
        await patch(`circles/${c}`, { murabbiId: w.B.id });
        const mine = await ctx
          .http()
          .get(`${API}/murabbi/my-students`)
          .set(bearer(w.A.token));
        expect(mine.body.data.some((x: any) => x._id === s)).toBe(false);
      },
    );

    it(
      'BUG-21: new murabbi can award points to students in their newly-assigned circle',
      async () => {
        const c = await w.mkCircle('Handover 3', w.A.id);
        const s = await w.mkStudent('Handover Kid 3', c);
        await patch(`circles/${c}`, { murabbiId: w.B.id });
        const r = await ctx
          .http()
          .post(`${API}/incentives`)
          .set(bearer(w.B.token))
          .send({ studentId: s, awardType: 'noor-star' });
        expect(r.status).toBe(201);
      },
    );
  });
});
