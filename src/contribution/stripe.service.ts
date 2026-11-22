import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Shown on donors' card statements. Letters, digits and spaces only; at most 22 characters. */
export const DESCRIPTOR = 'NOOR CIRCLES';
/** Our own product id for monthly gifts, so it's found again rather than duplicated. */
export const MONTHLY_PRODUCT_ID = 'noor-circles-monthly-contribution';

export interface CheckoutInput {
  contributorId: string;
  fullName     : string;
  email        : string;
  phone        : string;
  amount       : number; // PKR
  frequency    : 'monthly' | 'once';
  returnBaseUrl: string; // e.g. https://noorcircles.org
}

/**
 * Thin wrapper around the Stripe SDK. Stays dormant until both
 * STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set, so the rest of the
 * contributions module works (manual payments, website pledges) without it.
 *
 * Note: Stripe isn't available to Pakistan-registered businesses; the
 * account must belong to an entity in a supported country. Charges are in
 * PKR (amounts sent in paisa).
 *
 * The Stripe account is shared with other businesses, so Noor Circles payments
 * carry their own statement descriptor: "NOOR CIRCLES" as the card suffix on
 * one-off gifts (shown after the account's prefix, e.g. "EDUDEEN* NOOR CIRCLES"),
 * and on the monthly product for subscription payments.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | null;
  private monthlyProduct: Promise<string> | null = null;

  constructor(config: ConfigService) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET') || null;
    this.client = key ? new Stripe(key) : null;
    if (!this.isConfigured) {
      this.logger.warn('Stripe not configured — website contributions are recorded as pledges for manual follow-up.');
    }
  }

  get isConfigured(): boolean {
    return !!this.client && !!this.webhookSecret;
  }

  async createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }> {
    if (!this.client) throw new Error('Stripe is not configured.');
    const metadata = {
      contributorId: input.contributorId,
      fullName     : input.fullName,
      phone        : input.phone,
      frequency    : input.frequency,
    };
    const monthly = input.frequency === 'monthly';
    const session = await this.client.checkout.sessions.create({
      mode          : monthly ? 'subscription' : 'payment',
      customer_email: input.email,
      line_items    : [{
        quantity  : 1,
        price_data: {
          currency    : 'pkr',
          unit_amount : input.amount * 100,
          // Monthly gifts use our product, which carries the statement descriptor
          // (Checkout has no descriptor setting for subscriptions).
          ...(monthly
            ? { product: await this.monthlyProductId(), recurring: { interval: 'month' as const } }
            : { product_data: { name: 'Noor Circles — contribution' } }),
        },
      }],
      metadata,
      ...(monthly
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata, statement_descriptor_suffix: DESCRIPTOR } }),
      success_url: `${input.returnBaseUrl}/?contribution=success#support`,
      cancel_url : `${input.returnBaseUrl}/?contribution=cancelled#support`,
    });
    return { id: session.id, url: session.url as string };
  }

  /** The monthly-contribution product, created once with the Noor Circles descriptor. */
  private monthlyProductId(): Promise<string> {
    if (!this.monthlyProduct) {
      this.monthlyProduct = this.ensureMonthlyProduct().catch((err) => {
        this.monthlyProduct = null; // try again on the next checkout
        throw err;
      });
    }
    return this.monthlyProduct;
  }

  private async ensureMonthlyProduct(): Promise<string> {
    const client = this.client as Stripe;
    const fields = { name: 'Noor Circles — monthly contribution', statement_descriptor: DESCRIPTOR };
    try {
      const p = await client.products.retrieve(MONTHLY_PRODUCT_ID);
      if (!p.active || p.statement_descriptor !== DESCRIPTOR) {
        await client.products.update(MONTHLY_PRODUCT_ID, { ...fields, active: true });
      }
    } catch (err: any) {
      if (err?.code !== 'resource_missing' && err?.statusCode !== 404) throw err;
      await client.products.create({ id: MONTHLY_PRODUCT_ID, ...fields });
    }
    return MONTHLY_PRODUCT_ID;
  }

  /** Verifies the signature and parses a webhook payload. Throws if invalid. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) throw new Error('Stripe webhook secret is not configured.');
    return Stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
