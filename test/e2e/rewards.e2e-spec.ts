import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';
import { currentMonth } from '../../src/common/utils/month.util';
import {
  EngagementService,
  RATING_WEIGHTS,
} from '../../src/engagement/engagement.service';
import { proportional } from '../../src/rewards/rewards.service';

const NOW = currentMonth();

describe('Murabbi engagement rating + monthly reward pool', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) =>
      ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) =>
      ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);

  beforeAll(async () => {
    ctx = await createApp('rewards');
    w = await seedWorld(ctx);

    // Murabbi A: one session this month (student present), a review, parent feedback, half the training.
    await as(w.A.token).post('attendance', {
      circle: w.circleA,
      sessionNumber: 1,
      sessionDate: new Date().toISOString(),
      records: [{ student: w.studentA, status: 'present' }],
    });
    await adm().post('performance/reviews', {
      murabbiId: w.A.id,
      circleId: w.circleA,
      sessionNumber: 1,
      stars: 5,
      honestyScore: 90,
      gratitudeScore: 90,
      empathyScore: 90,
      identityScore: 90,
      familyScore: 90,
      consistencyScore: 90,
    });
    const parent = await adm().post('parents', {
      fullName: 'Parent A',
      phone: '03001234567',
      studentIds: [w.studentA],
    });
    await adm().post(`parents/${parent.body.data.parent._id}/feedback`, {
      message: 'Wonderful',
      stars: 4,
      sessionNumber: 1,
    });
    const m1 = await adm().post('training/modules', {
      title: 'M1',
      minTier: 1,
    });
    await adm().post('training/modules', { title: 'M2', minTier: 1 });
    await as(w.A.token).patch(`training/progress/${m1.body.data._id}`, {
      progressPercent: 100,
    });
    // Murabbi B: has a circle but submitted nothing and no training.

    // Points this month: Student A 50, Student B 100
    await adm().post('incentives', {
      studentId: w.studentA,
      awardType: 'noor-star',
    });
    await adm().post('incentives', {
      studentId: w.studentB,
      awardType: 'circle-champion',
    });

    // Contributions this month: PKR 10,000
    const c = await adm().post('contributions/contributors', {
      type: 'supporter',
      fullName: 'Donor',
      monthlyPledge: 10000,
    });
    await adm().post('contributions/payments', {
      contributorId: c.body.data.contributor._id,
      amount: 10000,
      month: NOW,
      method: 'bank_transfer',
    });
  });
  afterAll(async () => ctx.close());

  // ── Engagement rating ─────────────────────────────────────────────────────
  describe('engagement rating', () => {
    it('unit: weights rescale over the components that have data', () => {
      const comps: any[] = [
        { key: 'sessions', weight: 25, score: 100 },
        { key: 'attendance', weight: 25, score: 50 },
        { key: 'reviews', weight: 20, score: null },
        { key: 'feedback', weight: 15, score: null },
        { key: 'training', weight: 15, score: null },
      ];
      expect(EngagementService.autoScore(comps)).toBe(75);
      expect(
        EngagementService.autoScore(comps.map((c) => ({ ...c, score: null }))),
      ).toBe(0);
      expect(Object.values(RATING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(
        100,
      );
    });

    it('ranks murabbis with a per-component breakdown', async () => {
      const r = await adm().get(`engagement/ratings?month=${NOW}`);
      expect(r.status).toBe(200);
      const [first, second] = r.body.data;
      expect(first.murabbi.fullName).toBe('Murabbi A');
      expect(first.rank).toBe(1);
      const byKey = Object.fromEntries(
        first.components.map((c: any) => [c.key, c]),
      );
      expect(byKey.sessions.score).toBeGreaterThan(0);
      expect(byKey.attendance).toMatchObject({
        score: 100,
        detail: '1 of 1 present',
      });
      expect(byKey.reviews.score).toBe(90);
      expect(byKey.feedback.score).toBe(80);
      expect(byKey.training).toMatchObject({
        score: 50,
        detail: '1 of 2 modules complete',
      });
      expect(first.autoScore).toBe(
        EngagementService.autoScore(first.components),
      );
      expect(first.finalScore).toBe(first.autoScore);
      expect(first.stars).toBe(Math.round(first.finalScore / 10) / 2);

      expect(second.murabbi.fullName).toBe('Murabbi B');
      const bKey = Object.fromEntries(
        second.components.map((c: any) => [c.key, c]),
      );
      expect(bKey.sessions.score).toBe(0); // expected sessions, none submitted
      expect(bKey.attendance.score).toBeNull();
      expect(bKey.reviews.score).toBeNull();
      expect(second.finalScore).toBeLessThan(first.finalScore);
    });

    it('admin adjustment (−20…+20) is applied, kept on recompute, and validated', async () => {
      const before = (
        await adm().get(`engagement/ratings?month=${NOW}`)
      ).body.data.find((r: any) => r.murabbi.fullName === 'Murabbi B');
      const r = await adm().patch(`engagement/ratings/${w.B.id}?month=${NOW}`, {
        adjustment: 15,
        note: 'Covered extra circle',
      });
      expect(r.status).toBe(200);
      expect(r.body.data.rating).toMatchObject({
        adjustment: 15,
        adjustmentNote: 'Covered extra circle',
        finalScore: Math.min(100, before.autoScore + 15),
      });
      const again = (
        await adm().get(`engagement/ratings?month=${NOW}`)
      ).body.data.find((x: any) => x.murabbi.fullName === 'Murabbi B');
      expect(again.adjustment).toBe(15);
      expect(
        (await adm().patch(`engagement/ratings/${w.B.id}`, { adjustment: 25 }))
          .status,
      ).toBe(400);
      expect(
        (
          await adm().patch(`engagement/ratings/${w.A.id}?month=13-2026`, {
            adjustment: 1,
          })
        ).status,
      ).toBe(400);
      expect(
        (await adm().patch('engagement/ratings/bad-id', { adjustment: 1 }))
          .status,
      ).toBe(400);
      // reset for the reward tests
      await adm().patch(`engagement/ratings/${w.B.id}?month=${NOW}`, {
        adjustment: 0,
      });
    });

    it('murabbis see only their own rating; ranking is admin-only', async () => {
      expect((await as(w.A.token).get('engagement/ratings')).status).toBe(403);
      const my = await as(w.A.token).get('engagement/my');
      expect(my.status).toBe(200);
      expect(my.body.data.murabbi).toBe(w.A.id);
      expect(my.body.data.components).toHaveLength(5);
    });
  });

  // ── Reward pool ───────────────────────────────────────────────────────────
  describe('reward pool', () => {
    it('unit: proportional split rounds down to PKR 10', () => {
      expect(proportional(1200, [50, 100])).toEqual([400, 800]);
      expect(proportional(1000, [1, 1, 1])).toEqual([330, 330, 330]);
      expect(proportional(0, [5])).toEqual([0]);
      expect(proportional(500, [0, 0])).toEqual([0, 0]);
    });

    it('validates input and is admin-only', async () => {
      expect((await as(w.A.token).get('rewards/pools')).status).toBe(403);
      expect(
        (
          await adm().post('rewards/pools', {
            month: NOW,
            budgetMode: 'percent',
            budgetValue: 150,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await adm().post('rewards/pools', {
            month: '2026-1',
            budgetMode: 'fixed',
            budgetValue: 100,
          })
        ).status,
      ).toBe(400);
    });

    it('creates a pool from 20% of contributions and proposes rewards by points and rating', async () => {
      const r = await adm().post('rewards/pools', {
        month: NOW,
        budgetMode: 'percent',
        budgetValue: 20,
        studentSharePct: 60,
        minMurabbiScore: 0,
      });
      expect(r.status).toBe(201);
      const { pool, allocations, totals } = r.body.data;
      expect(pool).toMatchObject({
        contributionsCollected: 10000,
        budget: 2000,
        status: 'draft',
      });
      expect(totals).toMatchObject({ studentBudget: 1200, murabbiBudget: 800 });

      const students = allocations.filter(
        (a: any) => a.recipientType === 'student',
      );
      expect(
        students.map((a: any) => [a.student.fullName, a.basisValue, a.amount]),
      ).toEqual([
        ['Student B', 100, 800],
        ['Student A', 50, 400],
      ]);
      const murabbis = allocations.filter(
        (a: any) => a.recipientType === 'murabbi',
      );
      expect(murabbis[0].murabbi.fullName).toBe('Murabbi A');
      expect(
        murabbis.reduce((s: number, a: any) => s + a.amount, 0),
      ).toBeLessThanOrEqual(800);
      expect(totals.allocated).toBeLessThanOrEqual(2000);
    });

    it('one pool per month', async () => {
      expect(
        (
          await adm().post('rewards/pools', {
            month: NOW,
            budgetMode: 'fixed',
            budgetValue: 1000,
          })
        ).status,
      ).toBe(409);
    });

    it('admin edits: over-budget approval is refused, manual additions, no duplicates', async () => {
      const { allocations } = (await adm().get(`rewards/pools/${NOW}`)).body
        .data;
      const sB = allocations.find(
        (a: any) => a.student?.fullName === 'Student B',
      );
      await adm().patch(`rewards/allocations/${sB._id}`, { amount: 5000 });
      const refused = await adm().post(`rewards/pools/${NOW}/approve`);
      expect(refused.status).toBe(400);
      expect(refused.body.message).toMatch(/exceeds the budget of PKR 2,000/);
      await adm().patch(`rewards/allocations/${sB._id}`, { amount: 600 });

      const dup = await adm().post(`rewards/pools/${NOW}/allocations`, {
        recipientType: 'student',
        recipientId: w.studentB,
        amount: 10,
      });
      expect(dup.status).toBe(409);
      const extra = await w.mkStudent('Kind Kid', w.circleA);
      const add = await adm().post(`rewards/pools/${NOW}/allocations`, {
        recipientType: 'student',
        recipientId: extra,
        amount: 100,
        notes: 'Helped clean the masjid',
      });
      expect(add.status).toBe(201);
      expect(
        add.body.data.allocations.find((a: any) => a.student?._id === extra),
      ).toMatchObject({ manual: true, amount: 100 });
    });

    it('regenerate keeps manual additions and recomputes the rest', async () => {
      const r = await adm().post(`rewards/pools/${NOW}/regenerate`);
      const all = r.body.data.allocations;
      expect(
        all.find((a: any) => a.student?.fullName === 'Student B').amount,
      ).toBe(800);
      expect(
        all.find((a: any) => a.student?.fullName === 'Kind Kid').amount,
      ).toBe(100);
      // 1200 student + up to 800 murabbi + 100 manual can exceed 2000 → trim manual for approval
      if (r.body.data.totals.allocated > 2000) {
        const kid = all.find((a: any) => a.student?.fullName === 'Kind Kid');
        await adm().patch(`rewards/allocations/${kid._id}`, {
          status: 'cancelled',
        });
      }
    });

    it('approve → locks edits; pay each → completed; murabbi notified and sees it', async () => {
      const ok = await adm().post(`rewards/pools/${NOW}/approve`);
      expect(ok.status).toBe(201);
      expect(ok.body.data.pool.status).toBe('approved');
      const live = ok.body.data.allocations.filter(
        (a: any) => a.status === 'approved',
      );
      expect(live.length).toBeGreaterThan(0);

      expect(
        (await adm().patch(`rewards/allocations/${live[0]._id}`, { amount: 1 }))
          .status,
      ).toBe(400);
      expect((await adm().del(`rewards/pools/${NOW}`)).status).toBe(400);
      expect(
        (
          await adm().post(`rewards/allocations/${live[0]._id}/pay`, {
            method: 'bitcoin',
          })
        ).status,
      ).toBe(400);

      let last: any;
      for (const a of live) {
        last = await adm().post(`rewards/allocations/${a._id}/pay`, {
          method: a.recipientType === 'student' ? 'gift' : 'jazzcash',
          reference: 'R-1',
        });
        expect(last.status).toBe(201);
      }
      expect(last.body.data.pool.status).toBe('completed');
      expect(last.body.data.totals.paid).toBe(last.body.data.totals.allocated);
      expect(
        (
          await adm().post(`rewards/allocations/${live[0]._id}/pay`, {
            method: 'cash',
          })
        ).status,
      ).toBe(400);

      const n = await as(w.A.token).get('notifications');
      expect(
        n.body.data.some(
          (x: any) =>
            x.type === 'reward' &&
            /You received a reward of PKR/.test(x.message),
        ),
      ).toBe(true);
      const mine = await as(w.A.token).get('rewards/my');
      expect(mine.body.data[0]).toMatchObject({
        month: NOW,
        status: 'paid',
        method: 'jazzcash',
      });
    });

    it('pool list summarises allocated vs paid', async () => {
      const r = await adm().get('rewards/pools');
      expect(r.body.data[0]).toMatchObject({ month: NOW, status: 'completed' });
      expect(r.body.data[0].paid).toBe(r.body.data[0].allocated);
    });

    it('a draft pool for another month can be deleted; fixed budgets ignore contributions', async () => {
      const r = await adm().post('rewards/pools', {
        month: '2025-01',
        budgetMode: 'fixed',
        budgetValue: 3000,
      });
      expect(r.body.data.pool).toMatchObject({
        budget: 3000,
        contributionsCollected: 0,
      });
      expect(r.body.data.allocations).toHaveLength(0); // no points/ratings recorded in 2025-01 above the threshold
      expect((await adm().del('rewards/pools/2025-01')).status).toBe(200);
      expect((await adm().get('rewards/pools/2025-01')).status).toBe(404);
    });
  });
});
