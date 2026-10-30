import { ADMIN_EMAIL, API, bearer, createApp, E2EContext, seedWorld, signIn } from './helpers';

const linkIn = (html: string, path: string) => {
  const m = new RegExp(`href="(https?://[^"]*${path}[^"]*)"`).exec(html);
  if (!m) throw new Error(`No ${path} link in email`);
  return m[1].replace(/&amp;/g, '&');
};

describe('Emails: automatic and admin-written', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;

  beforeAll(async () => {
    ctx = await createApp('email');
    w = await seedWorld(ctx);
  });
  afterAll(async () => ctx.close());

  const as = (token: string) => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(token)),
    post: (p: string, b: object = {}) => ctx.http().post(`${API}/${p}`).set(bearer(token)).send(b),
    put: (p: string, b: object = {}) => ctx.http().put(`${API}/${p}`).set(bearer(token)).send(b),
    patch: (p: string, b: object = {}) => ctx.http().patch(`${API}/${p}`).set(bearer(token)).send(b),
    del: (p: string) => ctx.http().delete(`${API}/${p}`).set(bearer(token)),
  });
  const adm = () => as(w.admin);
  const to = (email: string, subject: RegExp) => ctx.waitForEmail((e) => e.to === email && subject.test(e.subject));

  describe('accounts', () => {
    it('admin-created murabbis get a welcome email with a set-password link', async () => {
      const e = await to('a@e2e.test', /account is ready/);
      expect(e.html).toContain('Set my password');
      expect(e.html).toContain('خوش آمدید');
      expect(e.text).toMatch(/Set my password: http:\/\/localhost:5173\/welcome\//);
    });

    it('the link shows who it is for, sets the password once and signs in', async () => {
      const e = await to('b@e2e.test', /account is ready/);
      const token = linkIn(e.html, '/welcome/').split('/welcome/')[1];
      const info = await ctx.http().get(`${API}/auth/set-password/${token}`);
      expect(info.body.data).toMatchObject({ email: 'b@e2e.test', role: 'murabbi' });

      const weak = await ctx.http().post(`${API}/auth/set-password`).send({ token, newPassword: 'short' });
      expect(weak.status).toBe(400);
      const r = await ctx.http().post(`${API}/auth/set-password`).send({ token, newPassword: 'Bilal2026x' });
      expect(r.status).toBe(200);
      expect(r.body.data.accessToken).toBeTruthy();
      expect(r.body.data.user).toMatchObject({ email: 'b@e2e.test', mustChangePassword: false });
      expect((await signIn(ctx, 'b@e2e.test', 'Bilal2026x')).accessToken).toBeTruthy();
      expect((await ctx.http().post(`${API}/auth/set-password`).send({ token, newPassword: 'Another2026' })).status).toBe(400);
      expect((await ctx.http().get(`${API}/auth/set-password/nonsense`)).status).toBe(400);
      // Setting a password from the link isn't a "your password changed" event.
      await new Promise((res) => setTimeout(res, 150));
      expect(ctx.emails.some((x) => x.to === 'b@e2e.test' && /password was changed/.test(x.subject))).toBe(false);
    });

    it('changing a password sends a security notice', async () => {
      await as(w.A.token).post('users/change-password', { currentPassword: 'Password123', newPassword: 'NewPass2026' });
      const e = await to('a@e2e.test', /password was changed/);
      expect(e.html).toContain('If this wasn’t you');
    });

    it('converting an interest request emails the person; the admin is told it was emailed', async () => {
      await ctx.http().post(`${API}/interest`).send({
        role: 'parent', firstName: 'Sara', lastName: 'Khan', email: 'sara@e2e.test', phone: '03004445566', city: 'Karachi', neighbourhood: 'Gulshan', roleDetail: '6–8 years',
      });
      const thanks = await to('sara@e2e.test', /Thank you for your interest/);
      expect(thanks.html.indexOf('ہم آپ کے بچے')).toBeLessThan(thanks.html.indexOf('We’ll find the nearest circle')); // Urdu first for parents
      const alert = await to('support@noorcircles.com', /New parent interest: Sara Khan/);
      expect(alert.html).toContain('03004445566');

      const id = (await adm().get('interest')).body.data.find((i: any) => i.email === 'sara@e2e.test')._id;
      const r = await adm().post(`interest/${id}/account`);
      expect(r.body.data.emailed).toBe(true);
      const welcome = await to('sara@e2e.test', /account is ready/);
      expect(welcome.html).toContain('آپ کے خاندان کا Noor Circles اکاؤنٹ');

      const reset = await adm().post(`accounts/${r.body.data.account.id}/reset-password`);
      expect(reset.body.data.emailed).toBe(true);
      await to('sara@e2e.test', /new password/);
    });

    it('interest form input is escaped in emails', async () => {
      await ctx.http().post(`${API}/interest`).send({
        role: 'mentor', firstName: '<script>x</script>', lastName: 'Evil', email: 'evil@e2e.test', phone: '03001112222', city: 'Karachi', neighbourhood: 'Gulshan',
      });
      const e = await to('evil@e2e.test', /Thank you/);
      expect(e.html).not.toContain('<script>');
      expect(e.html).toContain('&lt;script&gt;');
    });

    it('blocking and allowing sign-in are emailed', async () => {
      await adm().patch(`admin/murabbis/${w.B.id}/deactivate`);
      await to('b@e2e.test', /paused/);
      await adm().patch(`admin/murabbis/${w.B.id}/activate`);
      await to('b@e2e.test', /sign in to Noor Circles again/);
    });
  });

  describe('training', () => {
    const KEY = 'asaas-tier1';

    it('assigning the training emails the murabbi', async () => {
      await adm().post(`course/${KEY}/assign`, { userIds: [w.A.id], dueDate: '2026-12-15', note: 'Before winter' });
      const e = await to('a@e2e.test', /New training: Asaas Murabbi Training/);
      expect(e.html).toContain('Before winter');
      expect(e.html).toContain('15 December 2026');
    });

    it('reminders: not started after 3 days, then due soon; each sent once', async () => {
      const course = ctx.app.get((await import('../../src/course/course.service')).CourseService);
      await ctx.db.collection('courseassignments').updateMany({}, { $set: { createdAt: new Date(Date.now() - 4 * 24 * 3600_000) } });
      expect(await course.sendReminders(new Date('2026-12-01T06:00:00Z'))).toBe(1); // due in 14 days → only "not started"
      await to('a@e2e.test', /gentle reminder/);
      expect(await course.sendReminders(new Date('2026-12-01T07:00:00Z'))).toBe(0); // not repeated
      expect(await course.sendReminders(new Date('2026-12-09T06:00:00Z'))).toBe(1); // 6 days to go
      await to('a@e2e.test', /Due in 7 days/);
      expect(await course.sendReminders(new Date('2026-12-14T06:00:00Z'))).toBe(1);
      await to('a@e2e.test', /Due tomorrow/);
      expect(await course.sendReminders(new Date('2026-12-20T06:00:00Z'))).toBe(1);
      await to('a@e2e.test', /past its due date/);
    });

    it('people can switch reminders off, from their settings or the email link', async () => {
      const prefs = await as(w.A.token).get('email/preferences');
      expect(prefs.body.data.categories).toEqual([{ key: 'training-reminders', on: true }, { key: 'announcements', on: true }]);
      const reminder = ctx.emails.find((e) => e.to === 'a@e2e.test' && /gentle reminder/.test(e.subject))!;
      expect(reminder.headers?.['List-Unsubscribe']).toMatch(/email\/unsubscribe\?t=/);
      const token = new URL(linkIn(reminder.html, '/email/unsubscribe')).searchParams.get('t')!;
      const r = await ctx.http().post(`${API}/email/unsubscribe`).send({ token });
      expect(r.body.data).toMatchObject({ category: 'training-reminders', subscribed: false });
      expect((await ctx.http().post(`${API}/email/unsubscribe`).send({ token: `${token}x` })).status).toBe(400);
      const after = await as(w.A.token).get('email/preferences');
      expect(after.body.data.categories[0]).toEqual({ key: 'training-reminders', on: false });
      // Turn it back on from settings.
      await as(w.A.token).put('email/preferences', { on: { 'training-reminders': true, announcements: true } });
      expect((await as(w.A.token).get('email/preferences')).body.data.categories[0].on).toBe(true);
    });

    it('results: every lesson heard, assessment, reflection, certificate with the PDF attached', async () => {
      const oid = (id: string) => new (require('mongoose').Types.ObjectId)(id);
      const course = await ctx.db.collection('courses').findOne({ key: KEY }) as any;
      const lessons = await ctx.db.collection('courselessons').find({ course: course._id }).sort({ order: 1 }).toArray();
      // All but the last lesson heard; the last one completes through a heartbeat.
      await ctx.db.collection('lessonprogresses').insertMany(lessons.slice(0, -1).map((l: any) => ({
        course: course._id, lesson: l._id, user: oid(w.A.id), completed: true, percent: 100, heardSec: l.durationSec, heard: [[0, l.durationSec]],
      })));
      const last = lessons[lessons.length - 1] as any;
      await ctx.db.collection('lessonprogresses').insertOne({
        course: course._id, lesson: last._id, user: oid(w.A.id), heard: [[0, last.durationSec - 3]], heardSec: last.durationSec - 3,
        lastBeatAt: new Date(Date.now() - 30_000),
      });
      const hb = await as(w.A.token).post(`course/lessons/${last._id}/heartbeat`, { segments: [[last.durationSec - 3, last.durationSec]], position: last.durationSec });
      expect(hb.body.data.justCompleted).toBe(true);
      await to('a@e2e.test', /heard every lesson/);

      const answers = course.questions.map((q: any) => q.correctIndex);
      await as(w.A.token).post(`course/${KEY}/assessment`, { answers: answers.map((a: number) => (a + 1) % 4) });
      const fail = await to('a@e2e.test', /Assessment result: 0%/);
      expect(fail.html).toContain('2 more attempts');
      await as(w.A.token).post(`course/${KEY}/assessment`, { answers });
      await to('a@e2e.test', /You passed the assessment: 100%/);

      await as(w.A.token).post(`course/${KEY}/reflection`, { text: 'I learned to start from what is good in each child. '.repeat(8) });
      const refl = (await adm().get(`course/${KEY}/reflections?status=submitted`)).body.data[0];
      await adm().patch(`course/reflections/${refl._id}`, { status: 'approved' });
      await to('a@e2e.test', /reflection was approved/);
      const cert = await to('a@e2e.test', /You are a Certified Asaas Murabbi/);
      expect(cert.attachments?.[0].filename).toBe('Noor-Circles-Certificate.pdf');
      expect(cert.attachments?.[0].content.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('parents and contributions', () => {
    it('registering a parent with an email sends the family welcome (once)', async () => {
      const r = await adm().post('parents', { fullName: 'Hina Ali', phone: '03111111111', email: 'hina@e2e.test', studentIds: [w.studentA] });
      expect(r.body.message).toMatch(/welcome email/);
      const e = await to('hina@e2e.test', /Welcome to Noor Circles/);
      expect(e.html).toContain('Circle A');
      expect(e.html).toMatch(/href="http:\/\/localhost:5173\/family\/[a-f\d]{24}\.\d+\./);
      const id = (r.body.data.parent ?? r.body.data)._id;
      await adm().patch(`parents/${id}`, { email: 'hina@e2e.test' });
      await new Promise((res) => setTimeout(res, 150));
      expect(ctx.emails.filter((x) => x.to === 'hina@e2e.test' && /Welcome/.test(x.subject))).toHaveLength(1);
    });

    it('a website pledge gets a thank-you; a recorded payment gets a receipt', async () => {
      await ctx.http().post(`${API}/contributions/public/checkout`).send({ fullName: 'Zain Ahmed', email: 'zain@e2e.test', phone: '03001231234', amount: 1000, frequency: 'monthly' });
      await to('zain@e2e.test', /JazakAllah khair for supporting/);
      const c = (await adm().get('contributions/contributors?search=Zain')).body.data;
      const contributor = (Array.isArray(c) ? c : c.items ?? c.contributors)[0];
      const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
      const p = await adm().post('contributions/payments', { contributorId: contributor._id, amount: 1000, month, method: 'jazzcash' });
      expect(p.status).toBe(201);
      const receipt = await to('zain@e2e.test', /^Receipt NC-/);
      expect(receipt.html).toContain('PKR 1,000');
      expect(receipt.html).toContain('JazzCash');
    });
  });

  describe('admin-written group emails', () => {
    it('is admin-only', async () => {
      expect((await as(w.A.token).post('email/audience', { type: 'murabbis' })).status).toBe(403);
      expect((await as(w.A.token).get('email/logs')).status).toBe(403);
    });

    it('previews the audience, including who has no email or has unsubscribed', async () => {
      const r = await adm().post('email/audience', { type: 'parents' });
      expect(r.body.data).toMatchObject({ label: 'All parents', count: 2, withoutEmail: 0 }); // Hina, and Sara from her interest request
      const circle = await adm().post('email/audience', { type: 'parents-circle', ids: [w.circleB] });
      expect(circle.body.data.count).toBe(0);
      expect((await adm().post('email/audience', { type: 'parents-circle' })).status).toBe(400);
      const m = await adm().post('email/audience', { type: 'murabbis' });
      expect(m.body.data.count).toBe(2);
    });

    it('a test goes only to the admin', async () => {
      const r = await adm().post('email/campaigns', { subject: 'Eid gathering', body: 'Hello {name}', audience: { type: 'murabbis' }, testOnly: true });
      expect(r.body.message).toMatch(/Test email sent/);
      await to(ADMIN_EMAIL, /\[Test\] Eid gathering/);
    });

    it('sends to everyone in the audience, personalised, bilingual by paragraph', async () => {
      const body = 'Assalam-o-Alaikum {name},\n\nOur Eid gathering is on Friday at 5 pm.\n\nعید کا اجتماع جمعہ کو شام 5 بجے ہوگا۔\n\nJazakAllah khair,\nNoor Circles team';
      const r = await adm().post('email/campaigns', { subject: 'Eid gathering for {name}', body, audience: { type: 'murabbis' } });
      expect(r.status).toBe(201);
      expect(r.body.message).toMatch(/Sending to 2 people/);
      const a = await to('a@e2e.test', /Eid gathering for Murabbi/);
      expect(a.html).toContain('Assalam-o-Alaikum Murabbi,');
      expect(a.html).toMatch(/dir="rtl"[^>]*>عید کا اجتماع/);
      expect(a.html).toContain('JazakAllah khair,<br>Noor Circles team');
      expect(a.headers?.['List-Unsubscribe']).toBeTruthy();
      await to('b@e2e.test', /Eid gathering/);
      const list = await adm().get('email/campaigns');
      expect(list.body.data[0]).toMatchObject({ subject: 'Eid gathering for {name}', recipients: 2, sent: 2, failed: 0 });
    });

    it('scheduled emails wait, can be cancelled, and go out when due', async () => {
      const later = new Date(Date.now() + 3600_000).toISOString();
      const r = await adm().post('email/campaigns', { subject: 'Scheduled note', body: 'Later', audience: { type: 'murabbis' }, scheduledFor: later });
      expect(r.body.message).toMatch(/Scheduled for/);
      const id = r.body.data.campaign._id;
      const r2 = await adm().post('email/campaigns', { subject: 'Cancelled note', body: 'Never', audience: { type: 'murabbis' }, scheduledFor: later });
      await adm().post(`email/campaigns/${r2.body.data.campaign._id}/cancel`);

      await ctx.db.collection('emailcampaigns').updateMany({}, { $set: { scheduledFor: new Date(Date.now() - 1000) } });
      const svc = ctx.app.get((await import('../../src/email/email.service')).EmailService);
      await svc.tick();
      await to('b@e2e.test', /Scheduled note/);
      expect(ctx.emails.some((e) => /Cancelled note/.test(e.subject))).toBe(false);
      const list = (await adm().get('email/campaigns')).body.data;
      expect(list.find((c: any) => c._id === id)).toMatchObject({ sent: 2, status: 'queued' });
      expect(list.find((c: any) => c._id === r2.body.data.campaign._id).status).toBe('cancelled');
    });

    it('unsubscribed people are skipped and counted', async () => {
      const e = ctx.emails.find((x) => x.to === 'b@e2e.test' && /Eid gathering/.test(x.subject))!;
      const token = new URL(linkIn(e.html, '/email/unsubscribe')).searchParams.get('t')!;
      await ctx.http().post(`${API}/email/unsubscribe`).send({ token });
      expect((await adm().post('email/audience', { type: 'murabbis' })).body.data).toMatchObject({ count: 1, optedOut: 1 });
      const r = await adm().post('email/campaigns', { subject: 'Second note', body: 'Hi', audience: { type: 'murabbis' } });
      expect(r.body.message).toMatch(/Sending to 1 person \(1 unsubscribed\)/);
    });

    it('the log shows every email; failures retry and can be retried by hand', async () => {
      ctx.setMailFailing(true);
      await adm().post('email/campaigns', { subject: 'Will fail', body: 'x', audience: { type: 'parents' } });
      await new Promise((res) => setTimeout(res, 200));
      ctx.setMailFailing(false);
      let logs = (await adm().get('email/logs?search=Will fail')).body.data;
      expect(logs.items[0]).toMatchObject({ status: 'queued', attempts: 1, error: 'SMTP down' });
      expect(logs.items[0].html).toBeUndefined();
      await ctx.db.collection('emaillogs').updateMany({ subject: 'Will fail' }, { $set: { status: 'failed' } });
      const id = logs.items[0]._id;
      expect((await adm().post(`email/logs/${id}/retry`)).status).toBe(200);
      await ctx.waitForEmail((e) => /Will fail/.test(e.subject));
      logs = (await adm().get('email/logs?status=sent&kind=campaign')).body.data;
      expect(logs.total).toBeGreaterThanOrEqual(4);
      expect(logs.today.limit).toBeGreaterThan(0);
      const one = await adm().get(`email/logs/${id}`);
      expect(one.body.data.html).toContain('NOOR CIRCLES');
    });

    it('admins can see a sample of every automatic email', async () => {
      const r = await adm().get('email/samples');
      expect(r.body.data.length).toBeGreaterThanOrEqual(19);
      expect(r.body.data.find((s: any) => s.kind === 'training.reminder')).toMatchObject({ optional: true });
      expect(r.body.data.find((s: any) => s.kind === 'account.welcome').html).toContain('Set my password');
    });
  });
});
