import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import {
  Contribution, ContributionDocument, Contributor, ContributorDocument, Counter, CounterDocument,
  PaymentMethod,
} from './contribution.schema';
import {
  CreateContributorDto, PublicCheckoutDto, RecordPaymentDto, UpdateContributorDto, UpdatePaymentDto,
} from './contribution.dto';
import { StripeService } from './stripe.service';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.schema';
import { addMonths, currentMonth, monthOf, monthsBetween } from '../common/utils/month.util';
import { escapeRegex } from '../common/utils/regex.util';

export type MonthState = 'paid' | 'partial' | 'due' | 'overdue' | 'advance';

export interface LedgerRow {
  month   : string;
  expected: number;
  paid    : number;
  state   : MonthState;
}

@Injectable()
export class ContributionService {
  private readonly logger = new Logger(ContributionService.name);

  constructor(
    @InjectModel(Contributor.name)  private readonly contributorModel:  Model<ContributorDocument>,
    @InjectModel(Contribution.name) private readonly contributionModel: Model<ContributionDocument>,
    @InjectModel(Counter.name)      private readonly counterModel:      Model<CounterDocument>,
    @InjectModel(Parent.name)       private readonly parentModel:       Model<ParentDocument>,
    private readonly stripe       : StripeService,
    private readonly notifService : NotificationService,
  ) {}

  // ══ Helpers ════════════════════════════════════════════════════════════════

  private async nextReceiptNumber(month: string): Promise<string> {
    const key = `receipt-${month.replace('-', '')}`;
    const c = await this.counterModel.findOneAndUpdate(
      { _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true },
    ).lean();
    return `NC-${month.replace('-', '')}-${String(c.seq).padStart(5, '0')}`;
  }

  /** Months a monthly contributor is expected to pay for, up to `until`. */
  private expectedMonths(c: Contributor, until: string): string[] {
    if (c.frequency !== 'monthly' || c.status === 'pending') return [];
    const periods = c.inactivePeriods ?? [];
    return monthsBetween(c.startMonth, until)
      .filter((m) => !periods.some((p) => m >= p.from && (p.to === null || m <= p.to)));
  }

  /**
   * Month-by-month ledger: expected vs. succeeded payments.
   * paid ≥ pledge → paid · some → partial · none in current month → due ·
   * none in a past month → overdue · payment for a non-expected month → advance.
   */
  buildLedger(c: Contributor, payments: { month: string; amount: number; status: string }[]): {
    ledger: LedgerRow[]; arrears: number; totalPaid: number;
  } {
    const now = currentMonth();
    const paidBy = new Map<string, number>();
    let totalPaid = 0;
    for (const p of payments) {
      if (p.status !== 'succeeded') continue;
      paidBy.set(p.month, (paidBy.get(p.month) ?? 0) + p.amount);
      totalPaid += p.amount;
    }
    const expected = new Set(this.expectedMonths(c, now));
    const months = [...new Set([...expected, ...paidBy.keys()])].sort();
    let arrears = 0;
    const ledger = months.map((month) => {
      const paid = paidBy.get(month) ?? 0;
      const exp  = expected.has(month) ? c.monthlyPledge : 0;
      let state: MonthState;
      if (!exp)              state = 'advance';
      else if (paid >= exp)  state = 'paid';
      else if (paid > 0)     state = 'partial';
      else                   state = month === now ? 'due' : 'overdue';
      if (exp && month < now) arrears += Math.max(0, exp - paid);
      return { month, expected: exp, paid, state };
    });
    // a one-time / advance payment isn't "advance" for once-off supporters
    if (c.frequency === 'once') ledger.forEach((r) => (r.state = 'paid'));
    return { ledger: ledger.reverse(), arrears, totalPaid };
  }

  private currentState(c: Contributor, ledger: LedgerRow[]): MonthState | 'n/a' {
    if (c.frequency !== 'monthly' || c.status !== 'active') return 'n/a';
    return ledger.find((r) => r.month === currentMonth())?.state ?? 'n/a';
  }

  // ══ Contributors ═══════════════════════════════════════════════════════════

  async createContributor(dto: CreateContributorDto) {
    let fullName = dto.fullName ?? '';
    let phone    = dto.phone ?? null;
    let email    = dto.email ?? null;
    let parentId: Types.ObjectId | null = null;

    if (dto.type === 'parent') {
      const parent = await this.parentModel.findById(dto.parentId).lean();
      if (!parent) throw new NotFoundException('Parent not found.');
      const existing = await this.contributorModel.exists({ parent: parent._id, status: { $ne: 'cancelled' } });
      if (existing) throw new ConflictException('This parent already has an active contribution plan. Update it instead.');
      parentId = parent._id as Types.ObjectId;
      fullName = dto.fullName || parent.fullName;
      phone    = dto.phone ?? parent.whatsappNumber ?? parent.phone ?? null;
      email    = dto.email ?? parent.email ?? null;
    }

    const contributor = await this.contributorModel.create({
      type           : dto.type,
      parent         : parentId,
      fullName, email, phone,
      frequency      : dto.frequency ?? 'monthly',
      monthlyPledge  : dto.monthlyPledge,
      startMonth     : dto.startMonth ?? currentMonth(),
      status         : 'active',
      source         : 'admin',
      preferredMethod: dto.preferredMethod ?? 'cash',
      notes          : dto.notes ?? '',
    });
    return { message: 'Contributor added.', contributor };
  }

  async listContributors(filters: { type?: string; status?: string; search?: string }) {
    const q: Record<string, unknown> = {};
    if (filters.type)   q.type   = filters.type;
    if (filters.status) q.status = filters.status;
    if (filters.search) {
      const rx = new RegExp(escapeRegex(filters.search), 'i');
      q.$or = [{ fullName: rx }, { email: rx }, { phone: rx }];
    }
    const contributors = await this.contributorModel
      .find(q)
      .populate({ path: 'parent', select: 'fullName students', populate: { path: 'students', select: 'fullName' } })
      .sort({ createdAt: -1 })
      .lean();
    const payments = await this.contributionModel
      .find({ contributor: { $in: contributors.map((c) => c._id) } })
      .select('contributor month amount status receivedAt')
      .lean();
    const byContributor = new Map<string, typeof payments>();
    for (const p of payments) {
      const k = p.contributor.toString();
      if (!byContributor.has(k)) byContributor.set(k, []);
      byContributor.get(k)!.push(p);
    }
    const now = currentMonth();
    return contributors.map((c) => {
      const ps = byContributor.get(c._id.toString()) ?? [];
      const { ledger, arrears, totalPaid } = this.buildLedger(c as Contributor, ps);
      const lastPaymentAt = ps.filter((p) => p.status === 'succeeded')
        .reduce<Date | null>((d, p) => (!d || p.receivedAt > d ? p.receivedAt : d), null);
      return {
        ...c,
        currentMonthState: this.currentState(c as Contributor, ledger),
        paidThisMonth    : ledger.find((r) => r.month === now)?.paid ?? 0,
        arrears, totalPaid, lastPaymentAt,
      };
    });
  }

  async getContributor(id: string) {
    const c = await this.contributorModel.findById(id)
      .populate({ path: 'parent', select: 'fullName phone students', populate: { path: 'students', select: 'fullName' } })
      .lean();
    if (!c) throw new NotFoundException('Contributor not found.');
    const payments = await this.contributionModel.find({ contributor: c._id })
      .populate('recordedBy', 'fullName')
      .sort({ receivedAt: -1 })
      .lean();
    const { ledger, arrears, totalPaid } = this.buildLedger(c as Contributor, payments);
    return { contributor: c, ledger, payments, arrears, totalPaid, currentMonthState: this.currentState(c as Contributor, ledger) };
  }

  async updateContributor(id: string, dto: UpdateContributorDto) {
    const c = await this.contributorModel.findById(id);
    if (!c) throw new NotFoundException('Contributor not found.');
    const prevStatus = c.status;
    const wasInactive = prevStatus === 'paused' || prevStatus === 'cancelled';
    Object.assign(c, dto);
    if (dto.status && dto.status !== prevStatus) {
      const now = currentMonth();
      const periods = [...(c.inactivePeriods ?? [])];
      if ((dto.status === 'paused' || dto.status === 'cancelled') && !wasInactive) {
        periods.push({ from: now, to: null });
      } else if (dto.status === 'active' && wasInactive) {
        // Resume from this month: close the open inactive period at last month.
        const open = periods.find((p) => p.to === null);
        if (open) {
          open.to = addMonths(now, -1);
          if (open.to < open.from) periods.splice(periods.indexOf(open), 1);
        }
      } else if (dto.status === 'active' && prevStatus === 'pending') {
        c.startMonth = now;
      }
      c.inactivePeriods = periods;
    }
    await c.save();
    return { message: 'Contributor updated.', contributor: c.toObject() };
  }

  async deleteContributor(id: string) {
    const c = await this.contributorModel.findById(id).lean();
    if (!c) throw new NotFoundException('Contributor not found.');
    if (await this.contributionModel.exists({ contributor: c._id })) {
      throw new BadRequestException('This contributor has payment records. Cancel the plan instead of deleting, so the history is kept.');
    }
    await this.contributorModel.deleteOne({ _id: c._id });
    return { message: 'Contributor deleted.' };
  }

  // ══ Payments ═══════════════════════════════════════════════════════════════

  async recordPayment(dto: RecordPaymentDto, adminId: string) {
    const c = await this.contributorModel.findById(dto.contributorId);
    if (!c) throw new NotFoundException('Contributor not found.');
    if (dto.month > addMonths(currentMonth(), 12)) {
      throw new BadRequestException('Payments can be recorded at most 12 months in advance.');
    }
    const payment = await this.contributionModel.create({
      contributor  : c._id,
      amount       : dto.amount,
      month        : dto.month,
      method       : dto.method as PaymentMethod,
      status       : 'succeeded',
      receiptNumber: await this.nextReceiptNumber(dto.month),
      reference    : dto.reference ?? '',
      receivedAt   : dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
      recordedBy   : new Types.ObjectId(adminId),
      notes        : dto.notes ?? '',
    });
    if (c.status === 'pending') {
      c.status = 'active';
      c.startMonth = dto.month < c.startMonth ? dto.month : c.startMonth;
      await c.save();
    }
    return { message: `Payment recorded — receipt ${payment.receiptNumber}.`, payment };
  }

  listPayments(filters: { month?: string; method?: string; status?: string; contributorId?: string }) {
    const q: Record<string, unknown> = {};
    if (filters.month)  q.month  = filters.month;
    if (filters.method) q.method = filters.method;
    if (filters.status) q.status = filters.status;
    if (filters.contributorId) q.contributor = new Types.ObjectId(filters.contributorId);
    return this.contributionModel.find(q)
      .populate('contributor', 'fullName type phone email')
      .populate('recordedBy', 'fullName')
      .sort({ receivedAt: -1 })
      .limit(2000)
      .lean();
  }

  async updatePayment(id: string, dto: UpdatePaymentDto) {
    const p = await this.contributionModel.findById(id);
    if (!p) throw new NotFoundException('Payment not found.');
    if (p.method === 'stripe') {
      throw new BadRequestException('Stripe payments are refunded in the Stripe dashboard; the status updates automatically.');
    }
    if (p.status !== 'succeeded') throw new BadRequestException(`This payment is already ${p.status}.`);
    p.status = dto.status as 'refunded' | 'void';
    if (dto.notes) p.notes = dto.notes;
    await p.save();
    return { message: `Payment marked ${p.status}.`, payment: p.toObject() };
  }

  // ══ Summary ════════════════════════════════════════════════════════════════

  async summary(month: string = currentMonth()) {
    const months = monthsBetween(addMonths(month, -11), month);
    const [contributors, payments] = await Promise.all([
      this.contributorModel.find().lean(),
      this.contributionModel.find({ status: 'succeeded' }).select('contributor month amount method').lean(),
    ]);

    const trend = months.map((m) => {
      const collected = payments.filter((p) => p.month === m).reduce((s, p) => s + p.amount, 0);
      const expected = contributors
        .filter((c) => this.expectedMonths(c as Contributor, month).includes(m))
        .reduce((s, c) => s + c.monthlyPledge, 0);
      return { month: m, collected, expected };
    });
    const thisMonth = trend[trend.length - 1];

    const byMethod: Record<string, number> = {};
    for (const p of payments.filter((x) => x.month === month)) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;

    const payByContributor = new Map<string, { month: string; amount: number; status: string }[]>();
    for (const p of payments) {
      const k = p.contributor.toString();
      if (!payByContributor.has(k)) payByContributor.set(k, []);
      payByContributor.get(k)!.push({ month: p.month, amount: p.amount, status: 'succeeded' });
    }
    let overdueContributors = 0;
    let totalArrears = 0;
    for (const c of contributors) {
      const { arrears } = this.buildLedger(c as Contributor, payByContributor.get(c._id.toString()) ?? []);
      if (arrears > 0) { overdueContributors++; totalArrears += arrears; }
    }

    const paidPledgesTowardExpected = contributors
      .filter((c) => this.expectedMonths(c as Contributor, month).includes(month))
      .reduce((s, c) => {
        const paid = (payByContributor.get(c._id.toString()) ?? []).filter((p) => p.month === month).reduce((a, p) => a + p.amount, 0);
        return s + Math.min(paid, c.monthlyPledge);
      }, 0);

    return {
      month,
      collected         : thisMonth.collected,
      expected          : thisMonth.expected,
      collectionRate    : thisMonth.expected > 0 ? Math.round((paidPledgesTowardExpected / thisMonth.expected) * 100) : 0,
      byMethod,
      activeContributors: contributors.filter((c) => c.status === 'active').length,
      pendingPledges    : contributors.filter((c) => c.status === 'pending').length,
      parentContributors: contributors.filter((c) => c.type === 'parent' && c.status === 'active').length,
      overdueContributors,
      totalArrears,
      allTimeCollected  : payments.reduce((s, p) => s + p.amount, 0),
      trend,
      stripeEnabled     : this.stripe.isConfigured,
      minimumMonthly    : 250,
    };
  }

  /** Succeeded contributions for a month — used to size the reward pool. */
  async collectedInMonth(month: string): Promise<number> {
    const [r] = await this.contributionModel.aggregate([
      { $match: { month, status: 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return r?.total ?? 0;
  }

  // ══ Public website checkout ════════════════════════════════════════════════

  async publicCheckout(dto: PublicCheckoutDto, origin?: string) {
    if (dto.website) {
      this.logger.warn(`Contribution honeypot triggered (${dto.email})`);
      return { message: 'Thank you for supporting Noor Circles!', mode: 'pledge' as const };
    }

    // Reuse an existing pending website pledge from the same email to avoid duplicates.
    const contributor = await this.contributorModel.findOneAndUpdate(
      { email: dto.email, source: 'website', status: 'pending' },
      {
        $set: {
          type: 'supporter', fullName: dto.fullName, phone: dto.phone, frequency: dto.frequency,
          monthlyPledge: dto.amount, startMonth: currentMonth(), source: 'website',
          preferredMethod: this.stripe.isConfigured ? 'stripe' : 'bank_transfer',
        },
        $setOnInsert: { email: dto.email, status: 'pending' },
      },
      { upsert: true, new: true },
    );

    if (this.stripe.isConfigured) {
      const session = await this.stripe.createCheckout({
        contributorId: contributor._id.toString(),
        fullName     : dto.fullName,
        email        : dto.email,
        phone        : dto.phone,
        amount       : dto.amount,
        frequency    : dto.frequency as 'monthly' | 'once',
        returnBaseUrl: this.returnBase(origin),
      });
      return { message: 'Redirecting to secure payment…', mode: 'stripe' as const, url: session.url };
    }

    this.notifService.createForAdmins({
      type   : NotificationType.CONTRIBUTION,
      title  : 'New contribution pledge',
      message: `${dto.fullName} pledged PKR ${dto.amount.toLocaleString('en-PK')} ${dto.frequency === 'monthly' ? 'per month' : '(one-time)'} on the website. Contact them with payment details.`,
      payload: { contributorId: contributor._id.toString(), amount: dto.amount, frequency: dto.frequency },
    }).catch(() => {});
    return {
      message: 'Jazak Allahu khayran! Your pledge is recorded — the Noor Circles team will contact you with payment details.',
      mode   : 'pledge' as const,
    };
  }

  private returnBase(origin?: string): string {
    try {
      if (origin) {
        const u = new URL(origin);
        if (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return u.origin;
      }
    } catch { /* fall through */ }
    return (process.env.PUBLIC_SITE_URL || 'https://noorcircles.org').replace(/\/$/, '');
  }

  // ══ Stripe webhooks ════════════════════════════════════════════════════════

  async handleStripeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':  return this.onCheckoutCompleted(event.data.object);
      case 'invoice.paid':                return this.onInvoice(event.data.object, 'succeeded');
      case 'invoice.payment_failed':      return this.onInvoice(event.data.object, 'failed');
      case 'customer.subscription.deleted': return this.onSubscriptionDeleted(event.data.object);
      case 'charge.refunded':             return this.onRefund(event.data.object);
      default: return { ignored: event.type };
    }
  }

  private async contributorFromMetadata(meta?: Stripe.Metadata | null) {
    const id = meta?.contributorId;
    if (!id || !Types.ObjectId.isValid(id)) return null;
    return this.contributorModel.findById(id);
  }

  private async onCheckoutCompleted(s: Stripe.Checkout.Session) {
    const c = await this.contributorFromMetadata(s.metadata);
    if (!c) { this.logger.warn(`checkout.session.completed without contributor (${s.id})`); return { ignored: 'no contributor' }; }

    c.status = 'active';
    c.preferredMethod = 'stripe';
    if (typeof s.customer === 'string') c.stripeCustomerId = s.customer;
    if (typeof s.subscription === 'string') c.stripeSubscriptionId = s.subscription;
    if (c.startMonth > currentMonth()) c.startMonth = currentMonth();
    await c.save();

    // One-time payments: record the charge here (subscriptions are recorded on invoice.paid).
    if (s.mode === 'payment' && s.payment_status === 'paid' && typeof s.payment_intent === 'string') {
      await this.upsertStripePayment(
        { stripePaymentIntentId: s.payment_intent },
        { contributor: c._id, amount: Math.round((s.amount_total ?? 0) / 100), month: currentMonth(), status: 'succeeded' },
      );
    }
    this.notifyStripePayment(c, Math.round((s.amount_total ?? 0) / 100), s.mode === 'subscription');
    return { ok: true };
  }

  private async onInvoice(inv: Stripe.Invoice, status: 'succeeded' | 'failed') {
    const anyInv = inv as unknown as {
      subscription?: string | { id: string } | null;
      subscription_details?: { metadata?: Stripe.Metadata };
      parent?: { subscription_details?: { metadata?: Stripe.Metadata; subscription?: string } };
      payment_intent?: string | null;
    };
    const subId = typeof anyInv.subscription === 'string' ? anyInv.subscription
      : anyInv.subscription?.id ?? anyInv.parent?.subscription_details?.subscription ?? null;
    const meta = anyInv.subscription_details?.metadata ?? anyInv.parent?.subscription_details?.metadata;

    let c = subId ? await this.contributorModel.findOne({ stripeSubscriptionId: subId }) : null;
    if (!c) c = await this.contributorFromMetadata(meta);
    if (!c) { this.logger.warn(`invoice ${inv.id} for unknown contributor`); return { ignored: 'no contributor' }; }
    if (subId && !c.stripeSubscriptionId) { c.stripeSubscriptionId = subId; }
    if (status === 'succeeded' && c.status === 'pending') c.status = 'active';
    await c.save();

    const periodStart = inv.lines?.data?.[0]?.period?.start ?? inv.period_start ?? inv.created;
    const amount = Math.round(((status === 'succeeded' ? inv.amount_paid : inv.amount_due) ?? 0) / 100);
    await this.upsertStripePayment(
      { stripeInvoiceId: inv.id as string },
      {
        contributor: c._id, amount: Math.max(amount, 1), month: monthOf(new Date(periodStart * 1000)), status,
        stripePaymentIntentId: typeof anyInv.payment_intent === 'string' ? anyInv.payment_intent : null,
      },
    );
    return { ok: true };
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription) {
    const c = await this.contributorModel.findOne({ stripeSubscriptionId: sub.id });
    if (!c) return { ignored: 'unknown subscription' };
    if (c.status !== 'cancelled') {
      const wasInactive = c.status === 'paused';
      c.status = 'cancelled';
      if (!wasInactive) c.inactivePeriods = [...(c.inactivePeriods ?? []), { from: currentMonth(), to: null }];
      await c.save();
    }
    return { ok: true };
  }

  private async onRefund(charge: Stripe.Charge) {
    const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!pi || !charge.refunded) return { ignored: 'partial or unknown refund' };
    await this.contributionModel.updateOne({ stripePaymentIntentId: pi }, { $set: { status: 'refunded' } });
    return { ok: true };
  }

  /** Idempotent: Stripe retries webhooks, so the same invoice/intent maps to one record. */
  private async upsertStripePayment(
    key: { stripeInvoiceId?: string; stripePaymentIntentId?: string },
    data: { contributor: Types.ObjectId; amount: number; month: string; status: 'succeeded' | 'failed'; stripePaymentIntentId?: string | null },
  ) {
    const existing = await this.contributionModel.findOne(key);
    if (existing) {
      if (existing.status !== 'refunded') existing.status = data.status;
      existing.amount = data.amount;
      if (data.stripePaymentIntentId) existing.stripePaymentIntentId = data.stripePaymentIntentId;
      await existing.save();
      return existing;
    }
    try {
      return await this.contributionModel.create({
        ...key, ...data, method: 'stripe', receiptNumber: await this.nextReceiptNumber(data.month), receivedAt: new Date(),
      });
    } catch (err: any) {
      if (err?.code === 11000) return this.contributionModel.findOne(key); // concurrent retry
      throw err;
    }
  }

  private notifyStripePayment(c: ContributorDocument, amount: number, monthly: boolean) {
    this.notifService.createForAdmins({
      type   : NotificationType.CONTRIBUTION,
      title  : monthly ? 'New monthly contributor (Stripe)' : 'New contribution (Stripe)',
      message: `${c.fullName} contributed PKR ${amount.toLocaleString('en-PK')}${monthly ? ' per month' : ''} via Stripe.`,
      payload: { contributorId: c._id.toString(), amount },
    }).catch(() => {});
  }
}
