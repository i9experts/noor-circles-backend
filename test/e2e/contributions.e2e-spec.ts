import Stripe from 'stripe';
import {
  API,
  bearer,
  createApp,
  E2EContext,
  MISSING_ID,
  seedWorld,
} from './helpers';
import { StripeService } from '../../src/contribution/stripe.service';
import { addMonths, currentMonth } from '../../src/common/utils/month.util';

const NOW = currentMonth();

describe('Contributions (Stripe not configured)', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  let parentId: string;

  beforeAll(async () => {
    ctx = await createApp('contrib');
    w = await seedWorld(ctx);
    const p = await ctx
      .http()
      .post(`${API}/parents`)
      .set(bearer(w.admin))
      .send({
        fullName: 'Imran Khan',
        phone: '03001112233',
        whatsappNumber: '03004445566',
        email: 'imran@example.com',
        studentIds: [w.studentA],
      });
    parentId = p.body.data.parent._id;
  });
  afterAll(async () => ctx.close());

  const adm = () => ({
    get: (p: string) =>
      ctx.http().get(`${API}/contributions/${p}`).set(bearer(w.admin)),
    post: (p: string, b: object) =>
      ctx.http().post(`${API}/contributions/${p}`).set(bearer(w.admin)).send(b),
    patch: (p: string, b: object) =>
      ctx
        .http()
        .patch(`${API}/contributions/${p}`)
        .set(bearer(w.admin))
        .send(b),
    del: (p: string) =>
      ctx.http().delete(`${API}/contributions/${p}`).set(bearer(w.admin)),
  });

  it('is admin-only', async () => {
    for (const p of ['summary', 'contributors', 'payments']) {
      expect((await ctx.http().get(`${API}/contributions/${p}`)).status).toBe(
        401,
      );
      expect(
        (
          await ctx
            .http()
            .get(`${API}/contributions/${p}`)
            .set(bearer(w.A.token))
        ).status,
      ).toBe(403);
    }
  });

  describe('contributors', () => {
    let parentContrib: string;

    it('enforces the PKR 250 monthly minimum (no maximum cap below 10M)', async () => {
      const r = await adm().post('contributors', {
        type: 'supporter',
        fullName: 'Low',
        monthlyPledge: 249,
      });
      expect(r.status).toBe(400);
      expect(r.body.errors.join(' ')).toMatch(
        /Minimum monthly contribution is PKR 250/,
      );
      expect(
        (
          await adm().post('contributors', {
            type: 'supporter',
            fullName: 'Decimal',
            monthlyPledge: 250.5,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await adm().post('contributors', {
            type: 'supporter',
            fullName: 'Big Giver',
            monthlyPledge: 2_500_000,
          })
        ).status,
      ).toBe(201);
    });

    it('parent contributor defaults name, WhatsApp number and email from the parent record', async () => {
      const r = await adm().post('contributors', {
        type: 'parent',
        parentId,
        monthlyPledge: 500,
      });
      expect(r.status).toBe(201);
      expect(r.body.data.contributor).toMatchObject({
        type: 'parent',
        fullName: 'Imran Khan',
        phone: '03004445566',
        email: 'imran@example.com',
        monthlyPledge: 500,
        startMonth: NOW,
        status: 'active',
      });
      parentContrib = r.body.data.contributor._id;
    });

    it('one active plan per parent; unknown parent → 404; parent type needs parentId', async () => {
      expect(
        (
          await adm().post('contributors', {
            type: 'parent',
            parentId,
            monthlyPledge: 300,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await adm().post('contributors', {
            type: 'parent',
            parentId: MISSING_ID,
            monthlyPledge: 300,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await adm().post('contributors', {
            type: 'parent',
            monthlyPledge: 300,
          })
        ).status,
      ).toBe(400);
    });

    it("list shows the parent's children and current-month state", async () => {
      const r = await adm().get('contributors?type=parent');
      const c = r.body.data.find((x: any) => x._id === parentContrib);
      expect(c.parent.students[0].fullName).toBe('Student A');
      expect(c.currentMonthState).toBe('due');
      expect(c.arrears).toBe(0);
    });

    it('records payments with sequential receipts; partial then paid', async () => {
      const p1 = await adm().post('payments', {
        contributorId: parentContrib,
        amount: 200,
        month: NOW,
        method: 'cash',
      });
      expect(p1.status).toBe(201);
      expect(p1.body.data.payment.receiptNumber).toBe(
        `NC-${NOW.replace('-', '')}-00001`,
      );
      let d = await adm().get(`contributors/${parentContrib}`);
      expect(d.body.data.currentMonthState).toBe('partial');

      const p2 = await adm().post('payments', {
        contributorId: parentContrib,
        amount: 300,
        month: NOW,
        method: 'jazzcash',
        reference: 'JC-778899',
      });
      expect(p2.body.data.payment.receiptNumber).toBe(
        `NC-${NOW.replace('-', '')}-00002`,
      );
      d = await adm().get(`contributors/${parentContrib}`);
      expect(d.body.data.currentMonthState).toBe('paid');
      expect(d.body.data.totalPaid).toBe(500);
      expect(d.body.data.payments[0].recordedBy.fullName).toBe('Test Admin');
    });

    it("payment validation: stripe can't be recorded manually, >12 months ahead rejected, bad month", async () => {
      expect(
        (
          await adm().post('payments', {
            contributorId: parentContrib,
            amount: 500,
            month: NOW,
            method: 'stripe',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await adm().post('payments', {
            contributorId: parentContrib,
            amount: 500,
            month: addMonths(NOW, 13),
            method: 'cash',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await adm().post('payments', {
            contributorId: parentContrib,
            amount: 500,
            month: '2026-13',
            method: 'cash',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await adm().post('payments', {
            contributorId: MISSING_ID,
            amount: 500,
            month: NOW,
            method: 'cash',
          })
        ).status,
      ).toBe(404);
    });

    it('arrears: missed past months are overdue, current month due', async () => {
      const r = await adm().post('contributors', {
        type: 'supporter',
        fullName: 'Late Payer',
        monthlyPledge: 1000,
        startMonth: addMonths(NOW, -2),
      });
      const id = r.body.data.contributor._id;
      await adm().post('payments', {
        contributorId: id,
        amount: 400,
        month: addMonths(NOW, -1),
        method: 'bank_transfer',
      });
      const d = await adm().get(`contributors/${id}`);
      expect(d.body.data.ledger.map((x: any) => [x.month, x.state])).toEqual([
        [NOW, 'due'],
        [addMonths(NOW, -1), 'partial'],
        [addMonths(NOW, -2), 'overdue'],
      ]);
      expect(d.body.data.arrears).toBe(1000 + 600);
    });

    it('advance payments for future months show as advance and count toward that month', async () => {
      const r = await adm().post('contributors', {
        type: 'supporter',
        fullName: 'Early Bird',
        monthlyPledge: 300,
      });
      const id = r.body.data.contributor._id;
      await adm().post('payments', {
        contributorId: id,
        amount: 300,
        month: addMonths(NOW, 1),
        method: 'cash',
      });
      const d = await adm().get(`contributors/${id}`);
      expect(
        d.body.data.ledger.find((x: any) => x.month === addMonths(NOW, 1))
          .state,
      ).toBe('advance');
    });

    it('pausing stops expectations; resuming in the same month restores them', async () => {
      const r = await adm().post('contributors', {
        type: 'supporter',
        fullName: 'Pauser',
        monthlyPledge: 300,
      });
      const id = r.body.data.contributor._id;
      await adm().patch(`contributors/${id}`, { status: 'paused' });
      let d = await adm().get(`contributors/${id}`);
      expect(d.body.data.ledger).toHaveLength(0);
      expect(d.body.data.currentMonthState).toBe('n/a');
      await adm().patch(`contributors/${id}`, { status: 'active' });
      d = await adm().get(`contributors/${id}`);
      expect(d.body.data.currentMonthState).toBe('due');
      expect(d.body.data.contributor.inactivePeriods).toEqual([]);
    });

    it("refunded / void payments stop counting; can't refund twice", async () => {
      const r = await adm().post('contributors', {
        type: 'supporter',
        fullName: 'Refundee',
        monthlyPledge: 250,
      });
      const id = r.body.data.contributor._id;
      const p = await adm().post('payments', {
        contributorId: id,
        amount: 250,
        month: NOW,
        method: 'cash',
      });
      expect(
        (
          await adm().patch(`payments/${p.body.data.payment._id}`, {
            status: 'refunded',
            notes: 'Paid twice',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await adm().patch(`payments/${p.body.data.payment._id}`, {
            status: 'void',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await adm().patch(`payments/${p.body.data.payment._id}`, {
            status: 'succeeded',
          })
        ).status,
      ).toBe(400);
      const d = await adm().get(`contributors/${id}`);
      expect(d.body.data.currentMonthState).toBe('due');
    });

    it("a contributor with payments can't be deleted (cancel instead); one without can", async () => {
      expect((await adm().del(`contributors/${parentContrib}`)).status).toBe(
        400,
      );
      const r = await adm().post('contributors', {
        type: 'supporter',
        fullName: 'Typo',
        monthlyPledge: 250,
      });
      expect(
        (await adm().del(`contributors/${r.body.data.contributor._id}`)).status,
      ).toBe(200);
    });

    it('search + payments filters', async () => {
      expect(
        (await adm().get('contributors?search=late')).body.data.map(
          (c: any) => c.fullName,
        ),
      ).toEqual(['Late Payer']);
      const jc = await adm().get(`payments?method=jazzcash&month=${NOW}`);
      expect(jc.body.data).toHaveLength(1);
      expect(jc.body.data[0].reference).toBe('JC-778899');
      expect((await adm().get('payments?month=bad')).status).toBe(400);
    });
  });

  describe('summary', () => {
    it('collected, expected, collection rate, arrears and 12-month trend', async () => {
      const r = await adm().get('summary');
      expect(r.status).toBe(200);
      const s = r.body.data;
      expect(s.month).toBe(NOW);
      expect(s.trend).toHaveLength(12);
      expect(s.collected).toBe(500); // parent 200+300 (refund excluded, advance is next month)
      expect(s.byMethod).toEqual({ cash: 200, jazzcash: 300 });
      expect(s.expected).toBeGreaterThan(0);
      expect(s.overdueContributors).toBeGreaterThanOrEqual(1);
      expect(s.totalArrears).toBeGreaterThanOrEqual(1600);
      expect(s.stripeEnabled).toBe(false);
      expect(s.minimumMonthly).toBe(250);
    });
  });

  describe('public "Support Noor Circles" form (no Stripe → pledge)', () => {
    const body = {
      fullName: 'Sara Ahmed',
      email: 'Sara@Example.com',
      phone: '+92 300 7654321',
      amount: 1000,
      frequency: 'monthly',
    };

    it('validates: minimum PKR 250, frequency, contact details', async () => {
      const r = await ctx
        .http()
        .post(`${API}/contributions/public/checkout`)
        .send({ ...body, amount: 100, frequency: 'weekly', email: 'x' });
      expect(r.status).toBe(400);
      expect(r.body.errors.join(' ')).toMatch(
        /minimum contribution is PKR 250/,
      );
    });

    it('records a pending pledge, notifies admins, and allows any website origin', async () => {
      const r = await ctx
        .http()
        .post(`${API}/contributions/public/checkout`)
        .set('Origin', 'https://noorcircles.example')
        .send(body);
      expect(r.status).toBe(201);
      expect(r.body.data.mode).toBe('pledge');
      expect(r.headers['access-control-allow-origin']).toBe(
        'https://noorcircles.example',
      );
      const list = await adm().get('contributors?status=pending');
      const c = list.body.data.find((x: any) => x.email === 'sara@example.com');
      expect(c).toMatchObject({
        source: 'website',
        type: 'supporter',
        monthlyPledge: 1000,
        status: 'pending',
        currentMonthState: 'n/a',
      });
      const n = await ctx
        .http()
        .get(`${API}/notifications`)
        .set(bearer(w.admin));
      expect(
        n.body.data.some(
          (x: any) =>
            x.type === 'contribution' &&
            /Sara Ahmed pledged PKR 1,000 per month/.test(x.message),
        ),
      ).toBe(true);
    });

    it('resubmitting updates the same pending pledge instead of duplicating', async () => {
      await ctx
        .http()
        .post(`${API}/contributions/public/checkout`)
        .send({ ...body, amount: 1500 });
      const list = await adm().get('contributors?search=sara@example.com');
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].monthlyPledge).toBe(1500);
    });

    it('honeypot submissions are dropped', async () => {
      await ctx
        .http()
        .post(`${API}/contributions/public/checkout`)
        .send({ ...body, email: 'bot@example.com', website: 'x' });
      expect(
        (await adm().get('contributors?search=bot@example.com')).body.data,
      ).toHaveLength(0);
    });

    it('recording the first payment activates a pending pledge', async () => {
      const c = (await adm().get('contributors?search=sara@example.com')).body
        .data[0];
      await adm().post('payments', {
        contributorId: c._id,
        amount: 1500,
        month: NOW,
        method: 'bank_transfer',
        reference: 'HBL-123',
      });
      const d = await adm().get(`contributors/${c._id}`);
      expect(d.body.data.contributor.status).toBe('active');
      expect(d.body.data.currentMonthState).toBe('paid');
    });
  });
});

describe('Contributions with Stripe', () => {
  const WEBHOOK_SECRET = 'whsec_e2e_test_secret';
  let ctx: E2EContext;
  let admin: string;
  let checkoutSpy: jest.SpyInstance;

  beforeAll(async () => {
    ctx = await createApp('contrib_stripe', {
      env: {
        STRIPE_SECRET_KEY: 'sk_test_e2e_dummy',
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
    });
    admin = (await seedWorld(ctx)).admin;
    // The sandbox can't reach api.stripe.com: fake only the outbound call.
    checkoutSpy = jest
      .spyOn(ctx.app.get(StripeService), 'createCheckout')
      .mockResolvedValue({
        id: 'cs_test_1',
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      });
  });
  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = '';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    await ctx.close();
  });

  const send = (event: object, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    return ctx
      .http()
      .post(`${API}/contributions/stripe/webhook`)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', header)
      .send(payload);
  };
  const ev = (type: string, object: object) => ({
    id: `evt_${Math.random()}`,
    object: 'event',
    type,
    data: { object },
  });
  const contributors = async () =>
    (
      await ctx
        .http()
        .get(`${API}/contributions/contributors`)
        .set(bearer(admin))
    ).body.data;
  const payments = async () =>
    (await ctx.http().get(`${API}/contributions/payments`).set(bearer(admin)))
      .body.data;

  let monthlyId: string;

  it('public checkout returns a Stripe URL and passes the contributor + return URL', async () => {
    const r = await ctx
      .http()
      .post(`${API}/contributions/public/checkout`)
      .set('Origin', 'https://noorcircles.example')
      .send({
        fullName: 'Bilal Ahmed',
        email: 'bilal@example.com',
        phone: '03001234567',
        amount: 750,
        frequency: 'monthly',
      });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      mode: 'stripe',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
    const arg = checkoutSpy.mock.calls[0][0];
    expect(arg).toMatchObject({
      amount: 750,
      frequency: 'monthly',
      email: 'bilal@example.com',
      returnBaseUrl: 'https://noorcircles.example',
    });
    monthlyId = arg.contributorId;
    expect(
      (await contributors()).find((c: any) => c._id === monthlyId).status,
    ).toBe('pending');
  });

  it('rejects webhooks without / with a wrong signature', async () => {
    expect(
      (
        await ctx
          .http()
          .post(`${API}/contributions/stripe/webhook`)
          .send({ type: 'x' })
      ).status,
    ).toBe(400);
    expect((await send(ev('invoice.paid', {}), 'whsec_wrong')).status).toBe(
      400,
    );
  });

  it('checkout.session.completed (subscription) activates and links the subscription', async () => {
    const r = await send(
      ev('checkout.session.completed', {
        id: 'cs_test_1',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        amount_total: 75000,
        customer: 'cus_123',
        subscription: 'sub_123',
        metadata: { contributorId: monthlyId },
      }),
    );
    expect(r.status).toBe(200);
    const c = (await contributors()).find((x: any) => x._id === monthlyId);
    expect(c).toMatchObject({
      status: 'active',
      stripeSubscriptionId: 'sub_123',
      stripeCustomerId: 'cus_123',
      preferredMethod: 'stripe',
    });
  });

  it('invoice.paid records one payment per invoice, even if Stripe retries the event', async () => {
    const start = Math.floor(Date.now() / 1000);
    const inv = {
      id: 'in_1',
      object: 'invoice',
      subscription: 'sub_123',
      amount_paid: 75000,
      amount_due: 75000,
      period_start: start,
      created: start,
      lines: { data: [{ period: { start, end: start + 2_592_000 } }] },
      payment_intent: 'pi_sub_1',
    };
    expect((await send(ev('invoice.paid', inv))).status).toBe(200);
    expect((await send(ev('invoice.paid', inv))).status).toBe(200);
    const mine = (await payments()).filter(
      (p: any) => p.contributor._id === monthlyId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      amount: 750,
      method: 'stripe',
      status: 'succeeded',
      month: NOW,
      stripeInvoiceId: 'in_1',
    });
    expect(mine[0].receiptNumber).toMatch(/^NC-\d{6}-\d{5}$/);
  });

  it('a failed invoice that later succeeds stays a single record', async () => {
    const start = Math.floor(Date.now() / 1000);
    const base = {
      id: 'in_2',
      object: 'invoice',
      subscription: 'sub_123',
      amount_due: 75000,
      period_start: start,
      created: start,
      lines: { data: [] },
    };
    await send(ev('invoice.payment_failed', { ...base, amount_paid: 0 }));
    let p = (await payments()).filter((x: any) => x.stripeInvoiceId === 'in_2');
    expect(p).toHaveLength(1);
    expect(p[0].status).toBe('failed');
    await send(ev('invoice.paid', { ...base, amount_paid: 75000 }));
    p = (await payments()).filter((x: any) => x.stripeInvoiceId === 'in_2');
    expect(p).toHaveLength(1);
    expect(p[0].status).toBe('succeeded');
  });

  it("stripe payments can't be refunded manually; charge.refunded updates them", async () => {
    const p = (await payments()).find((x: any) => x.stripeInvoiceId === 'in_1');
    expect(
      (
        await ctx
          .http()
          .patch(`${API}/contributions/payments/${p._id}`)
          .set(bearer(admin))
          .send({ status: 'refunded' })
      ).status,
    ).toBe(400);
    await send(
      ev('charge.refunded', {
        id: 'ch_1',
        object: 'charge',
        payment_intent: 'pi_sub_1',
        refunded: true,
      }),
    );
    expect(
      (await payments()).find((x: any) => x.stripeInvoiceId === 'in_1').status,
    ).toBe('refunded');
  });

  it('one-time checkout records the payment from checkout.session.completed', async () => {
    await ctx.http().post(`${API}/contributions/public/checkout`).send({
      fullName: 'One Off',
      email: 'oneoff@example.com',
      phone: '03001234567',
      amount: 5000,
      frequency: 'once',
    });
    const id =
      checkoutSpy.mock.calls[checkoutSpy.mock.calls.length - 1][0]
        .contributorId;
    await send(
      ev('checkout.session.completed', {
        id: 'cs_test_2',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 500000,
        customer: null,
        subscription: null,
        payment_intent: 'pi_once_1',
        metadata: { contributorId: id },
      }),
    );
    const p = (await payments()).filter((x: any) => x.contributor._id === id);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      amount: 5000,
      status: 'succeeded',
      stripePaymentIntentId: 'pi_once_1',
    });
    const c = (await contributors()).find((x: any) => x._id === id);
    expect(c).toMatchObject({
      frequency: 'once',
      status: 'active',
      currentMonthState: 'n/a',
      arrears: 0,
    });
  });

  it('customer.subscription.deleted cancels the plan', async () => {
    await send(
      ev('customer.subscription.deleted', {
        id: 'sub_123',
        object: 'subscription',
      }),
    );
    const c = (await contributors()).find((x: any) => x._id === monthlyId);
    expect(c.status).toBe('cancelled');
    expect(c.currentMonthState).toBe('n/a');
  });

  it('unknown events are acknowledged and ignored', async () => {
    const r = await send(ev('customer.created', { id: 'cus_x' }));
    expect(r.status).toBe(200);
    expect(r.body.data.ignored).toBe('customer.created');
  });

  it('summary reports Stripe as enabled', async () => {
    expect(
      (await ctx.http().get(`${API}/contributions/summary`).set(bearer(admin)))
        .body.data.stripeEnabled,
    ).toBe(true);
  });
});
