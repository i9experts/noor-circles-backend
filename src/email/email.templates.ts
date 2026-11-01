// Email templates. Every email is bilingual: Urdu first for parents, English
// first for murabbis. Values are always HTML-escaped; `**bold**` in a
// paragraph becomes <strong> (after escaping).

export interface Rendered { subject: string; html: string; text: string }

type Lang = 'ur-first' | 'en-first';

interface Content {
  subject: string;
  preheader?: string;
  heading: string;
  headingUr?: string;
  en: string[];
  ur?: string[];
  facts?: [string, string][];
  button?: { label: string; labelUr?: string; url: string };
  /** Small print under the main content (English). */
  note?: string;
}

export interface LayoutOptions {
  portalUrl: string;
  supportEmail: string;
  /** Shown for kinds people can switch off. */
  unsubscribeUrl?: string;
  lang?: Lang;
}

const PLUM = '#691c46';
const GOLD = '#c79446';
const INK = '#2b1a24';
const MUTED = '#74646d';
const URDU = "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Urdu Typesetting',serif";

export const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Escapes, turns **x** into bold and keeps single line breaks. */
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\r?\n/g, '<br>');
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1');
const urduChars = (s: string) => (s.match(/[\u0600-\u06FF]/g) ?? []).length;
const latinChars = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length;
const isMostlyUrdu = (s: string) => urduChars(s) > latinChars(s);
/** Subjects come partly from user input: one line only. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);

function block(paras: string[], urdu: boolean) {
  const style = urdu
    ? `margin:0 0 14px;font-family:${URDU};font-size:17px;line-height:2.1;direction:rtl;text-align:right;color:${INK}`
    : `margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${INK}`;
  return paras.map((p) => `<p dir="${urdu ? 'rtl' : 'ltr'}" style="${style}">${rich(p)}</p>`).join('');
}

export function layout(c: Content, o: LayoutOptions): Rendered {
  const urFirst = o.lang === 'ur-first';
  const enHtml = `<h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:24px;line-height:1.25;color:${PLUM}">${esc(c.heading)}</h1>${block(c.en, false)}`;
  const urHtml = c.ur?.length
    ? `${c.headingUr ? `<h2 dir="rtl" style="margin:0 0 8px;font-family:${URDU};font-weight:700;font-size:21px;line-height:2;text-align:right;color:${PLUM}">${esc(c.headingUr)}</h2>` : ''}${block(c.ur, true)}`
    : '';
  const sep = urHtml ? `<div style="height:1px;background:#eadfd3;margin:18px 0"></div>` : '';
  const facts = c.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px;border-collapse:collapse">${c.facts.map(([k, v]) =>
      `<tr><td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;color:${MUTED};width:40%">${esc(k)}</td><td dir="auto" style="padding:7px 10px;border-bottom:1px solid #eee;font-family:Arial,${URDU};font-size:14px;color:${INK}">${esc(v)}</td></tr>`).join('')}</table>`
    : '';
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:8px;background:${PLUM}"><a href="${esc(c.button.url)}" style="display:inline-block;padding:12px 22px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${esc(c.button.label)}${c.button.labelUr ? ` · <span style="font-family:${URDU}">${esc(c.button.labelUr)}</span>` : ''}</a></td></tr></table>`
    : '';
  const main = urFirst ? `${urHtml}${sep}${enHtml}` : `${enHtml}${sep}${urHtml}`;
  const note = c.note ? `<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.5;color:${MUTED}">${rich(c.note)}</p>` : '';
  const unsub = o.unsubscribeUrl
    ? ` · <a href="${esc(o.unsubscribeUrl)}" style="color:${MUTED}">Unsubscribe from these emails</a>`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4ede4">
<span style="display:none!important;opacity:0;color:transparent;max-height:0;overflow:hidden">${esc(c.preheader ?? '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4ede4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffdf8;border-radius:12px;overflow:hidden;border:1px solid #eadfd3">
<tr><td style="background:${PLUM};padding:18px 26px"><span style="font-family:Arial,sans-serif;font-size:18px;font-weight:bold;letter-spacing:2px;color:#ffffff">NOOR CIRCLES</span><br><span style="font-family:Arial,sans-serif;font-size:11.5px;color:${GOLD}">A Circle of Light in Every Neighbourhood</span></td></tr>
<tr><td style="padding:26px 26px 8px">${main}${facts}${button}${note}</td></tr>
<tr><td style="padding:14px 26px 22px;border-top:1px solid #eadfd3;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED}">
Questions? Just reply to this email, or write to <a href="mailto:${esc(o.supportEmail)}" style="color:${PLUM}">${esc(o.supportEmail)}</a>.<br>
Noor Circles · The Deen Way (TDW) Education Network · <a href="${esc(o.portalUrl)}" style="color:${MUTED}">${esc(o.portalUrl.replace(/^https?:\/\//, ''))}</a>${unsub}
</td></tr></table></td></tr></table></body></html>`;

  const textParts = [
    c.heading, '', ...c.en.map(plain),
    ...(c.ur?.length ? ['', ...(c.headingUr ? [c.headingUr] : []), ...c.ur.map(plain)] : []),
    ...(c.facts?.length ? ['', ...c.facts.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.button ? ['', `${c.button.label}: ${c.button.url}`] : []),
    ...(c.note ? ['', plain(c.note)] : []),
    '', '—', `Noor Circles · ${o.supportEmail}`,
    ...(o.unsubscribeUrl ? [`Unsubscribe: ${o.unsubscribeUrl}`] : []),
  ];
  return { subject: oneLine(c.subject), html, text: textParts.join('\n') };
}

const first = (name: string) => (name || '').trim().split(/\s+/)[0] || 'there';
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' });
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`;

// ── Content for each kind ────────────────────────────────────────────────────

export type TemplateData = Record<string, any>;

export const TEMPLATES: Record<string, { lang: (d: TemplateData) => Lang; build: (d: TemplateData) => Content }> = {
  // 1. Account created
  'account.welcome': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: `Your Noor Circles account is ready · آپ کا اکاؤنٹ تیار ہے`,
      preheader: 'Set your password to sign in.',
      heading: `Assalam-o-Alaikum ${first(d.name)}, welcome to Noor Circles`,
      headingUr: `خوش آمدید، ${first(d.name)}`,
      en: [
        d.role === 'parent'
          ? 'Your family now has a Noor Circles account. Once you sign in you can follow your child’s circle: attendance, this week’s topic and home activity, the calendar and notes from the murabbi.'
          : d.role === 'supervisor'
            ? 'Your cluster supervisor account is ready. Sign in to see the circles in your cluster, log your visits and support the murabbis and families.'
            : 'Your murabbi account is ready. Sign in to see your circles, your weekly agenda and your training.',
        `Your sign-in name is **${d.email}**. Use the button below to choose your password (the link works for ${d.expiresHours} hours). If the team has already given you a temporary password, you can use that instead.`,
      ],
      ur: [
        d.role === 'parent'
          ? 'آپ کے خاندان کا Noor Circles اکاؤنٹ بن گیا ہے۔ سائن اِن کر کے آپ اپنے بچے کے circle کی حاضری، اس ہفتے کا موضوع، گھر کی سرگرمی، کیلنڈر اور مربی کے نوٹس دیکھ سکتے ہیں۔'
          : d.role === 'supervisor'
            ? 'آپ کا کلسٹر سپروائزر اکاؤنٹ تیار ہے۔ سائن اِن کر کے اپنے کلسٹر کے circles دیکھیں، وزٹ رپورٹ لکھیں اور مربیوں اور خاندانوں کا ساتھ دیں۔'
            : 'آپ کا مربی اکاؤنٹ تیار ہے۔ سائن اِن کر کے اپنے circles، ہفتہ وار ایجنڈا اور تربیت دیکھیں۔',
        'نیچے دیے گئے بٹن سے اپنا پاس ورڈ بنائیں۔',
      ],
      button: { label: 'Set my password', labelUr: 'پاس ورڈ بنائیں', url: d.setPasswordUrl },
      note: `After that, sign in any time at ${d.loginUrl}`,
    }),
  },

  // 2. Admin reset the password
  'account.reset': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: 'Set a new password for Noor Circles · نیا پاس ورڈ',
      heading: `A new password for your account`,
      headingUr: 'نیا پاس ورڈ',
      en: [
        `Assalam-o-Alaikum ${first(d.name)}. The Noor Circles team has reset your password. Choose a new one with the button below (the link works for ${d.expiresHours} hours).`,
        'Your old password no longer works.',
      ],
      ur: ['Noor Circles ٹیم نے آپ کا پاس ورڈ ری سیٹ کیا ہے۔ نیچے دیے گئے بٹن سے نیا پاس ورڈ بنائیں۔ پرانا پاس ورڈ اب کام نہیں کرے گا۔'],
      button: { label: 'Set a new password', labelUr: 'نیا پاس ورڈ', url: d.setPasswordUrl },
      note: 'If you didn’t expect this, reply to this email and let us know.',
    }),
  },

  // 4. Self-registered murabbi approved / declined
  'account.approved': {
    lang: () => 'en-first',
    build: (d) => ({
      subject: 'Your Noor Circles account is approved · اکاؤنٹ منظور',
      heading: `MashaAllah ${first(d.name)}, your account is approved`,
      headingUr: 'آپ کا اکاؤنٹ منظور ہو گیا ہے',
      en: ['You can now sign in to the murabbi portal with the email and password you registered with.'],
      ur: ['اب آپ اپنے ای میل اور پاس ورڈ سے مربی پورٹل میں سائن اِن کر سکتے ہیں۔'],
      button: { label: 'Sign in', labelUr: 'سائن اِن', url: d.loginUrl },
    }),
  },
  'account.declined': {
    lang: () => 'en-first',
    build: (d) => ({
      subject: 'About your Noor Circles registration',
      heading: `Thank you for registering, ${first(d.name)}`,
      headingUr: 'رجسٹریشن کا شکریہ',
      en: [
        'JazakAllah khair for your interest in becoming a murabbi. We aren’t able to open a portal account for you at this time.',
        'If you’d like to talk about other ways to be involved, simply reply to this email.',
      ],
      ur: ['مربی بننے میں دلچسپی کا بہت شکریہ۔ فی الحال ہم آپ کا اکاؤنٹ نہیں کھول سکتے۔ کسی اور طرح شامل ہونے کے لیے اس ای میل کا جواب دیں۔'],
    }),
  },

  // 5. Sign-in blocked / allowed
  'account.blocked': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: 'Your Noor Circles sign-in has been paused',
      heading: `Your sign-in has been paused`,
      headingUr: 'آپ کا سائن اِن روک دیا گیا ہے',
      en: [`Assalam-o-Alaikum ${first(d.name)}. Your Noor Circles account can’t be used to sign in for now. If you think this is a mistake, reply to this email.`],
      ur: ['فی الحال آپ کا اکاؤنٹ سائن اِن کے لیے بند ہے۔ اگر یہ غلطی ہے تو اس ای میل کا جواب دیں۔'],
    }),
  },
  'account.restored': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: 'You can sign in to Noor Circles again',
      heading: 'Your sign-in is active again',
      headingUr: 'آپ کا سائن اِن دوبارہ فعال ہے',
      en: [`Assalam-o-Alaikum ${first(d.name)}. You can sign in to Noor Circles again.`],
      ur: ['آپ دوبارہ Noor Circles میں سائن اِن کر سکتے ہیں۔'],
      button: { label: 'Sign in', labelUr: 'سائن اِن', url: d.loginUrl },
    }),
  },

  // 6. Password changed
  'account.password-changed': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: 'Your Noor Circles password was changed',
      heading: 'Your password was changed',
      headingUr: 'آپ کا پاس ورڈ تبدیل ہوا',
      en: [
        `Assalam-o-Alaikum ${first(d.name)}. The password for ${d.email} was changed on ${d.when}.`,
        '**If this wasn’t you,** reply to this email straight away so we can secure your account.',
      ],
      ur: ['آپ کے اکاؤنٹ کا پاس ورڈ تبدیل کیا گیا ہے۔ اگر یہ آپ نے نہیں کیا تو فوراً اس ای میل کا جواب دیں۔'],
    }),
  },

  // 7. Interest form thank-you
  'interest.thanks': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => {
      const next: Record<string, [string, string]> = {
        parent: [
          'We’ll find the nearest circle for your child and contact you on WhatsApp or by phone, in sha Allah.',
          'ہم آپ کے بچے کے لیے قریب ترین circle تلاش کر کے واٹس ایپ یا فون پر رابطہ کریں گے، ان شاء اللہ۔',
        ],
        mentor: [
          'We’ll contact you about the Asaas murabbi training and the next steps to lead a circle.',
          'ہم آپ سے Asaas مربی تربیت اور circle شروع کرنے کے اگلے مراحل کے بارے میں رابطہ کریں گے۔',
        ],
        host: [
          'We’ll contact you to talk about hosting a circle in your space.',
          'ہم آپ کی جگہ پر circle کی میزبانی کے بارے میں بات کرنے کے لیے رابطہ کریں گے۔',
        ],
      };
      const [en, ur] = next[d.role] ?? next.parent;
      return {
        subject: 'Thank you for your interest in Noor Circles · شکریہ',
        heading: `JazakAllah khair, ${first(d.name)}`,
        headingUr: 'جزاک اللہ خیر',
        en: [`Thank you for reaching out to Noor Circles. ${en}`],
        ur: [`Noor Circles سے رابطہ کرنے کا شکریہ۔ ${ur}`],
      };
    },
  },
  // 7b. Asaas for Parents: the course started, a module opened, everything opened, the closing
  'parent-course.module-open': {
    lang: () => 'ur-first',
    build: (d) => {
      const name = first(d.name);
      const facts: [string, string][] = [];
      if (d.clips) facts.push(['Clips · کلپس', `${d.clips} · about ${d.minutes} minutes`]);
      if (d.checkOpens) facts.push(['Knowledge check · سوالات', fmtDate(d.checkOpens)]);
      const button = { label: 'Open Asaas for Parents', labelUr: 'Asaas کھولیں', url: d.url };
      if (d.variant === 'start') {
        return {
          subject: 'Your Asaas for Parents has started · والدین کا Asaas شروع',
          heading: `Welcome to Asaas for Parents, ${name}`, headingUr: 'والدین کا Asaas: خوش آمدید',
          ur: [
            `السلام علیکم ${name}۔ آپ کا "والدین کا Asaas" شروع ہو گیا ہے۔ خوش آمدید اور پہلا module **"${d.moduleUr}"** ابھی کھلا ہے۔`,
            'چھوٹی چھوٹی audio clips ہیں: کھانا پکاتے ہوئے، یا بچوں کے سونے کے بعد، جب وقت ملے سن لیں۔ ہر دو ہفتے بعد ایک نیا module کھلے گا، اور ہم آپ کو ای میل کر دیں گے۔',
            'شروع میں اپنا self-check پُر کرنا نہ بھولیں۔',
          ],
          en: [
            `Assalam-o-Alaikum ${name}. Your 16-week Asaas for Parents course has started: the Welcome and Module 1, **${d.module}**, are open now.`,
            'The clips are short; listen whenever you have a moment. A new module opens every fortnight and we’ll email you each time. Please fill in the self-check at the start.',
          ],
          facts, button,
        };
      }
      if (d.variant === 'all') {
        return {
          subject: 'Every module of Asaas for Parents is open · تمام modules کھل گئے',
          heading: `${name}, every module is open`, headingUr: 'تمام modules کھل گئے',
          ur: [`السلام علیکم ${name}۔ Noor Circles team نے آپ کے لیے "والدین کا Asaas" کے تمام modules کھول دیے ہیں۔ اپنی رفتار سے سنیں، اور ہر module کے بعد اس کے سوالات اور target ضرور کریں۔`],
          en: [`Assalam-o-Alaikum ${name}. The Noor Circles team has opened every module of Asaas for Parents for you. Listen at your own pace, and do each module’s knowledge check and target as you go.`],
          button,
        };
      }
      if (d.variant === 'closing') {
        return {
          subject: 'The last part of Asaas for Parents is open · اختتام',
          heading: `${name}, the closing is open`, headingUr: 'اختتام: والدین کا وعدہ',
          ur: [
            `ماشاءاللہ ${name}، سولہ ہفتوں کا سفر مکمل ہونے کو ہے۔ آخری حصہ **"${d.moduleUr}"** کھل گیا ہے۔`,
            'پہلی clip سننے کے بعد آخری knowledge check اور self-check کھلیں گے، پھر آخری clip میں ہم سب مل کر والدین کا وعدہ کریں گے۔ ہو سکے تو اپنے بچے کو پاس بٹھا لیں۔',
          ],
          en: [
            `MashaAllah ${name}, the last part of Asaas for Parents is open. After the first closing clip, the final knowledge check and the self-check open; the last clip is the parents’ pledge. If you can, have your child beside you.`,
          ],
          facts, button,
        };
      }
      return {
        subject: `Module ${d.number} is open: ${d.module} · نیا module`,
        heading: `${name}, Module ${d.number} is open`, headingUr: `نیا module: ${d.moduleUr}`,
        ur: [
          `السلام علیکم ${name}۔ "والدین کا Asaas" کا module ${d.number}، **"${d.moduleUr}"**، آج کھل گیا ہے۔`,
          'اس کی clips جب وقت ملے سن لیں۔ دوسرے ہفتے کے شروع میں دس سوالوں کا knowledge check کھلے گا، اور اس fortnight کا target card بچے کے ساتھ شروع کریں۔',
        ],
        en: [
          `Assalam-o-Alaikum ${name}. Module ${d.number} of Asaas for Parents, **${d.module}**, opened today. Listen when you can; its knowledge check opens at the start of the second week, and this fortnight’s target card is ready for your child to tick.`,
        ],
        facts, button,
      };
    },
  },
  // 8. Alert to the team
  'interest.alert': {
    lang: () => 'en-first',
    build: (d) => ({
      subject: `New ${d.role} interest: ${d.name} (${d.neighbourhood}, ${d.city})`,
      heading: `New ${d.role} interest from the website`,
      en: ['Someone used “Find your place” on the website.'],
      facts: [['Name', d.name], ['Role', d.role], ['Email', d.email], ['Phone', d.phone], ['Area', `${d.neighbourhood}, ${d.city}`], ...(d.roleDetail ? [['Detail', d.roleDetail] as [string, string]] : [])],
      button: { label: 'Open Interest Requests', url: d.adminUrl },
    }),
  },

  // 9. Safeguarding concern from a supervisor's visit
  'cluster.safeguarding': {
    lang: () => 'en-first',
    build: (d) => ({
      subject: `Safeguarding concern: ${d.circle} (${d.cluster})`,
      preheader: 'A cluster supervisor raised a safeguarding concern on a visit.',
      heading: 'A safeguarding concern was raised',
      en: [
        `${d.supervisor} visited **${d.circle}** on ${fmtDate(d.date)} and marked a safeguarding concern. Please follow it up today.`,
        ...(d.concerns ? [`What they wrote: ${d.concerns}`] : []),
      ],
      facts: [['Cluster', d.cluster], ['Circle', d.circle], ['Murabbi', d.murabbi || '—'], ['Supervisor', d.supervisor], ['Visit date', fmtDate(d.date)]],
      button: { label: 'Open the visit report', url: d.url },
    }),
  },

  // 20. Training assigned
  'training.assigned': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: `New training: ${d.courseTitle}`,
      preheader: d.dueDate ? `Please complete it by ${fmtDate(d.dueDate)}.` : 'Start listening when you’re ready.',
      heading: `Assalam-o-Alaikum ${first(d.name)}, you have a new training`,
      headingUr: 'آپ کے لیے نئی تربیت',
      en: [
        `You’ve been given the **${d.courseTitle}**: ${d.lessons} short audio lessons (about ${d.minutes} minutes in all). Completing it earns your certificate${d.badge ? ` and the **${d.badge}** badge` : ''}.`,
        ...(d.note ? [`Note from the team: ${d.note}`] : []),
      ],
      ur: [`آپ کو نئی تربیت **${d.courseTitle}** دی گئی ہے: ${d.lessons} مختصر آڈیو اسباق۔ مکمل کرنے پر آپ کو سرٹیفکیٹ ملے گا۔`],
      facts: d.dueDate ? [['Complete by', fmtDate(d.dueDate)]] : undefined,
      button: { label: 'Start listening', labelUr: 'سننا شروع کریں', url: d.url },
    }),
  },
  // 21. Reminders
  'training.reminder': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => {
      const progress = `${d.done} of ${d.total} lessons heard`;
      const v: Record<string, { s: string; h: string; en: string; ur: string }> = {
        'not-started': {
          s: `A gentle reminder: your ${d.courseTitle}`,
          h: `${first(d.name)}, your training is waiting`,
          en: 'You haven’t started the training yet. The lessons are short, most under two minutes, so even ten minutes today makes a good start.',
          ur: 'آپ نے ابھی تربیت شروع نہیں کی۔ اسباق مختصر ہیں، آج دس منٹ بھی ایک اچھی شروعات ہے۔',
        },
        idle: {
          s: `Pick up where you left off: ${d.courseTitle}`,
          h: `${first(d.name)}, pick up where you left off`,
          en: `It’s been about a week since your last lesson (${progress}). Your place is saved: open the training and press play.`,
          ur: 'آپ کے آخری سبق کو تقریباً ایک ہفتہ ہو گیا ہے۔ جہاں چھوڑا تھا وہیں سے شروع کریں۔',
        },
        'due-soon': {
          s: `${d.days === 1 ? 'Due tomorrow' : `Due in ${d.days} days`}: ${d.courseTitle}`,
          h: `${d.days === 1 ? 'Due tomorrow' : `${d.days} days to go`}`,
          en: `Your training is due on **${d.dueDate ? fmtDate(d.dueDate) : ''}**. So far: ${progress}.`,
          ur: 'آپ کی تربیت کی آخری تاریخ قریب ہے۔ باقی اسباق مکمل کر لیں۔',
        },
        overdue: {
          s: `Your ${d.courseTitle} is past its due date`,
          h: 'Your training is past its due date',
          en: `The due date was ${d.dueDate ? fmtDate(d.dueDate) : ''} (${progress}). Please finish when you can, and reply to this email if you need more time or any help.`,
          ur: 'تربیت کی آخری تاریخ گزر گئی ہے۔ جب ممکن ہو مکمل کریں، اور مدد چاہیے تو اس ای میل کا جواب دیں۔',
        },
      };
      const c = v[d.variant] ?? v.idle;
      return {
        subject: c.s, heading: c.h, headingUr: 'یاد دہانی',
        en: [c.en], ur: [c.ur],
        button: { label: d.done ? 'Continue listening' : 'Start listening', labelUr: 'سنیں', url: d.url },
      };
    },
  },
  // 22. All lessons heard
  'training.lessons-done': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: 'You’ve heard every lesson: next, the assessment',
      heading: `MashaAllah ${first(d.name)}, every lesson heard`,
      headingUr: 'تمام اسباق مکمل',
      en: [
        `You’ve listened to all ${d.total} lessons of the ${d.courseTitle}. Two steps remain:`,
        `**1. The assessment:** ${d.questions} questions, pass mark ${d.passingScore}%.`,
        '**2. Your written reflection,** which the team reads and approves.',
      ],
      ur: ['آپ نے تمام اسباق سن لیے ہیں۔ اب جائزہ (assessment) اور تحریری عکاسی باقی ہیں۔'],
      button: { label: 'Take the assessment', labelUr: 'جائزہ دیں', url: d.url },
    }),
  },
  // 23. Assessment result
  'training.assessment': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => (d.passed ? {
      subject: `You passed the assessment: ${d.score}%`,
      heading: `MashaAllah ${first(d.name)}, you passed with ${d.score}%`,
      headingUr: 'آپ کامیاب ہوئے',
      en: [d.certified
        ? 'Your certificate has been issued: look out for the next email.'
        : 'One step left: your written reflection. Once the team approves it, your certificate is issued.'],
      ur: ['مبارک ہو! آپ جائزے میں کامیاب ہو گئے ہیں۔'],
      button: { label: 'Open the training', labelUr: 'تربیت کھولیں', url: d.url },
    } : {
      subject: `Assessment result: ${d.score}% (pass mark ${d.passingScore}%)`,
      heading: `Not this time, ${first(d.name)}`,
      headingUr: 'اس بار نہیں',
      en: [
        `You scored ${d.score}%; the pass mark is ${d.passingScore}%.`,
        d.attemptsLeft
          ? `You have ${d.attemptsLeft} more attempt${d.attemptsLeft === 1 ? '' : 's'} today. Listening again to the lessons you were unsure about usually helps.`
          : `You’ve used today’s attempts; you can try again after ${d.retryAt}. In the meantime, listen again to the lessons you were unsure about.`,
      ],
      ur: ['آپ اس بار کامیاب نہیں ہوئے۔ جن اسباق میں شک ہو انہیں دوبارہ سنیں اور پھر کوشش کریں۔'],
      button: { label: 'Back to the training', labelUr: 'تربیت', url: d.url },
    }),
  },
  // 24. Reflection reviewed
  'training.reflection': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => (d.approved ? {
      subject: 'Your reflection was approved',
      heading: 'Your reflection was approved',
      headingUr: 'آپ کی تحریری عکاسی منظور ہو گئی',
      en: [`JazakAllah khair, ${first(d.name)}. The team has read and approved your reflection.${d.feedback ? ` They wrote: “${d.feedback}”` : ''}`],
      ur: ['جزاک اللہ خیر۔ آپ کی تحریر منظور ہو گئی ہے۔'],
    } : {
      subject: 'Please revise your reflection',
      heading: 'A small revision to your reflection',
      headingUr: 'تحریر میں تھوڑی تبدیلی',
      en: [`${first(d.name)}, the team read your reflection and asked for a revision:`, `“${d.feedback}”`],
      ur: ['ٹیم نے آپ کی تحریر پڑھ کر کچھ تبدیلی کی درخواست کی ہے۔ اوپر دیا گیا پیغام دیکھیں۔'],
      button: { label: 'Revise my reflection', labelUr: 'تحریر میں تبدیلی', url: d.url },
    }),
  },
  // 25. Practical score
  'training.practical': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: `Your practical score: ${d.total}/18`,
      heading: `Your practical score: ${d.total}/18`,
      headingUr: 'عملی جائزے کا نتیجہ',
      en: [
        d.band === 'pass' ? 'MashaAllah, a pass.' : d.band === 'conditional' ? 'A conditional pass, with one or two things to keep working on.' : 'One more practice session is recommended before certification; the team will arrange it with you.',
        ...(d.notes ? [`Trainer’s notes: ${d.notes}`] : []),
      ],
      ur: ['آپ کے circle کے عملی جائزے کا نتیجہ آ گیا ہے۔ تفصیل پورٹل میں دیکھیں۔'],
      button: { label: 'See the details', labelUr: 'تفصیل', url: d.url },
    }),
  },
  // 26. Certified
  'training.certified': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: d.attached ? `MashaAllah! You are a ${d.badge}` : `MashaAllah! You’ve completed the ${d.courseTitle}`,
      heading: d.attached ? `MashaAllah ${first(d.name)}, you are a ${d.badge}` : `MashaAllah ${first(d.name)}, you’ve completed the ${d.courseTitle}`,
      headingUr: 'مبارک ہو! آپ نے تربیت مکمل کر لی',
      en: [
        `Your certificate is ${d.attached ? 'attached' : 'ready in the portal'}${d.badge ? `, and the **${d.badge}** badge is now on your profile` : ''}.`,
        d.role === 'parent' ? 'May Allah make your home a garden of tarbiyah.' : 'May Allah make you a source of light for the children of your neighbourhood.',
      ],
      ur: [`آپ نے **${d.courseTitle}** مکمل کر لی ہے۔ ${d.attached ? 'آپ کا سرٹیفکیٹ اس ای میل کے ساتھ منسلک ہے۔' : 'آپ کا سرٹیفکیٹ پورٹل میں موجود ہے۔'} اللہ تعالیٰ آپ کی محنت قبول فرمائے۔`],
      facts: [['Certificate No.', d.number]],
      button: { label: 'Open my profile', labelUr: 'پروفائل', url: d.url },
    }),
  },

  // Trainings marketplace: a request to the team, and a decline to the person
  'training.request-alert': {
    lang: () => 'en-first',
    build: (d) => ({
      subject: `Training request: ${d.name} → ${d.courseTitle}`,
      heading: 'A training request is waiting for approval',
      en: [`**${d.name}** (${d.role}) has finished what was needed and asks to join **${d.courseTitle}**.`, ...(d.note ? [`Their note: ${d.note}`] : [])],
      button: { label: 'Review requests', url: d.url },
    }),
  },
  'training.declined': {
    lang: (d) => (d.role === 'parent' ? 'ur-first' : 'en-first'),
    build: (d) => ({
      subject: `About your request for ${d.courseTitle}`,
      heading: `Assalam-o-Alaikum ${first(d.name)}`,
      headingUr: 'آپ کی درخواست کے بارے میں',
      en: [`Your request to join **${d.courseTitle}** can’t be approved just now.`, ...(d.reason ? [`From the team: ${d.reason}`] : []), 'You can ask again from Trainings whenever you’re ready.'],
      ur: [`**${d.courseTitle}** میں شمولیت کی آپ کی درخواست ابھی منظور نہیں ہو سکی۔`, ...(d.reason ? [`ٹیم کی طرف سے: ${d.reason}`] : []), 'آپ جب تیار ہوں، Trainings سے دوبارہ درخواست دے سکتے ہیں۔'],
      button: { label: 'Open Trainings', labelUr: 'تربیتیں', url: d.url },
    }),
  },

  // 27. Child enrolled
  'family.welcome': {
    lang: () => 'ur-first',
    build: (d) => ({
      subject: 'Welcome to Noor Circles · Noor Circles میں خوش آمدید',
      heading: `Assalam-o-Alaikum ${first(d.name)}, welcome to Noor Circles`,
      headingUr: 'Noor Circles میں خوش آمدید',
      en: [
        `${d.children.length === 1 ? `${d.children[0].name} is` : 'Your children are'} now part of a Noor Circle: a small weekly gathering in your neighbourhood where children grow in faith and character with a murabbi.`,
        'Your private family page shows attendance, this week’s topic, a home activity to do together and the calendar.',
      ],
      ur: [
        'آپ کا بچہ اب ایک Noor Circle کا حصہ ہے: محلے میں ہفتہ وار چھوٹا سا اجتماع جہاں بچے مربی کے ساتھ ایمان اور کردار میں بڑھتے ہیں۔',
        'آپ کے خاندان کے صفحے پر حاضری، اس ہفتے کا موضوع، گھر میں ساتھ کرنے کی سرگرمی اور کیلنڈر موجود ہے۔',
      ],
      facts: d.children.flatMap((c: any) => [
        [`${c.name}: circle`, c.circle || 'To be confirmed'],
        ...(c.murabbi ? [[`${c.name}: murabbi`, c.murabbi]] : []),
        ...(c.schedule ? [[`${c.name}: meets`, c.schedule]] : []),
      ]),
      button: { label: 'Open our family page', labelUr: 'خاندان کا صفحہ', url: d.familyUrl },
      note: d.hasAccount ? `You can also sign in with your account at ${d.loginUrl}` : 'Please keep this link private: it opens your family’s page without a password.',
    }),
  },

  // 37. Pledge thank-you
  'contribution.pledge': {
    lang: () => 'ur-first',
    build: (d) => ({
      subject: 'JazakAllah khair for supporting Noor Circles',
      heading: `JazakAllah khair, ${first(d.name)}`,
      headingUr: 'آپ کے تعاون کا شکریہ',
      en: [
        `Thank you for pledging **${pkr(d.amount)}${d.frequency === 'monthly' ? ' a month' : ''}** to Noor Circles. Contributions keep circles running in neighbourhoods across Pakistan.`,
        'The team will contact you about how to pay (bank transfer, JazzCash, Easypaisa or cash). You’ll get a receipt by email for every payment.',
      ],
      ur: ['Noor Circles کے ساتھ تعاون کا بہت شکریہ۔ ہماری ٹیم ادائیگی کے طریقے کے بارے میں آپ سے رابطہ کرے گی، اور ہر ادائیگی کی رسید ای میل پر ملے گی۔'],
    }),
  },
  // 38. Receipt
  'contribution.receipt': {
    lang: () => 'ur-first',
    build: (d) => ({
      subject: `Receipt ${d.receiptNumber}: ${pkr(d.amount)} received`,
      heading: 'Contribution received',
      headingUr: 'رسید',
      en: [`JazakAllah khair, ${first(d.name)}. We’ve received your contribution. May Allah accept it and put barakah in it.`],
      ur: ['آپ کا تعاون موصول ہو گیا ہے۔ اللہ تعالیٰ قبول فرمائے۔'],
      facts: [
        ['Receipt No.', d.receiptNumber],
        ['Amount', pkr(d.amount)],
        ['For month', d.monthLabel],
        ['Method', d.method],
        ['Received', fmtDate(d.receivedAt)],
      ],
      note: 'Noor Circles contributions are voluntary support, not fees.',
    }),
  },

  // 40. Written by an admin
  campaign: {
    lang: () => 'en-first',
    build: (d) => {
      const paras = String(d.body).split(/\n{2,}/).map((p) => p.replace(/\{name\}/g, first(d.name)).trim()).filter(Boolean);
      return {
        subject: String(d.subject).replace(/\{name\}/g, first(d.name)),
        heading: String(d.subject).replace(/\{name\}/g, first(d.name)),
        // Each paragraph goes in the column of the script it's mostly written in.
        en: paras.filter((p) => !isMostlyUrdu(p)),
        ur: paras.filter(isMostlyUrdu),
      };
    },
  },
};

export function render(kind: string, data: TemplateData, o: Omit<LayoutOptions, 'lang'>): Rendered {
  const t = TEMPLATES[kind];
  if (!t) throw new Error(`Unknown email kind: ${kind}`);
  return layout(t.build(data), { ...o, lang: t.lang(data) });
}
