import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

/** A real 1×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('Image upload without Cloudinary', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('upload'); // no CLOUDINARY_* settings, as on a fresh deployment
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const upload = (token: string, buf: Buffer, contentType = 'image/png') =>
    ctx.http().post(`${API}/upload/image`).set(bearer(token)).attach('file', buf, { filename: 'me.png', contentType });

  it('keeps the photo in the database and serves it back', async () => {
    for (const token of [w.admin, w.A.token]) {
      const r = await upload(token, PNG);
      expect(r.status).toBe(201);
      const url: string = r.body.data.url;
      expect(url).toMatch(/\/api\/v1\/upload\/images\/[a-f\d]{24}$/);
      const img = await ctx.http().get(url.slice(url.indexOf('/api/v1')));
      expect(img.status).toBe(200);
      expect(img.headers['content-type']).toBe('image/png');
      expect(img.headers['cache-control']).toMatch(/immutable/);
      expect(Buffer.from(img.body).equals(PNG)).toBe(true);
    }
  });

  it('checks the file really is an image', async () => {
    const r = await upload(w.A.token, Buffer.from('<script>alert(1)</script>'));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/isn’t a JPG, PNG or WebP/);
  });

  it('unknown images are 404', async () => {
    expect((await ctx.http().get(`${API}/upload/images/64b7f0000000000000000000`)).status).toBe(404);
    expect((await ctx.http().get(`${API}/upload/images/nope`)).status).toBe(404);
  });
});
