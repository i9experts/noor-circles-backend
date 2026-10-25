import { Types } from 'mongoose';
import {
  API,
  BAD_ID,
  bearer,
  createApp,
  createMurabbi,
  E2EContext,
  MISSING_ID,
  seedWorld,
} from './helpers';

describe('Training', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  const mods: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createApp('training');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) =>
      ctx.http().get(`${API}/training/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) =>
      ctx.http().post(`${API}/training/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) =>
      ctx.http().patch(`${API}/training/${p}`).set(bearer(token)).send(b),
    del: (p: string) =>
      ctx.http().delete(`${API}/training/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const mA = () => as(w.A.token);

  // ── Modules ─────────────────────────────────────────────────────────────────
  describe('modules', () => {
    it('admin creates modules; murabbi cannot', async () => {
      for (const [key, minTier, order] of [
        ['m1', 1, 1],
        ['m2', 1, 2],
        ['t2', 2, 3],
      ] as const) {
        const r = await adm().post('modules', {
          title: `Module ${key}`,
          minTier,
          order,
          content: '# Read me',
        });
        expect(r.status).toBe(201);
        mods[key] = r.body.data._id;
      }
      expect((await mA().post('modules', { title: 'Nope' })).status).toBe(403);
    });

    it('create validates enum fields', async () => {
      expect(
        (await adm().post('modules', { title: 'Bad', type: 'Hologram' }))
          .status,
      ).toBe(400);
      expect(
        (await adm().post('modules', { title: 'Bad', minTier: 9 })).status,
      ).toBe(400);
    });

    // BUG-26: PATCH /training/modules/:id types its body as
    // Partial<CreateModuleDto>. Generic types erase to Object at runtime, so
    // the ValidationPipe validates nothing, and the update runs without
    // runValidators: enums, minTier range and required title are all bypassed.
    it(
      'BUG-26: module update should validate (type enum / minTier 1-3 / non-empty title)',
      async () => {
        const tmp = await adm().post('modules', {
          title: 'Scratch',
          minTier: 3,
        });
        const r = await adm().patch(`modules/${tmp.body.data._id}`, {
          type: 'Hologram',
          minTier: 9,
          title: '',
        });
        await adm().del(`modules/${tmp.body.data._id}`);
        expect(r.status).toBe(400);
      },
    );

    it('murabbis only see modules up to their tier; admin sees all', async () => {
      const m = await mA().get('modules');
      expect(m.body.data.map((x: any) => x._id).sort()).toEqual(
        [mods.m1, mods.m2].sort(),
      );
      expect(m.body.data[0].content).toBeDefined();
      expect(
        (await adm().get('modules')).body.data.length,
      ).toBeGreaterThanOrEqual(3);
    });

    it('progress updates + summary', async () => {
      expect(
        (await mA().patch(`progress/${mods.m1}`, { progressPercent: 40 }))
          .status,
      ).toBe(200);
      expect(
        (await mA().patch(`progress/${mods.m1}`, { progressPercent: 140 }))
          .status,
      ).toBe(400);
      const s = await mA().get('progress/summary');
      expect(s.body.data).toMatchObject({
        total: 2,
        completed: 0,
        inProgress: 1,
        overallPercent: 20,
      });
      expect(
        (await mA().patch(`progress/${MISSING_ID}`, { progressPercent: 10 }))
          .status,
      ).toBe(404);
      expect(
        (await mA().patch(`progress/${BAD_ID}`, { progressPercent: 10 }))
          .status,
      ).toBe(400);
    });

    // BUG-27: a murabbi can record progress on modules above their tier,
    // which they aren't allowed to view.
    it(
      "BUG-27: progress on a module above the murabbi's tier should be refused",
      async () => {
        const r = await mA().patch(`progress/${mods.t2}`, {
          progressPercent: 100,
        });
        expect(r.status).toBe(403);
      },
    );
  });

  // ── Exams & certificates ────────────────────────────────────────────────────
  describe('final assessment', () => {
    const questions = [
      { question: 'Q1', options: ['a', 'b', 'c'], correctIndex: 0 },
      { question: 'Q2', options: ['a', 'b', 'c'], correctIndex: 1 },
      { question: 'Q3', options: ['a', 'b', 'c'], correctIndex: 2 },
      { question: 'Q4', options: ['a', 'b', 'c'], correctIndex: 0 },
    ];

    it('admin upserts the tier-1 exam; murabbi cannot read answers', async () => {
      const r = await adm().post('exams', {
        tier: 1,
        title: 'Tier 1 Final',
        questions,
        passingScore: 75,
      });
      expect(r.status).toBe(201);
      expect(
        (await adm().get('exams/1')).body.data.questions[0].correctIndex,
      ).toBe(0);
      expect((await mA().get('exams/1')).status).toBe(403);
      expect((await adm().get('exams/3')).status).toBe(404);
    });

    // BUG-28: exam questions are not validated beyond "is an array" —
    // correctIndex can point past the options list (unanswerable question),
    // options can be empty, etc.
    it(
      'BUG-28: exam upsert should reject correctIndex outside the options',
      async () => {
        const r = await adm().post('exams', {
          tier: 3,
          title: 'Broken',
          questions: [{ question: 'Q', options: ['x'], correctIndex: 5 }],
        });
        expect(r.status).toBe(400);
      },
    );

    it('exam is locked until all tier modules are complete', async () => {
      const r = await mA().get('exam');
      expect(r.status).toBe(403);
      expect(
        (await mA().post('exam/submit', { answers: [0, 1, 2, 0] })).status,
      ).toBe(403);
    });

    it("murabbi cannot open a higher tier's exam", async () => {
      expect((await mA().get('exam?tier=2')).status).toBe(403);
    });

    it('after completing modules: exam visible without answers', async () => {
      await mA().patch(`progress/${mods.m1}`, { progressPercent: 100 });
      await mA().patch(`progress/${mods.m2}`, { progressPercent: 100 });
      const r = await mA().get('exam');
      expect(r.status).toBe(200);
      expect(r.body.data.questions).toHaveLength(4);
      expect(JSON.stringify(r.body.data)).not.toMatch(/correctIndex/);
    });

    it('wrong answer count → 400; failing score → no certificate', async () => {
      expect((await mA().post('exam/submit', { answers: [0] })).status).toBe(
        400,
      );
      const r = await mA().post('exam/submit', { answers: [1, 1, 1, 1] });
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ passed: false, certificate: null });
    });

    it('certificate download before passing → 404', async () => {
      expect((await mA().get('certificate/1/download')).status).toBe(404);
    });

    // BUG-29: unlimited attempts + the response returns correctCount. Changing
    // one answer at a time reveals every correct answer in at most
    // (options-1) × questions attempts, so anyone can pass without knowing
    // the material.
    it(
      'BUG-29: the exam should not be brute-forceable via correctCount over unlimited attempts',
      async () => {
        const answers = [0, 0, 0, 0];
        let base = (await mA().post('exam/submit', { answers })).body.data
          .correctCount;
        for (let q = 0; q < 4; q++) {
          for (let opt = 1; opt < 3; opt++) {
            const tryA = [...answers];
            tryA[q] = opt;
            const r = await mA().post('exam/submit', { answers: tryA });
            if (r.status !== 201) break;
            if (r.body.data.correctCount > base) {
              answers[q] = opt;
              base = r.body.data.correctCount;
              break;
            }
          }
        }
        expect(base).toBeLessThan(4); // should have been stopped before discovering everything
      },
    );

    it('passing issues one certificate (idempotent) with a downloadable PDF', async () => {
      // The BUG-29 test above used up today's failed attempts.
      await ctx.db.collection('trainingexamattempts').deleteMany({});
      const r1 = await mA().post('exam/submit', { answers: [0, 1, 2, 0] });
      expect(r1.body.data).toMatchObject({ passed: true, scorePercent: 100 });
      expect(r1.body.data.certificate.certificateNumber).toMatch(
        /^NC-T1-\d{6}$/,
      );
      const r2 = await mA().post('exam/submit', { answers: [0, 1, 2, 0] });
      expect(r2.body.data.certificate._id).toBe(r1.body.data.certificate._id);

      expect((await mA().get('my-certificates')).body.data).toHaveLength(1);
      const pdf = await mA()
        .get('certificate/1/download')
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('admin lists + revokes certificates', async () => {
      expect((await mA().get('certificates')).status).toBe(403);
      const all = await adm().get('certificates');
      expect(all.body.data[0].user.fullName).toBe('Murabbi A');
      expect(
        (await adm().del(`certificates/${all.body.data[0]._id}`)).status,
      ).toBe(200);
      expect(
        (await adm().del(`certificates/${all.body.data[0]._id}`)).status,
      ).toBe(404);
    });

    it('?tier=abc does not 500', async () => {
      const r = await mA().get('exam?tier=abc');
      expect(r.status).toBeLessThan(500);
    });
  });

  // ── Batches ─────────────────────────────────────────────────────────────────
  describe('batches', () => {
    let b1: string;

    it('create / list / page-data', async () => {
      const r = await adm().post('batches', {
        batchNumber: 1,
        status: 'active',
        day1Date: '2026-11-01',
      });
      expect(r.status).toBe(201);
      b1 = r.body.data._id;
      expect((await adm().post('batches', { batchNumber: 0 })).status).toBe(
        400,
      );
      expect((await adm().get('batches')).body.data).toHaveLength(1);
      const pd = await adm().get('page-data');
      expect(pd.body.data.stats.activeBatchNumber).toBe(1);
    });

    it('duplicate batch number → 409', async () => {
      expect((await adm().post('batches', { batchNumber: 1 })).status).toBe(
        409,
      );
    });

    // BUG-30: creating a batch with status "active" first marks every other
    // active batch "completed", THEN inserts. If the insert fails (e.g.
    // duplicate batchNumber) the currently-active batch has already been
    // closed — silent data corruption from a rejected request.
    it(
      'BUG-30: a rejected batch creation must not complete the current active batch',
      async () => {
        await adm().post('batches', { batchNumber: 1, status: 'active' }); // 409
        const all = await adm().get('batches');
        expect(all.body.data.find((b: any) => b._id === b1).status).toBe(
          'active',
        );
      },
    );

    it('candidates: add / see active batch / remove', async () => {
      await adm().patch(`batches/${b1}`, { status: 'active' });
      expect(
        (await adm().post(`batches/${b1}/candidates`, { userIds: [w.A.id] }))
          .status,
      ).toBe(201);
      const ab = await mA().get('active-batch');
      expect(ab.body.data.batch.batchNumber).toBe(1);
      expect(ab.body.data.batch.candidates).toBeUndefined();
      expect(
        (await as(w.B.token).get('active-batch')).body.data.batch,
      ).toBeNull();
      expect(
        (await adm().del(`batches/${b1}/candidates/${w.A.id}`)).status,
      ).toBe(200);
      expect((await mA().get('active-batch')).body.data.batch).toBeNull();
    });

    // BUG-31: candidate ids are not checked — non-existent users (or admins)
    // can be added to a batch and are counted in "candidates" stats.
    it(
      'BUG-31: adding a non-existent user as candidate should fail',
      async () => {
        const r = await adm().post(`batches/${b1}/candidates`, {
          userIds: [MISSING_ID],
        });
        expect(r.status).toBe(404);
      },
    );

    it('activating a batch completes the previously active one', async () => {
      const r = await adm().post('batches', { batchNumber: 2 });
      await adm().patch(`batches/${r.body.data._id}`, { status: 'active' });
      const all = (await adm().get('batches')).body.data;
      expect(all.filter((b: any) => b.status === 'active')).toHaveLength(1);
    });

    it('module delete removes it and its progress', async () => {
      const m = await createMurabbi(ctx, w.admin, 'progress.cleanup@e2e.test');
      const mod = await adm().post('modules', { title: 'Temp' });
      await as(m.token).patch(`progress/${mod.body.data._id}`, {
        progressPercent: 50,
      });
      expect(
        await ctx.db
          .collection('trainingprogresses')
          .countDocuments({ module: new Types.ObjectId(mod.body.data._id) }),
      ).toBe(1);
      expect((await adm().del(`modules/${mod.body.data._id}`)).status).toBe(
        200,
      );
      expect(
        await ctx.db
          .collection('trainingprogresses')
          .countDocuments({ module: new Types.ObjectId(mod.body.data._id) }),
      ).toBe(0);
      expect((await adm().del(`modules/${mod.body.data._id}`)).status).toBe(
        404,
      );
    });
  });
});
