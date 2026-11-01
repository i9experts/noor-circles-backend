import { ADMIN_EMAIL, ADMIN_PASSWORD, API, bearer, createApp, E2EContext, signIn, seedWorld } from './helpers';

const TEMP = /^Noor-\d{4}-[A-Z][a-z]{3}$/;

describe('Accounts from interest requests and parents', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('accounts');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const signin = (email: string, password: string) => ctx.http().post(`${API}/auth/signin`).send({ email, password });

  const interest = (role: string, first: string, email: string, phone: string, roleDetail = '') =>
    ctx.http().post(`${API}/interest`).send({
      role, firstName: first, lastName: 'Khan', email, phone, city: 'Karachi', neighbourhood: 'Gulshan', roleDetail,
    });
  const interestId = async (email: string) => {
    const r = await adm().get('interest');
    return r.body.data.find((i: any) => i.email === email)._id as string;
  };

  describe('mentor → murabbi account', () => {
    let creds: { email: string; password: string; loginUrl: string };
    let userId: string;

    it('creates a murabbi with a temporary password and assigns the training', async () => {
      await interest('mentor', 'Bilal', 'bilal@e2e.test', '0300 1112233', 'Educator / teacher');
      const id = await interestId('bilal@e2e.test');
      const r = await adm().post(`interest/${id}/account`, { assignTraining: true });
      expect(r.status).toBe(201);
      creds = r.body.data.credentials;
      userId = r.body.data.account.id;
      expect(r.body.data.account).toMatchObject({ role: 'murabbi', fullName: 'Bilal Khan', email: 'bilal@e2e.test' });
      expect(creds.password).toMatch(TEMP);
      expect(creds.loginUrl).toBe('http://localhost:5173/signin');
      expect(r.body.data.training).toBe('Asaas training assigned.');

      const list = await adm().get('interest');
      const row = list.body.data.find((i: any) => i._id === id);
      expect(row.status).toBe('contacted');
      expect(row.account).toMatchObject({ email: 'bilal@e2e.test', role: 'murabbi', mustChangePassword: true, lastLoginAt: null });
    });

    it('signs in with the temporary password and is asked to choose their own', async () => {
      const r = await signin(creds.email, creds.password);
      expect(r.status).toBe(200);
      expect(r.body.data.user).toMatchObject({ role: 'murabbi', mustChangePassword: true });
      const token = r.body.data.accessToken;
      expect((await as(token).get('course/my')).body.data).toHaveLength(1);

      const ch = await as(token).post('users/change-password', { currentPassword: creds.password, newPassword: 'MyOwnPass9' });
      expect(ch.status).toBe(200);
      const again = await signin(creds.email, 'MyOwnPass9');
      expect(again.body.data.user.mustChangePassword).toBe(false);
      expect((await as(again.body.data.accessToken).get('auth/me')).body.data.mustChangePassword).toBe(false);
    });

    it('can’t be converted twice', async () => {
      const id = await interestId('bilal@e2e.test');
      expect((await adm().post(`interest/${id}/account`)).status).toBe(409);
    });

    it('an email that already has an account is refused', async () => {
      await interest('mentor', 'Dup', 'a@e2e.test', '03001234567');
      const r = await adm().post(`interest/${await interestId('a@e2e.test')}/account`);
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/already has a Noor Circles account/);
    });

    it('reset password issues a new temporary one and signs them out', async () => {
      const r = await adm().post(`accounts/${userId}/reset-password`);
      expect(r.status).toBe(200);
      expect(r.body.data.credentials.password).toMatch(TEMP);
      expect((await signin('bilal@e2e.test', 'MyOwnPass9')).status).toBe(401);
      const s = await signin('bilal@e2e.test', r.body.data.credentials.password);
      expect(s.body.data.user.mustChangePassword).toBe(true);
    });

    it('hosts don’t get accounts; only admins can create them', async () => {
      await interest('host', 'Masjid', 'host@e2e.test', '03009998877', 'Masjid');
      const id = await interestId('host@e2e.test');
      expect((await adm().post(`interest/${id}/account`)).status).toBe(400);
      expect((await as(w.A.token).post(`interest/${id}/account`)).status).toBe(403);
      expect((await as(w.A.token).post(`accounts/${userId}/reset-password`)).status).toBe(403);
    });

    it('admin accounts can’t be reset from here', async () => {
      const admin = await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD);
      expect((await adm().post(`accounts/${admin.user.id}/reset-password`)).status).toBe(404);
    });
  });

  describe('parent accounts', () => {
    let parentId: string;
    let creds: { email: string; password: string };
    let parentToken: string;
    let parentUserId: string;

    it('links to the parent already on file (matched by phone) and sees their child', async () => {
      const p = await adm().post('parents', { fullName: 'Sara Khan', phone: '03004445566', studentIds: [w.studentA] });
      expect(p.status).toBe(201);
      parentId = (p.body.data.parent ?? p.body.data)._id;

      await interest('parent', 'Sara', 'sara@e2e.test', '+92 300 4445566', '6–8 years');
      const r = await adm().post(`interest/${await interestId('sara@e2e.test')}/account`);
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ parentId, linkedExisting: true });
      expect(r.body.data.account.role).toBe('parent');
      creds = r.body.data.credentials;
      parentUserId = r.body.data.account.id;

      const s = await signin(creds.email, creds.password);
      expect(s.body.data.user).toMatchObject({ role: 'parent', mustChangePassword: true });
      parentToken = s.body.data.accessToken;
      const fam = await as(parentToken).get('family/me');
      expect(fam.status).toBe(200);
      expect(fam.body.data.children.map((c: any) => c.fullName)).toEqual(['Student A']);
    });

    it('the parents list shows the account; the record now has the email', async () => {
      const r = await adm().get('parents');
      const row = r.body.data.find((p: any) => p._id === parentId);
      expect(row.email).toBe('sara@e2e.test');
      expect(row.account).toMatchObject({ email: 'sara@e2e.test', isActive: true });
    });

    it('a new parent record is created when none matches', async () => {
      await interest('parent', 'Hina', 'hina@e2e.test', '03117778899', '9–10 years');
      const r = await adm().post(`interest/${await interestId('hina@e2e.test')}/account`);
      expect(r.body.data.linkedExisting).toBe(false);
      const s = await signin('hina@e2e.test', r.body.data.credentials.password);
      const fam = await as(s.body.data.accessToken).get('family/me');
      expect(fam.body.data.children).toEqual([]);
    });

    it('parents only reach their own family page', async () => {
      const t = as(parentToken);
      for (const p of ['murabbi/dashboard', 'parents', 'announcements', 'admin/murabbis', 'sessions', 'training/modules', 'syllabus/my-agenda', 'interest', 'trainings/admin/requests', 'parent-ratings']) {
        expect([p, (await t.get(p)).status]).toEqual([p, 403]);
      }
      expect((await as(w.A.token).get('family/me')).status).toBe(403);
    });

    it('creates a login for a parent on file; needs an email', async () => {
      const p = await adm().post('parents', { fullName: 'Omar Ali', phone: '03215550000', studentIds: [w.studentB] });
      const id = (p.body.data.parent ?? p.body.data)._id;
      const none = await adm().post(`parents/${id}/account`);
      expect(none.status).toBe(400);
      expect(none.body.message).toMatch(/email/);
      const r = await adm().post(`parents/${id}/account`, { email: 'Omar@E2E.test' });
      expect(r.status).toBe(201);
      expect(r.body.data.credentials).toMatchObject({ email: 'omar@e2e.test' });
      expect((await adm().post(`parents/${id}/account`, { email: 'omar2@e2e.test' })).status).toBe(409);
    });

    it('blocking access stops sign-in; allowing it again restores it', async () => {
      const off = await adm().patch(`accounts/${parentUserId}/access`, { active: false });
      expect(off.body.data.isActive).toBe(false);
      expect((await signin(creds.email, creds.password)).status).toBe(401);
      await adm().patch(`accounts/${parentUserId}/access`, { active: true });
      expect((await signin(creds.email, creds.password)).status).toBe(200);
    });

    it('deleting the parent record removes their sign-in', async () => {
      expect((await adm().del(`parents/${parentId}`)).status).toBe(200);
      expect((await signin(creds.email, creds.password)).status).toBe(401);
    });
  });
});
