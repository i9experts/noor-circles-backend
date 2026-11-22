import { ConfigService } from '@nestjs/config';
import { DESCRIPTOR, MONTHLY_PRODUCT_ID, StripeService } from './stripe.service';

function makeService(products: { retrieve: jest.Mock; create: jest.Mock; update: jest.Mock }) {
  const config = { get: (k: string) => ({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' } as Record<string, string>)[k] } as unknown as ConfigService;
  const svc = new StripeService(config);
  const create = jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
  (svc as any).client = { checkout: { sessions: { create } }, products };
  return { svc, create };
}
const input = (frequency: 'once' | 'monthly') => ({
  contributorId: 'c1', fullName: 'Sara Khan', email: 'sara@example.com', phone: '03001234567', amount: 500, frequency, returnBaseUrl: 'https://noorcircles.com',
});

describe('StripeService statement descriptor', () => {
  it('one-off gifts carry the NOOR CIRCLES card suffix', async () => {
    const products = { retrieve: jest.fn(), create: jest.fn(), update: jest.fn() };
    const { svc, create } = makeService(products);
    await svc.createCheckout(input('once'));
    const args = create.mock.calls[0][0];
    expect(args.mode).toBe('payment');
    expect(args.payment_intent_data).toMatchObject({ statement_descriptor_suffix: DESCRIPTOR, metadata: { contributorId: 'c1' } });
    expect(args.line_items[0].price_data).toMatchObject({ currency: 'pkr', unit_amount: 50000, product_data: { name: expect.any(String) } });
    expect(products.retrieve).not.toHaveBeenCalled();
  });

  it('monthly gifts use the product with the descriptor, created once', async () => {
    const products = {
      retrieve: jest.fn().mockRejectedValue(Object.assign(new Error('No such product'), { code: 'resource_missing', statusCode: 404 })),
      create: jest.fn().mockResolvedValue({ id: MONTHLY_PRODUCT_ID }),
      update: jest.fn(),
    };
    const { svc, create } = makeService(products);
    await svc.createCheckout(input('monthly'));
    await svc.createCheckout(input('monthly'));
    expect(products.create).toHaveBeenCalledTimes(1);
    expect(products.create).toHaveBeenCalledWith(expect.objectContaining({ id: MONTHLY_PRODUCT_ID, statement_descriptor: DESCRIPTOR }));
    const args = create.mock.calls[0][0];
    expect(args.mode).toBe('subscription');
    expect(args.line_items[0].price_data).toMatchObject({ product: MONTHLY_PRODUCT_ID, recurring: { interval: 'month' }, unit_amount: 50000 });
    expect(args.line_items[0].price_data.product_data).toBeUndefined();
    expect(args.subscription_data).toMatchObject({ metadata: { contributorId: 'c1' } });
  });

  it('fixes an existing product that lost its descriptor', async () => {
    const products = {
      retrieve: jest.fn().mockResolvedValue({ id: MONTHLY_PRODUCT_ID, active: false, statement_descriptor: null }),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    const { svc } = makeService(products);
    await svc.createCheckout(input('monthly'));
    expect(products.update).toHaveBeenCalledWith(MONTHLY_PRODUCT_ID, expect.objectContaining({ statement_descriptor: DESCRIPTOR, active: true }));
    expect(products.create).not.toHaveBeenCalled();
  });

  it('a Stripe error is not cached; the next checkout tries again', async () => {
    const products = {
      retrieve: jest.fn().mockRejectedValueOnce(Object.assign(new Error('down'), { statusCode: 500 })).mockResolvedValue({ id: MONTHLY_PRODUCT_ID, active: true, statement_descriptor: DESCRIPTOR }),
      create: jest.fn(), update: jest.fn(),
    };
    const { svc } = makeService(products);
    await expect(svc.createCheckout(input('monthly'))).rejects.toThrow('down');
    await expect(svc.createCheckout(input('monthly'))).resolves.toMatchObject({ id: 'cs_1' });
  });
});
