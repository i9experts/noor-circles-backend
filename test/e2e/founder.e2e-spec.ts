import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';

describe('Meet the Founder', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  const SITE = 'https://noorcircles.com';

  beforeAll(async () => {
    ctx = await createApp('founder');
    w = await seedWorld(ctx);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await ctx.close();
  });

  it('anyone can read it, including the website from its own domain', async () => {
    const r = await ctx.http().get(`${API}/founder`).set('Origin', SITE);
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe(SITE);
    expect(r.body.data).toMatchObject({ name: 'Atiq ur Rehman Ayubi', titleEn: 'Founder, Noor Circles', blogUrl: 'https://ayubi.blog' });
    expect(r.body.data.vision).toHaveLength(4);
    expect(r.body.data.messageParentsUr).toMatch(/محترم والدین/);
  });

  it('only admins can change it; a reset brings back the approved text', async () => {
    expect((await ctx.http().put(`${API}/founder`).set(bearer(w.A.token)).send({ taglineEn: 'x' })).status).toBe(403);
    expect((await ctx.http().put(`${API}/founder`).send({ taglineEn: 'x' })).status).toBe(401);
    const r = await ctx.http().put(`${API}/founder`).set(bearer(w.admin)).send({ taglineEn: 'New tagline', photo: 'https://example.com/me.jpg' });
    expect(r.status).toBe(200);
    expect(r.body.data.profile).toMatchObject({ taglineEn: 'New tagline', photo: 'https://example.com/me.jpg', name: 'Atiq ur Rehman Ayubi' });
    expect((await ctx.http().put(`${API}/founder`).set(bearer(w.admin)).send({ photo: 'not a link' })).status).toBe(400);
    const back = await ctx.http().post(`${API}/founder/reset`).set(bearer(w.admin));
    expect(back.body.data.profile.taglineEn).toBe('Building honest, useful institutions for Muslim communities.');
  });

  it('shows the newest blog posts, and nothing if the blog can’t be reached', async () => {
    const spy = jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => (String(url).endsWith('/feed')
      ? new Response('<rss><channel><item><title>Post one</title><link>https://ayubi.blog/one</link></item></channel></rss>')
      : new Response('', { status: 404 })) as any);
    const r = await ctx.http().get(`${API}/founder/posts`);
    expect(r.body.data).toEqual([{ title: 'Post one', url: 'https://ayubi.blog/one', date: null }]);
    spy.mockRestore();
  });
});
