import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

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
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | null;

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
          product_data: { name: monthly ? 'Noor Circles — monthly contribution' : 'Noor Circles — contribution' },
          ...(monthly ? { recurring: { interval: 'month' as const } } : {}),
        },
      }],
      metadata,
      ...(monthly
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
      success_url: `${input.returnBaseUrl}/?contribution=success#support`,
      cancel_url : `${input.returnBaseUrl}/?contribution=cancelled#support`,
    });
    return { id: session.id, url: session.url as string };
  }

  /** Verifies the signature and parses a webhook payload. Throws if invalid. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) throw new Error('Stripe webhook secret is not configured.');
    return Stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
