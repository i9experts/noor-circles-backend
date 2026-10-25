import * as jwt from 'jsonwebtoken';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API,
  bearer,
  createApp,
  createMurabbi,
  DEFAULT_PASSWORD,
  E2EContext,
  signIn,
} from './helpers';

describe('Auth', () => {
  let ctx: E2EContext;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createApp('auth');
    adminToken = (await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  });
  afterAll(async () => ctx.close());

  const post = (
    path: string,
    body: object,
    headers: Record<string, string> = {},
  ) => ctx.http().post(`${API}/auth/${path}`).set(headers).send(body);

  // ── Signup ──────────────────────────────────────────────────────────────────
  describe('signup (2-step OTP)', () => {
    const email = 'new.user@e2e.test';

    it('rejects weak passwords and bad emails with 400 + field errors', async () => {
      const r = await post('signup/request-otp', {
        fullName: 'X',
        email: 'nope',
        password: 'short',
      });
      expect(r.status).toBe(400);
      expect(r.body.success).toBe(false);
      expect(r.body.errors.length).toBeGreaterThan(1);
    });

    it('rejects unknown fields (forbidNonWhitelisted) — e.g. trying to self-assign role', async () => {
      const r = await post('signup/request-otp', {
        fullName: 'X',
        email,
        password: DEFAULT_PASSWORD,
        role: 'admin',
      });
      expect(r.status).toBe(400);
    });

    it('rejects non-string payloads (NoSQL-injection probe) with 400, not 500', async () => {
      const r = await post('signin', {
        email: { $ne: null },
        password: { $ne: null },
      });
      expect(r.status).toBe(400);
    });

    it('sends an OTP, then verifying it creates a pending account (no tokens)', async () => {
      const r1 = await post('signup/request-otp', {
        fullName: 'New User',
        email,
        password: DEFAULT_PASSWORD,
      });
      expect(r1.status).toBe(200);
      const otp = ctx.lastOtp(email);
      expect(otp).toMatch(/^\d{6}$/);

      const bad = await post('signup/verify-otp', {
        email,
        otp: otp === '000000' ? '111111' : '000000',
      });
      expect(bad.status).toBe(400);

      const r2 = await post('signup/verify-otp', { email, otp });
      expect(r2.status).toBe(201);
      expect(r2.body.data.pendingApproval).toBe(true);
      expect(r2.body.data.accessToken).toBeUndefined();
      expect(r2.body.data.refreshToken).toBeUndefined();
      expect(r2.body.data.user.role).toBe('murabbi');
      expect(r2.body.data.user.password).toBeUndefined();
    });

    it('rejects signup for an already-registered email with 409', async () => {
      const r = await post('signup/request-otp', {
        fullName: 'Dup',
        email,
        password: DEFAULT_PASSWORD,
      });
      expect(r.status).toBe(409);
    });

    it('OTP stored in the DB is hashed, not plaintext', async () => {
      const e = 'hash.check@e2e.test';
      await post('signup/request-otp', {
        fullName: 'Hash',
        email: e,
        password: DEFAULT_PASSWORD,
      });
      const doc = await ctx.db.collection('users').findOne({ email: e });
      expect(doc.otpCode).not.toBe(ctx.lastOtp(e));
      expect(String(doc.otpCode)).toMatch(/^\$2[aby]\$/);
    });

    it('expired OTP is rejected', async () => {
      const e = 'expired@e2e.test';
      await post('signup/request-otp', {
        fullName: 'Exp',
        email: e,
        password: DEFAULT_PASSWORD,
      });
      await ctx.db
        .collection('users')
        .updateOne(
          { email: e },
          { $set: { otpExpiresAt: new Date(Date.now() - 1000) } },
        );
      const r = await post('signup/verify-otp', {
        email: e,
        otp: ctx.lastOtp(e),
      });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/expired/i);
    });

    it('unverified accounts cannot sign in', async () => {
      const e = 'unverified@e2e.test';
      await post('signup/request-otp', {
        fullName: 'U',
        email: e,
        password: DEFAULT_PASSWORD,
      });
      const r = await post('signin', { email: e, password: DEFAULT_PASSWORD });
      expect(r.status).toBe(401);
    });

    // BUG-01 (fixed): self-registered accounts used to become active murabbis
    // immediately. They now wait for an admin to approve them.
    it('BUG-01: self-signup is pending until an admin approves it', async () => {
      const e = 'stranger@e2e.test';
      await post('signup/request-otp', {
        fullName: 'Stranger',
        email: e,
        password: DEFAULT_PASSWORD,
      });
      const v = await post('signup/verify-otp', {
        email: e,
        otp: ctx.lastOtp(e),
      });
      expect(v.status).toBe(201);
      expect(v.body.data.accessToken).toBeUndefined();

      const denied = await post('signin', {
        email: e,
        password: DEFAULT_PASSWORD,
      });
      expect(denied.status).toBe(401);
      expect(denied.body.message).toMatch(/awaiting admin approval/i);

      // Admins are told about it…
      const n = await ctx
        .http()
        .get(`${API}/notifications`)
        .set(bearer(adminToken));
      const notif = n.body.data.find((x: any) => x.payload?.email === e);
      expect(notif).toBeDefined();

      // …and approve with the existing Activate action.
      const res = await ctx
        .http()
        .patch(`${API}/admin/murabbis/${notif.payload.userId}/activate`)
        .set(bearer(adminToken));
      expect(res.status).toBe(200);
      const ok = await post('signin', { email: e, password: DEFAULT_PASSWORD });
      expect(ok.status).toBe(200);
      expect(
        (
          await ctx
            .http()
            .get(`${API}/lessons`)
            .set(bearer(ok.body.data.accessToken))
        ).status,
      ).toBe(200);
    });

    it('a pending sign-up shows up as inactive in the admin murabbi list', async () => {
      const e = 'pending.list@e2e.test';
      await post('signup/request-otp', {
        fullName: 'Pending',
        email: e,
        password: DEFAULT_PASSWORD,
      });
      await post('signup/verify-otp', { email: e, otp: ctx.lastOtp(e) });
      const r = await ctx
        .http()
        .get(`${API}/admin/murabbis`)
        .set(bearer(adminToken));
      const m = r.body.data.find((x: any) => x.email === e);
      expect(m).toMatchObject({ isActive: false, pendingApproval: true });
    });
  });

  // ── OTP leakage in responses ────────────────────────────────────────────────
  describe('OTP exposure in API responses', () => {
    // BUG-02: the OTP is echoed back in the HTTP response whenever
    // NODE_ENV !== 'production'. The Dockerfile never sets NODE_ENV, so a
    // deployment that forgets it lets anyone reset ANY account's password
    // (forgot-password → OTP in response → reset). Verified here with the
    // env var simply unset, which is the Dockerfile default.
    it('BUG-02: forgot-password must never return the OTP when NODE_ENV is unset', async () => {
      const prev = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      try {
        const r = await post('forgot-password', { email: ADMIN_EMAIL });
        expect(r.status).toBe(200);
        expect(r.body.data?.otp).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prev;
      }
    });

    it('OTP is only echoed with the explicit dev opt-in, and never in production', async () => {
      const prev = { ...process.env };
      try {
        process.env.EXPOSE_OTP_IN_RESPONSE = 'true';
        process.env.NODE_ENV = 'development';
        const dev = await post('forgot-password', { email: ADMIN_EMAIL });
        expect(dev.body.data.otp).toMatch(/^\d{6}$/);
        process.env.NODE_ENV = 'production';
        const prod = await post('forgot-password', { email: ADMIN_EMAIL });
        expect(prod.body.data?.otp).toBeUndefined();
      } finally {
        process.env.EXPOSE_OTP_IN_RESPONSE = prev.EXPOSE_OTP_IN_RESPONSE ?? '';
        process.env.NODE_ENV = prev.NODE_ENV;
      }
    });

    it('with NODE_ENV=production the OTP is not returned', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const r = await post('forgot-password', { email: ADMIN_EMAIL });
        expect(r.status).toBe(200);
        expect(r.body.data?.otp).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prev;
      }
    });
  });

  // ── Sign in / me ────────────────────────────────────────────────────────────
  describe('signin + /auth/me', () => {
    it('wrong password → 401 with generic message', async () => {
      const r = await post('signin', {
        email: ADMIN_EMAIL,
        password: 'WrongPass1',
      });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Invalid email or password.');
    });

    it('unknown email → same 401 (no user enumeration)', async () => {
      const r = await post('signin', {
        email: 'ghost@e2e.test',
        password: 'WrongPass1',
      });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Invalid email or password.');
    });

    it('email is case-insensitive', async () => {
      const r = await post('signin', {
        email: ADMIN_EMAIL.toUpperCase(),
        password: ADMIN_PASSWORD,
      });
      expect(r.status).toBe(200);
    });

    it('/auth/me returns a flat profile without secrets', async () => {
      const r = await ctx.http().get(`${API}/auth/me`).set(bearer(adminToken));
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({
        email: ADMIN_EMAIL,
        role: 'admin',
        tier: 1,
      });
      expect(r.body.data.password).toBeUndefined();
      expect(r.body.data.refreshTokens).toBeUndefined();
    });

    it('/auth/me without / with garbage token → 401', async () => {
      expect((await ctx.http().get(`${API}/auth/me`)).status).toBe(401);
      expect(
        (await ctx.http().get(`${API}/auth/me`).set(bearer('garbage'))).status,
      ).toBe(401);
    });

    it('a refresh token cannot be used as an access token', async () => {
      const { refreshToken } = await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD);
      const r = await ctx
        .http()
        .get(`${API}/auth/me`)
        .set(bearer(refreshToken));
      expect(r.status).toBe(401);
    });

    it('a token signed with the wrong secret is rejected', async () => {
      const forged = jwt.sign(
        { sub: '64b7f0000000000000000000', role: 'admin' },
        'wrong-secret',
      );
      const r = await ctx.http().get(`${API}/admin/stats`).set(bearer(forged));
      expect(r.status).toBe(401);
    });

    it('role in the JWT is not trusted — DB role wins', async () => {
      const m = await createMurabbi(ctx, adminToken, 'role.forge@e2e.test');
      const forged = jwt.sign(
        { sub: m.id, email: 'role.forge@e2e.test', role: 'admin' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '5m' },
      );
      const r = await ctx.http().get(`${API}/admin/stats`).set(bearer(forged));
      expect(r.status).toBe(403);
    });
  });

  // ── Refresh / logout ────────────────────────────────────────────────────────
  describe('refresh-token rotation', () => {
    const waitNextSecond = () => new Promise((r) => setTimeout(r, 1100));

    // BUG-09: JWTs carry no unique id (jti), so two tokens issued for the same
    // user within the same second are byte-identical. Rotation/reuse
    // detection and "revoke on password reset" can't tell them apart: e.g. a
    // session signed in the same second as a post-reset login survives the reset.
    it('BUG-09: refresh tokens should carry a unique id (jti) so same-second logins differ', async () => {
      const m = await createMurabbi(ctx, adminToken, 'same.second@e2e.test');
      expect((jwt.decode(m.refreshToken) as jwt.JwtPayload).jti).toBeDefined();
    });

    // BUG-10 (critical): refresh tokens are stored as bcrypt hashes, but bcrypt
    // only reads the first 72 bytes of its input. Every refresh JWT for the
    // same user shares its first ~150 chars (header + sub + email), so ANY of
    // a user's refresh tokens matches ANY stored hash. Consequences:
    // rotation/reuse detection never fires, logout doesn't log that token
    // out, and a stolen token revives as soon as the victim signs in again.
    it('BUG-10: refresh rotates the token; old token reuse revokes every session', async () => {
      const m = await createMurabbi(ctx, adminToken, 'rotate@e2e.test');
      await waitNextSecond();
      const r1 = await ctx
        .http()
        .post(`${API}/auth/refresh`)
        .set(bearer(m.refreshToken));
      expect(r1.status).toBe(200);
      const newRefresh = r1.body.data.refreshToken;
      expect(newRefresh).toBeDefined();

      // Reusing the old (already rotated) token = theft signal
      const reuse = await ctx
        .http()
        .post(`${API}/auth/refresh`)
        .set(bearer(m.refreshToken));
      expect(reuse.status).toBe(401);

      // …which revoked the new one too
      const after = await ctx
        .http()
        .post(`${API}/auth/refresh`)
        .set(bearer(newRefresh));
      expect(after.status).toBe(401);
    });

    it('logout invalidates that refresh token (single session)', async () => {
      const m = await createMurabbi(ctx, adminToken, 'logout@e2e.test');
      const r = await ctx
        .http()
        .post(`${API}/auth/logout`)
        .set(bearer(m.refreshToken));
      expect(r.status).toBe(200);
      const again = await ctx
        .http()
        .post(`${API}/auth/refresh`)
        .set(bearer(m.refreshToken));
      expect(again.status).toBe(401);
    });

    it('BUG-10: logging out one device must not leave that token usable while another session exists', async () => {
      const m = await createMurabbi(ctx, adminToken, 'logout.two@e2e.test');
      await waitNextSecond();
      await signIn(ctx, 'logout.two@e2e.test', DEFAULT_PASSWORD); // second device
      await ctx.http().post(`${API}/auth/logout`).set(bearer(m.refreshToken));
      const r = await ctx
        .http()
        .post(`${API}/auth/refresh`)
        .set(bearer(m.refreshToken));
      expect(r.status).toBe(401);
    });

    it('logout-all clears all refresh tokens', async () => {
      const m = await createMurabbi(ctx, adminToken, 'logoutall@e2e.test');
      const second = await signIn(ctx, 'logoutall@e2e.test', DEFAULT_PASSWORD);
      const r = await ctx
        .http()
        .post(`${API}/auth/logout-all`)
        .set(bearer(m.token));
      expect(r.status).toBe(200);
      expect(
        (
          await ctx
            .http()
            .post(`${API}/auth/refresh`)
            .set(bearer(second.refreshToken))
        ).status,
      ).toBe(401);
    });

    it('a deactivated user cannot refresh their session', async () => {
      const m = await createMurabbi(ctx, adminToken, 'deact.refresh@e2e.test');
      await ctx
        .http()
        .patch(`${API}/admin/murabbis/${m.id}/deactivate`)
        .set(bearer(adminToken));
      const r = await ctx
        .http()
        .post(`${API}/auth/refresh`)
        .set(bearer(m.refreshToken));
      expect(r.status).toBe(401);
      // and their still-valid access token is rejected immediately
      expect(
        (await ctx.http().get(`${API}/auth/me`).set(bearer(m.token))).status,
      ).toBe(401);
    });
  });

  // ── Forgot / reset password ─────────────────────────────────────────────────
  describe('password reset', () => {
    const email = 'reset.me@e2e.test';
    let resetToken: string;

    beforeAll(async () => {
      await createMurabbi(ctx, adminToken, email);
    });

    it('unknown email gets the same generic response (no enumeration)', async () => {
      const r = await post('forgot-password', { email: 'nobody@e2e.test' });
      expect(r.status).toBe(200);
      expect(r.body.message).toMatch(/If this email is registered/);
    });

    it('OTP → resetToken → new password works', async () => {
      await post('forgot-password', { email });
      const v = await post('verify-otp', { email, otp: ctx.lastOtp(email) });
      expect(v.status).toBe(200);
      resetToken = v.body.data.resetToken;
      const r = await post(
        'reset-password',
        { newPassword: 'BrandNew123' },
        bearer(resetToken),
      );
      expect(r.status).toBe(200);
      expect(
        (await post('signin', { email, password: DEFAULT_PASSWORD })).status,
      ).toBe(401);
      expect(
        (await post('signin', { email, password: 'BrandNew123' })).status,
      ).toBe(200);
    });

    it('BUG-10: a refresh token issued before a password reset stays dead after the owner signs in again', async () => {
      const before = await signIn(ctx, email, 'BrandNew123');
      await post('forgot-password', { email });
      const v = await post('verify-otp', { email, otp: ctx.lastOtp(email) });
      expect(v.status).toBe(200);
      resetToken = v.body.data.resetToken;

      const r = await post(
        'reset-password',
        { newPassword: 'NewerPass123' },
        bearer(v.body.data.resetToken),
      );
      expect(r.status).toBe(200);
      await new Promise((res) => setTimeout(res, 1100)); // rule out BUG-09
      expect(
        (await post('signin', { email, password: 'NewerPass123' })).status,
      ).toBe(200);
      expect(
        (
          await ctx
            .http()
            .post(`${API}/auth/refresh`)
            .set(bearer(before.refreshToken))
        ).status,
      ).toBe(401);
    });

    it('OTP is single-use', async () => {
      await post('forgot-password', { email });
      const otp = ctx.lastOtp(email);
      expect((await post('verify-otp', { email, otp })).status).toBe(200);
      expect((await post('verify-otp', { email, otp })).status).toBe(400);
    });

    // BUG-03: the reset token stays valid for its whole 10-minute lifetime
    // and can be replayed to change the password again (e.g. by anyone who
    // saw the link/token), because nothing marks it as consumed.
    it('BUG-03: a reset token should be single-use', async () => {
      const again = await post(
        'reset-password',
        { newPassword: 'Attacker999' },
        bearer(resetToken),
      );
      expect(again.status).toBe(400);
    });

    it('access token cannot be used as a reset token', async () => {
      const r = await post(
        'reset-password',
        { newPassword: 'Whatever123' },
        bearer(adminToken),
      );
      expect(r.status).toBe(400);
    });

    it('missing reset token → 400', async () => {
      const r = await post('reset-password', { newPassword: 'Whatever123' });
      expect(r.status).toBe(400);
    });

    it('resend-otp (reset) issues a fresh OTP', async () => {
      const n = ctx.mails.length;
      const r = await ctx
        .http()
        .post(`${API}/auth/resend-otp?type=reset`)
        .send({ email });
      expect(r.status).toBe(200);
      expect(ctx.mails.length).toBe(n + 1);
    });

    // BUG-04: a 6-digit OTP has no attempt limit. Wrong guesses are only
    // bounded by the global rate limit, and the OTP itself is not
    // invalidated after N failures.
    it(
      'BUG-04: OTP should be invalidated after repeated wrong guesses',
      async () => {
        await post('forgot-password', { email });
        const real = ctx.lastOtp(email);
        const wrong = real === '123456' ? '654321' : '123456';
        for (let i = 0; i < 10; i++)
          await post('verify-otp', { email, otp: wrong });
        const r = await post('verify-otp', { email, otp: real });
        expect(r.status).toBe(400);
      },
    );

    it('a few wrong OTP guesses still allow the real code', async () => {
      await post('forgot-password', { email });
      const real = ctx.lastOtp(email);
      const wrong = real === '123456' ? '654321' : '123456';
      for (let i = 0; i < 4; i++) {
        const r = await post('verify-otp', { email, otp: wrong });
        expect(r.body.message).toMatch(/Incorrect OTP/);
      }
      expect((await post('verify-otp', { email, otp: real })).status).toBe(200);
    });
  });

  // ── Users controller ────────────────────────────────────────────────────────
  describe('/users', () => {
    let m: { id: string; token: string };
    beforeAll(async () => {
      m = await createMurabbi(ctx, adminToken, 'users.ctrl@e2e.test');
    });

    it('GET /users/profile returns own profile, no password', async () => {
      const r = await ctx
        .http()
        .get(`${API}/users/profile`)
        .set(bearer(m.token));
      expect(r.status).toBe(200);
      expect(r.body.data.email).toBe('users.ctrl@e2e.test');
      expect(r.body.data.password).toBeUndefined();
    });

    it('PATCH /users/profile updates allowed fields only', async () => {
      // Privileged fields are rejected outright (validated DTO since BUG-05).
      const bad = await ctx
        .http()
        .patch(`${API}/users/profile`)
        .set(bearer(m.token))
        .send({ fullName: 'Renamed', role: 'admin', tier: 3 });
      expect(bad.status).toBe(400);
      const r = await ctx
        .http()
        .patch(`${API}/users/profile`)
        .set(bearer(m.token))
        .send({ fullName: 'Renamed', bio: 'Hello', phone: '' });
      expect(r.status).toBe(200);
      const doc = await ctx.db
        .collection('users')
        .findOne({ email: 'users.ctrl@e2e.test' });
      expect(doc.fullName).toBe('Renamed');
      expect(doc.role).toBe('murabbi');
      expect(doc.tier).toBe(1);
    });

    // BUG-05: PATCH /users/profile takes `@Body() body: any`, so no DTO
    // validation runs: phone format (validated everywhere else) and the image
    // URL are stored as-is — e.g. a `javascript:` URL the UI renders.
    it(
      'BUG-05: PATCH /users/profile should validate phone format and image URL',
      async () => {
        const r = await ctx
          .http()
          .patch(`${API}/users/profile`)
          .set(bearer(m.token))
          .send({ phone: 'call me maybe!!', image: 'javascript:alert(1)' });
        expect(r.status).toBe(400);
      },
    );

    it('change-password: wrong current password → 401', async () => {
      const r = await ctx
        .http()
        .post(`${API}/users/change-password`)
        .set(bearer(m.token))
        .send({ currentPassword: 'Nope12345', newPassword: 'Another123' });
      expect(r.status).toBe(401);
    });

    // BUG-06: change-password has no password-strength rules, unlike signup
    // and reset (min 8 chars, 1 uppercase, 1 digit).
    it(
      'BUG-06: change-password should enforce the password policy',
      async () => {
        const r = await ctx
          .http()
          .post(`${API}/users/change-password`)
          .set(bearer(m.token))
          .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'a' });
        expect(r.status).toBe(400);
      },
    );

    // BUG-07: non-string currentPassword reaches bcrypt.compare and crashes → 500.
    it(
      'BUG-07: change-password with a non-string password should be 400, not 500',
      async () => {
        const r = await ctx
          .http()
          .post(`${API}/users/change-password`)
          .set(bearer(m.token))
          .send({ currentPassword: { a: 1 }, newPassword: 'Valid1234' });
        expect(r.status).toBe(400);
      },
    );

    it('GET /users is admin-only', async () => {
      expect(
        (await ctx.http().get(`${API}/users`).set(bearer(m.token))).status,
      ).toBe(403);
      const r = await ctx.http().get(`${API}/users`).set(bearer(adminToken));
      expect(r.status).toBe(200);
      expect(
        r.body.data.every(
          (u: any) => u.password === undefined && u.refreshTokens === undefined,
        ),
      ).toBe(true);
    });

    it('PATCH /users/:id/deactivate with a malformed id → 400', async () => {
      const r = await ctx
        .http()
        .patch(`${API}/users/bad-id/deactivate`)
        .set(bearer(adminToken));
      expect(r.status).toBe(400);
    });

    // BUG-08: an admin can deactivate their own account (or the only other
    // admin) via /users/:id/deactivate or /admin/murabbis/:id/deactivate,
    // locking everyone out of the admin portal.
    it(
      'BUG-08: admin accounts should not be deactivatable through these endpoints',
      async () => {
        const me = await ctx
          .http()
          .get(`${API}/auth/me`)
          .set(bearer(adminToken));
        const second = await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD);
        const r = await ctx
          .http()
          .patch(`${API}/admin/murabbis/${me.body.data.id}/deactivate`)
          .set(bearer(second.accessToken));
        try {
          expect(r.status).toBeGreaterThanOrEqual(400);
        } finally {
          await ctx.db
            .collection('users')
            .updateOne({ email: ADMIN_EMAIL }, { $set: { isActive: true } });
          adminToken = (await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD))
            .accessToken;
        }
      },
    );
  });
});
