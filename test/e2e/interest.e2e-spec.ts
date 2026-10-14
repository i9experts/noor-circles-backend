import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API,
  BAD_ID,
  bearer,
  createApp,
  createMurabbi,
  E2EContext,
  MISSING_ID,
  PORTAL_ORIGIN,
  signIn,
} from './helpers';

const valid = {
  role: 'mentor',
  firstName: 'Bilal',
  lastName: 'Ahmed',
  email: 'Bilal.Ahmed@Example.com',
  phone: '+92 300 1234567',
  city: 'Karachi',
  neighbourhood: 'North Nazimabad',
  roleDetail: 'Educator / teacher',
};

describe('Interest requests (landing page form)', () => {
  let ctx: E2EContext;
  let admin: string;
  let murabbi: string;

  beforeAll(async () => {
    ctx = await createApp('interest');
    admin = (await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    murabbi = (await createMurabbi(ctx, admin, 'm.interest@e2e.test')).token;
  });
  afterAll(async () => ctx.close());

  const submit = (body: object) =>
    ctx.http().post(`${API}/interest`).send(body);

  it('anyone can submit without signing in; email is normalised', async () => {
    const r = await submit(valid);
    expect(r.status).toBe(201);
    expect(r.body.message).toMatch(/in touch/);
    const doc = await ctx.db
      .collection('interests')
      .findOne({ firstName: 'Bilal' });
    expect(doc).toMatchObject({
      role: 'mentor',
      email: 'bilal.ahmed@example.com',
      status: 'new',
    });
  });

  it('notifies every admin with a system notification (no sender)', async () => {
    const r = await ctx.http().get(`${API}/notifications`).set(bearer(admin));
    const n = r.body.data.find((x: any) => x.type === 'interest_request');
    expect(n).toBeDefined();
    expect(n.sender).toBeNull();
    expect(n.message).toMatch(
      /Bilal Ahmed \(North Nazimabad, Karachi\) wants to join as a mentor/,
    );
  });

  it('validates input', async () => {
    const r = await submit({
      ...valid,
      role: 'admin',
      email: 'nope',
      phone: 'call me',
      firstName: '',
    });
    expect(r.status).toBe(400);
    expect(r.body.errors.length).toBeGreaterThanOrEqual(4);
    expect((await submit({ ...valid, isAdmin: true })).status).toBe(400); // unknown fields rejected
    expect((await submit({ ...valid, email: { $ne: null } })).status).toBe(400);
  });

  it('honeypot: a filled hidden field gets a fake success and nothing is stored', async () => {
    const before = await ctx.db.collection('interests').countDocuments();
    const r = await submit({
      ...valid,
      firstName: 'Spam',
      website: 'http://spam.example',
    });
    expect(r.status).toBe(201);
    expect(await ctx.db.collection('interests').countDocuments()).toBe(before);
  });

  it('listing / updating / deleting is admin-only', async () => {
    expect((await ctx.http().get(`${API}/interest`)).status).toBe(401);
    expect(
      (await ctx.http().get(`${API}/interest`).set(bearer(murabbi))).status,
    ).toBe(403);
    expect(
      (
        await ctx
          .http()
          .patch(`${API}/interest/${MISSING_ID}`)
          .set(bearer(murabbi))
          .send({ status: 'closed' })
      ).status,
    ).toBe(403);
  });

  it('admin lists with filters, updates status + notes, deletes', async () => {
    await submit({
      ...valid,
      role: 'parent',
      firstName: 'Amina',
      email: 'amina@example.com',
      roleDetail: '9–10 years',
    });
    await submit({
      ...valid,
      role: 'host',
      firstName: 'Hassan',
      email: 'hassan@example.com',
      roleDetail: 'Living room',
    });

    const all = await ctx.http().get(`${API}/interest`).set(bearer(admin));
    expect(all.body.data).toHaveLength(3);
    expect(all.body.data[0].firstName).toBe('Hassan'); // newest first

    const hosts = await ctx
      .http()
      .get(`${API}/interest?role=host`)
      .set(bearer(admin));
    expect(hosts.body.data.map((x: any) => x.firstName)).toEqual(['Hassan']);

    const id = hosts.body.data[0]._id;
    const upd = await ctx
      .http()
      .patch(`${API}/interest/${id}`)
      .set(bearer(admin))
      .send({ status: 'contacted', notes: 'Called on Monday' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.interest).toMatchObject({
      status: 'contacted',
      notes: 'Called on Monday',
    });
    expect(
      (await ctx.http().get(`${API}/interest?status=new`).set(bearer(admin)))
        .body.data,
    ).toHaveLength(2);

    expect(
      (
        await ctx
          .http()
          .patch(`${API}/interest/${id}`)
          .set(bearer(admin))
          .send({ status: 'archived' })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx
          .http()
          .patch(`${API}/interest/${id}`)
          .set(bearer(admin))
          .send({ role: 'admin' })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx
          .http()
          .patch(`${API}/interest/${BAD_ID}`)
          .set(bearer(admin))
          .send({ status: 'closed' })
      ).status,
    ).toBe(400);

    expect(
      (await ctx.http().delete(`${API}/interest/${id}`).set(bearer(admin)))
        .status,
    ).toBe(200);
    expect(
      (await ctx.http().delete(`${API}/interest/${id}`).set(bearer(admin)))
        .status,
    ).toBe(404);
  });
});

describe('Interest form CORS', () => {
  let ctx: E2EContext;
  const SITE = 'https://noorcircles.example';
  beforeAll(async () => {
    ctx = await createApp('interest_cors');
  });
  afterAll(async () => ctx.close());

  const preflight = (path: string, origin: string, method = 'POST') =>
    ctx
      .http()
      .options(`${API}${path}`)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', method)
      .set('Access-Control-Request-Headers', 'content-type');

  // Regression: the live landing page's form was blocked by CORS because its
  // domain wasn't listed in FRONTEND_URL ("We could not reach Noor Circles").
  it('any website may submit the public form (preflight + POST)', async () => {
    const pre = await preflight('/interest', SITE);
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe(SITE);
    expect(pre.headers['access-control-allow-credentials']).toBeUndefined();

    const r = await ctx
      .http()
      .post(`${API}/interest`)
      .set('Origin', SITE)
      .send({ ...valid, email: 'cors@example.com' });
    expect(r.status).toBe(201);
    expect(r.headers['access-control-allow-origin']).toBe(SITE);
  });

  it('validation errors are readable cross-origin too', async () => {
    const r = await ctx
      .http()
      .post(`${API}/interest`)
      .set('Origin', SITE)
      .send({ ...valid, phone: 'call me' });
    expect(r.status).toBe(400);
    expect(r.headers['access-control-allow-origin']).toBe(SITE);
  });

  it('other websites still cannot call authenticated endpoints or read interest data', async () => {
    expect(
      (await preflight('/auth/me', SITE, 'GET')).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
    const list = await ctx.http().get(`${API}/interest`).set('Origin', SITE);
    expect(list.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('the portal keeps credentialed CORS everywhere', async () => {
    const pre = await preflight('/auth/me', PORTAL_ORIGIN, 'GET');
    expect(pre.headers['access-control-allow-origin']).toBe(PORTAL_ORIGIN);
    expect(pre.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('Interest form rate limit (real throttler)', () => {
  let ctx: E2EContext;
  beforeAll(async () => {
    ctx = await createApp('interest_throttle', { realThrottler: true });
  });
  afterAll(async () => ctx.close());

  it('6th submission in a minute from one visitor → 429; another visitor is unaffected', async () => {
    const from = (ip: string, i: number) =>
      ctx
        .http()
        .post(`${API}/interest`)
        .set('X-Forwarded-For', ip)
        .send({ ...valid, email: `v${i}@example.com` });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await from('198.51.100.7', i)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect((await from('198.51.100.8', 99)).status).toBe(201);
  });
});
