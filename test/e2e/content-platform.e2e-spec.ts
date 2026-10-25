import {
  API,
  BAD_ID,
  bearer,
  createApp,
  E2EContext,
  MISSING_ID,
  seedWorld,
} from './helpers';

/** Lessons, announcements, notifications, live sessions, upload, health + platform behaviour. */
describe('Content + platform', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    // Fake (non-empty) Cloudinary creds so the upload endpoint gets past its
    // "not configured" guard; no test here makes a real Cloudinary call.
    ctx = await createApp('content', {
      env: {
        CLOUDINARY_CLOUD_NAME: 'x',
        CLOUDINARY_API_KEY: 'x',
        CLOUDINARY_API_SECRET: 'x',
      },
    });
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) =>
      ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) =>
      ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const mA = () => as(w.A.token);

  // ── Lessons ─────────────────────────────────────────────────────────────────
  describe('lessons', () => {
    let id: string;

    it('admin CRUD; murabbi read-only', async () => {
      const r = await adm().post('lessons', {
        title: 'Who am I?',
        order: 1,
        objectives: ['Know fitrah'],
      });
      expect(r.status).toBe(201);
      id = r.body.data._id;
      expect((await mA().post('lessons', { title: 'Nope' })).status).toBe(403);
      expect((await mA().get('lessons')).body.data).toHaveLength(1);
      expect((await mA().get(`lessons/${id}`)).status).toBe(200);
      expect((await mA().get(`lessons/${MISSING_ID}`)).status).toBe(404);
      expect((await mA().get(`lessons/${BAD_ID}`)).status).toBe(400);
      expect(
        (await adm().patch(`lessons/${id}`, { title: 'Who am I? (v2)' })).body
          .data.title,
      ).toBe('Who am I? (v2)');
    });

    it('create validates status enum', async () => {
      expect(
        (await adm().post('lessons', { title: 'X', status: 'Bogus' })).status,
      ).toBe(400);
    });

    // BUG-26 (same root cause): PATCH /lessons/:id body is Partial<CreateLessonDto>
    // → no validation, no runValidators.
    it(
      'BUG-26: lesson update should reject an invalid status / empty title',
      async () => {
        const r = await adm().patch(`lessons/${id}`, {
          status: 'Bogus',
          title: '',
        });
        expect(r.status).toBe(400);
      },
    );

    // BUG-44: lessons in status "Draft" are returned to murabbis.
    it(
      'BUG-44: Draft lessons should not be visible to murabbis',
      async () => {
        await adm().post('lessons', { title: 'Unfinished', status: 'Draft' });
        const r = await mA().get('lessons');
        expect(r.body.data.some((l: any) => l.status === 'Draft')).toBe(false);
      },
    );

    it('delete', async () => {
      expect((await adm().del(`lessons/${id}`)).status).toBe(200);
      expect((await adm().del(`lessons/${id}`)).status).toBe(404);
    });
  });

  // ── Announcements ───────────────────────────────────────────────────────────
  describe('announcements', () => {
    it('admin creates; everyone reads; validation', async () => {
      const r = await adm().post('announcements', {
        title: 'Eid break',
        body: 'No sessions next week',
        icon: 'session',
      });
      expect(r.status).toBe(201);
      expect(
        (
          await adm().post('announcements', {
            title: 'x',
            body: 'y',
            icon: 'rocket',
          })
        ).status,
      ).toBe(400);
      expect(
        (await adm().post('announcements', { title: '', body: '' })).status,
      ).toBe(400);
      expect(
        (await mA().post('announcements', { title: 'x', body: 'y' })).status,
      ).toBe(403);
      const list = await mA().get('announcements');
      expect(list.body.data[0]).toMatchObject({
        title: 'Eid break',
        createdBy: { fullName: 'Test Admin' },
      });
      expect(
        (await mA().del(`announcements/${r.body.data.announcement._id}`))
          .status,
      ).toBe(403);
      expect(
        (await adm().del(`announcements/${r.body.data.announcement._id}`))
          .status,
      ).toBe(200);
    });
  });

  // ── Notifications ───────────────────────────────────────────────────────────
  describe('notifications', () => {
    it('list / unread-count / mark read / read-all', async () => {
      const list = await mA().get('notifications');
      expect(list.body.data.length).toBeGreaterThanOrEqual(2); // circle_assigned + student_assigned
      const before = (await mA().get('notifications/unread-count')).body.data
        .count;
      expect(
        (await mA().patch(`notifications/${list.body.data[0]._id}/read`))
          .status,
      ).toBe(200);
      expect(
        (await mA().get('notifications/unread-count')).body.data.count,
      ).toBe(before - 1);
      expect((await mA().patch('notifications/read-all')).status).toBe(200);
      expect(
        (await mA().get('notifications/unread-count')).body.data.count,
      ).toBe(0);
    });

    it("cannot mark another user's notification as read", async () => {
      const bList = await as(w.B.token).get('notifications');
      expect(
        (await mA().patch(`notifications/${bList.body.data[0]._id}/read`))
          .status,
      ).toBe(404);
    });

    it(
      'BUG-14: PATCH /notifications/<malformed>/read → 400 (is 500)',
      async () => {
        expect((await mA().patch(`notifications/${BAD_ID}/read`)).status).toBe(
          400,
        );
      },
    );
    it(
      'BUG-14: PATCH /notifications/<malformed>/accept → 400 (is 500)',
      async () => {
        expect(
          (await adm().patch(`notifications/${BAD_ID}/accept`)).status,
        ).toBe(400);
      },
    );

    it('murabbi requests material → admins notified; admins cannot use it', async () => {
      expect(
        (
          await mA().post('notifications/request-material', {
            note: 'Need Ramadan worksheets',
          })
        ).status,
      ).toBe(201);
      const n = await adm().get('notifications');
      expect(
        n.body.data.some(
          (x: any) =>
            x.type === 'material_request' && /Ramadan/.test(x.message),
        ),
      ).toBe(true);
      expect(
        (await adm().post('notifications/request-material', {})).status,
      ).toBe(403);
    });
  });

  // ── Live sessions ───────────────────────────────────────────────────────────
  describe('live sessions', () => {
    it('admin creates one-off + recurring sessions; murabbi reads', async () => {
      const soon = new Date(Date.now() + 60 * 60_000).toISOString();
      const r = await adm().post('live-sessions', {
        title: 'Weekly Q&A',
        zoomLink: 'https://zoom.us/j/123',
        scheduledAt: soon,
        durationMinutes: 45,
      });
      expect(r.status).toBe(201);
      expect(
        (
          await adm().post('live-sessions', {
            title: 'X',
            zoomLink: 'not a url',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await adm().post('live-sessions', {
            title: 'X',
            zoomLink: 'javascript:alert(1)',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await mA().post('live-sessions', {
            title: 'X',
            zoomLink: 'https://zoom.us/j/1',
          })
        ).status,
      ).toBe(403);
      const up = await mA().get('live-sessions/upcoming');
      expect(up.body.data[0]).toMatchObject({
        title: 'Weekly Q&A',
        isLive: false,
        isEnded: false,
      });
      expect((await mA().get('live-sessions')).status).toBe(200);
      const upd = await adm().patch(`live-sessions/${r.body.data._id}`, {
        title: 'Weekly Q&A (moved)',
      });
      expect(upd.body.data.title).toBe('Weekly Q&A (moved)');
      expect((await adm().del(`live-sessions/${r.body.data._id}`)).status).toBe(
        200,
      );
      expect((await adm().del(`live-sessions/${r.body.data._id}`)).status).toBe(
        404,
      );
    });

    // BUG-45: recurringTime is free text; "99:99" or "soon" is accepted and
    // produces an Invalid Date, and a recurring session with no time and no
    // scheduledAt is listed as "upcoming" forever with scheduledAt=null.
    it(
      'BUG-45: recurringTime must be validated as HH:MM (and required for recurring sessions)',
      async () => {
        const r = await adm().post('live-sessions', {
          title: 'Broken',
          zoomLink: 'https://zoom.us/j/9',
          isRecurring: true,
          recurringDay: 1,
          recurringTime: 'soon',
        });
        expect(r.status).toBe(400);
      },
    );
  });

  // ── Upload ──────────────────────────────────────────────────────────────────
  describe('upload', () => {
    it('requires auth', async () => {
      expect((await ctx.http().post(`${API}/upload/image`)).status).toBe(401);
    });

    it('rejects non-image mimetypes with 400', async () => {
      const r = await ctx
        .http()
        .post(`${API}/upload/image`)
        .set(bearer(w.A.token))
        .attach('file', Buffer.from('%PDF-1.4'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        });
      expect(r.status).toBe(400);
    });

    it('rejects files over 5 MB with 413', async () => {
      const r = await ctx
        .http()
        .post(`${API}/upload/image`)
        .set(bearer(w.A.token))
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 10), {
          filename: 'big.png',
          contentType: 'image/png',
        });
      expect(r.status).toBe(413);
    });

    // BUG-46: posting without a file throws a plain Error → 500 instead of 400.
    it(
      'BUG-46: upload with no file should be 400, not 500',
      async () => {
        const r = await ctx
          .http()
          .post(`${API}/upload/image`)
          .set(bearer(w.A.token));
        expect(r.status).toBe(400);
      },
    );
  });

  // ── Platform ────────────────────────────────────────────────────────────────
  describe('platform', () => {
    it('health check reports mongodb up', async () => {
      const r = await ctx.http().get(`${API}/health`);
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body)).toMatch(/"mongodb":\{"status":"up"/);
    });

    it('unknown routes → JSON 404 with consistent error shape', async () => {
      const r = await ctx.http().get(`${API}/does-not-exist`);
      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ success: false, statusCode: 404 });
    });

    it('malformed JSON body → 400, not 500', async () => {
      const r = await ctx
        .http()
        .post(`${API}/auth/signin`)
        .set('Content-Type', 'application/json')
        .send('{"email":');
      expect(r.status).toBe(400);
    });

    it('success responses use the {success, message, data} envelope', async () => {
      const r = await mA().get('announcements');
      expect(r.body).toMatchObject({ success: true, message: 'OK' });
      expect(Array.isArray(r.body.data)).toBe(true);
    });
  });
});

describe('Rate limiting (real throttler)', () => {
  let ctx: E2EContext;
  beforeAll(async () => {
    ctx = await createApp('throttle', { realThrottler: true });
  });
  afterAll(async () => ctx.close());

  it('101st request in a minute from one client → 429', async () => {
    let last = 0;
    for (let i = 0; i < 101; i++)
      last = (await ctx.http().get(`${API}/health`)).status;
    expect(last).toBe(429);
  });

  // BUG-47 (fixed): main.ts now sets `trust proxy` so that behind Railway's
  // proxy each visitor gets their own rate-limit bucket instead of everyone
  // sharing the proxy's. Simulated: a different X-Forwarded-For client is
  // not blocked by another client's exhausted bucket.
  it('BUG-47: different clients behind a proxy should not share one rate-limit bucket', async () => {
    const r = await ctx
      .http()
      .get(`${API}/health`)
      .set('X-Forwarded-For', '203.0.113.77');
    expect(r.status).toBe(200);
  });
});
