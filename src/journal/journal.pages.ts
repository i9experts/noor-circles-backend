// The Noor Journal: the writing activities of the Asaas murabbi training,
// with the prompts as spoken in the audio (Urdu) and English beneath. Each
// page opens once its lesson (lessonCode) has been heard.

export interface JournalField {
  key: string;
  labelUr: string;
  labelEn: string;
  kind: 'text' | 'textarea' | 'choice';
  options?: { value: string; ur: string; en: string }[];
}

export interface JournalPage {
  key: string;
  number: number;
  lessonCode: string;
  titleEn: string;
  titleUr: string;
  introUr: string;
  introEn: string;
  hintUr?: string;
  hintEn?: string;
  /** 'reflection' = the training's written reflection (sent to the admin team for review). */
  kind: 'fields' | 'reflection';
  fields: JournalField[];
}

const t = (key: string, labelUr: string, labelEn: string, kind: JournalField['kind'] = 'textarea'): JournalField => ({ key, labelUr, labelEn, kind });

export const JOURNAL_PAGES: JournalPage[] = [
  {
    key: 'purpose', number: 1, lessonCode: 'M1-13', kind: 'fields',
    titleEn: 'My Purpose', titleUr: 'میری نیت',
    introUr: 'یہ اس journal کا پہلا صفحہ ہے۔ تین ادھورے جملے اپنے دل سے مکمل کریں۔ یہ کسی کو سنانا نہیں ہے… یہ آپ کے اور آپ کی نیت کے درمیان ہے، اور اللہ کے سامنے ہے۔',
    introEn: 'The first page of your journal. Complete three sentences from the heart. This is not for anyone else: it is between you and your intention, before Allah.',
    hintUr: 'اردو میں لکھیں، انگریزی میں، یا اپنی مادری زبان میں… جس میں دل کی بات آسانی سے نکلے۔ وقت لیں، جلدی کی کوئی ضرورت نہیں۔',
    hintEn: 'Write in Urdu, English or your mother tongue, whichever lets the heart speak. Take your time.',
    fields: [
      t('why', 'میں مربی اس لیے بن رہا ہوں… یا بن رہی ہوں… کیونکہ…', 'I am becoming a murabbi because…'),
      t('deserve', 'میرے circle کے بچے مجھ سے… کے حقدار ہیں۔', 'The children in my circle deserve… from me.'),
      t('year', 'ایک سال میں، میں امید کرتا ہوں… یا کرتی ہوں… کہ میں نے… میں حصہ ڈالا ہوگا۔', 'In one year, I hope I will have contributed to…'),
    ],
  },
  {
    key: 'gaps', number: 2, lessonCode: 'M1-12', kind: 'fields',
    titleEn: 'Three gaps in my neighbourhood', titleUr: 'میرے محلے کے تین خلا',
    introUr: 'ان تین خلاؤں میں سے کون سا خلا آپ کو اپنے محلے میں سب سے زیادہ واضح نظر آتا ہے؟ اور کوئی ایک specific مثال دیں۔',
    introEn: 'Which of the three gaps do you see most clearly in your neighbourhood? Give one specific example.',
    hintUr: 'مثال سچی ہو، اپنی آنکھوں دیکھی۔ کوئی بچہ، کوئی گلی، کوئی واقعہ۔ نام بتانے کی ضرورت نہیں۔ Theory نہیں… اپنے علاقے کی بات کریں۔',
    hintEn: 'A true example you have seen yourself: a child, a street, an event. No names. Not theory: your own area.',
    fields: [
      t('gap', 'میرے محلے میں سب سے واضح خلا', 'The gap I see most clearly'),
      t('example', 'ایک سچی، اپنی آنکھوں دیکھی مثال', 'One true example I have seen'),
    ],
  },
  {
    key: 'qualities', number: 3, lessonCode: 'M2-06', kind: 'fields',
    titleEn: 'Qualities Inventory', titleUr: 'خوبیوں کا جائزہ',
    introUr: 'مربی کی چھ خوبیوں کے بارے میں دو جملے مکمل کریں۔',
    introEn: 'Complete two sentences about the six qualities of a murabbi.',
    hintUr: 'Specific لکھیں۔ "میں وقت کی پابندی کروں گا" نہیں… بلکہ: "میں circle کے دن کا alarm ایک گھنٹہ پہلے لگاؤں گا۔"',
    hintEn: 'Be specific. Not “I will be punctual” but “I will set an alarm one hour early on circle day.”',
    fields: [
      t('strongest', 'ان چھ خوبیوں میں میری سب سے مضبوط خوبی… ہے۔ اور میں یہ اس لیے کہتا ہوں… یا کہتی ہوں… کیونکہ…', 'Of the six qualities, my strongest is… and I say this because…'),
      t('workOn', 'جس خوبی پر مجھے سب سے زیادہ کام کرنا ہے… وہ ہے۔ اور اس پر کام کرنے کا ایک specific طریقہ…', 'The quality I most need to work on is… and one specific way to work on it is…'),
    ],
  },
  {
    key: 'listening', number: 4, lessonCode: 'M2-11', kind: 'fields',
    titleEn: 'Deep Listening', titleUr: 'گہری سماعت',
    introUr: 'تین منٹ بغیر رکے بولنے کا موضوع: "مجھے اس training تک کون سی چیز لائی؟" اور سننے والے کا کام صرف ایک ہے: مکمل موجودگی۔',
    introEn: 'Speak for three minutes without stopping on: “What brought me to this training?” The listener’s only job is full presence.',
    hintUr: 'مشورہ نہیں… صرف عکس: "جو میں نے سنا، وہ یہ تھا کہ…"',
    hintEn: 'No advice, only a reflection: “What I heard was…”',
    fields: [
      t('brought', 'مجھے اس training تک کون سی چیز لائی؟', 'What brought me to this training?'),
      t('noticed', 'جب میں نے صرف سنا… تو میں نے اپنے اندر کیا محسوس کیا؟', 'What did I notice in myself when I only listened?'),
    ],
  },
  {
    key: 'takeaway', number: 5, lessonCode: 'D1C-02', kind: 'fields',
    titleEn: 'What I take from today', titleUr: 'آج کا حاصل',
    introUr: 'ایک جملہ مکمل کریں۔ لمبی تقریر نہیں۔',
    introEn: 'Complete one sentence. No long speech.',
    fields: [t('takeaway', 'آج کے دن سے… جو سب سے اہم چیز میں اپنے ساتھ لے کر جا رہا ہوں… یا جا رہی ہوں… وہ ہے…', 'The most important thing I’m taking with me from today is…')],
  },
  {
    key: 'overnight', number: 6, lessonCode: 'D1C-03', kind: 'fields',
    titleEn: 'Tonight’s question', titleUr: 'آج رات کا سوال',
    introUr: 'کھانا کھا لیں، عشاء پڑھ لیں… اور سونے سے پہلے اس سوال کا جواب لکھیں۔ اس بچے کا نام نہیں لکھنا۔ بس اس کے بارے میں سوچیں… اور لکھیں۔',
    introEn: 'After dinner and Isha, before you sleep, answer this question. Don’t write the child’s name; just think of them, and write.',
    hintUr: 'شاید کوئی بچہ ذہن میں آ جائے جسے آپ گلی میں روز دیکھتے ہیں۔ جو ہمیشہ اکیلا کھیلتا ہے۔ یا جو ہر وقت phone میں گم رہتا ہے۔',
    hintEn: 'Perhaps a child you see in your street every day: one who always plays alone, or is always lost in a phone.',
    fields: [
      t('need', 'میرے محلے کا وہ بچہ… جس کے بارے میں میری سب سے زیادہ دعا ہے کہ وہ میرے circle میں آئے… اسے مجھ سے کیا چاہیے؟', 'The child in my neighbourhood I most pray will join my circle: what do they need from me?'),
      t('word', 'جو میں نے لکھا، اس میں سے ایک لفظ جو میں کل ساتھ لاؤں گا… یا لاؤں گی', 'One word from what I wrote, to bring tomorrow', 'text'),
    ],
  },
  {
    key: 'age', number: 7, lessonCode: 'M3-11', kind: 'fields',
    titleEn: 'Age adaptation', titleUr: 'عمر کے مطابق سوال',
    introUr: 'Noor Circles curriculum کا ایک theme چنیں اور اس پر دو سوال لکھیں۔',
    introEn: 'Choose a theme from the Noor Circles curriculum and write two questions on it.',
    hintUr: 'اپنے بچپن سے، اپنے محلے سے، اپنی زبان اور culture سے مثالیں لیں۔ شادی، عید، گلی کرکٹ، اسکول وین، دادی کا گھر… جتنا دیسی، اتنا بہتر۔',
    hintEn: 'Use examples from your childhood, neighbourhood, language and culture: weddings, Eid, street cricket, the school van, grandmother’s house. The more desi, the better.',
    fields: [
      { key: 'theme', labelUr: 'Theme', labelEn: 'Theme', kind: 'choice', options: [
        { value: 'identity', ur: 'Identity اور فطرت', en: 'Identity and fitrah' },
        { value: 'honesty', ur: 'سچائی اور اعتماد', en: 'Honesty and trust' },
        { value: 'gratitude', ur: 'شکر', en: 'Gratitude' },
        { value: 'courage', ur: 'شجاعت', en: 'Courage' },
      ] },
      t('young', 'چھ سے نو سال کے بچے کے لیے سوال: ٹھوس، ذاتی، کہانی والا', 'A question for ages 6–9: concrete, personal, story-based'),
      t('older', 'دس سے تیرہ سال کے بچے کے لیے سوال: abstract، پہچان سے جڑا، اخلاقی پیچیدگی والا', 'A question for ages 10–13: abstract, identity-linked, morally complex'),
    ],
  },
  {
    key: 'questions', number: 8, lessonCode: 'M4-06', kind: 'fields',
    titleEn: 'Question transformation', titleUr: 'سوالوں کی تبدیلی',
    introUr: 'ہر بند سوال کو کھلے یا گہرائی والے سوال میں بدلیں۔',
    introEn: 'Turn each closed question into an open or deepening question.',
    fields: [
      t('q1', '"تم نے آج نماز پڑھی؟"', '“Did you pray today?”', 'text'),
      t('q2', '"تمہیں پتہ ہے سچائی کا کیا مطلب ہے؟"', '“Do you know what honesty means?”', 'text'),
      t('q3', '"Home card والا کام مشکل تھا؟"', '“Was the home card task hard?”', 'text'),
      t('q4', '"Circle میں سب تمہارے دوست ہیں؟"', '“Is everyone in the circle your friend?”', 'text'),
      t('q5', '"آج کچھ سیکھا؟"', '“Did you learn anything today?”', 'text'),
      t('q6', '"تمہارے خیال میں صبر ضروری ہے؟"', '“Do you think patience is important?”', 'text'),
    ],
  },
  {
    key: 'mock', number: 9, lessonCode: 'M4-13', kind: 'fields',
    titleEn: 'Mock circle notes', titleUr: 'Mock Circle کے نوٹس',
    introUr: 'یہ performance نہیں ہے۔ لڑکھڑاتا ہوا simulation بھی… ایک perfect lecture سے زیادہ اعتماد دیتا ہے۔',
    introEn: 'This isn’t a performance. Even a stumbling simulation gives more confidence than a perfect lecture.',
    fields: [
      { key: 'role', labelUr: 'میرا کردار', labelEn: 'My role', kind: 'choice', options: [
        { value: 'murabbi', ur: 'مربی', en: 'Murabbi' },
        { value: 'dominant', ur: 'ہر بات پر چھا جانے والا بچہ', en: 'A child who dominates' },
        { value: 'withdrawn', ur: 'اندر سمٹا ہوا بچہ', en: 'A withdrawn child' },
        { value: 'engaged', ur: 'دلچسپی لینے والا بچہ', en: 'An engaged child' },
        { value: 'mischief', ur: 'چپکے چپکے شرارت کرنے والا بچہ', en: 'A quietly mischievous child' },
      ] },
      t('wentWell', 'کیا اچھا ہوا؟', 'What went well?'),
      t('improve', 'اگلی بار میں ایک چیز بہتر کروں گا… یا کروں گی', 'One thing I will do better next time'),
    ],
  },
  {
    key: 'parents', number: 10, lessonCode: 'M5-13', kind: 'fields',
    titleEn: 'A difficult conversation with parents', titleUr: 'والدین سے مشکل گفتگو',
    introUr: 'Role play کا ایک scenario چنیں اور اپنی بات اور سیکھ لکھیں۔',
    introEn: 'Choose one role-play scenario and write what was said and what you learned.',
    hintUr: 'کیا مربی نے گرمجوشی سے شروع کیا؟ کیا بات specific تھی؟ کیا circle کی دیانت محفوظ رہی؟ اور کیا والدین شریک بنے رہے؟',
    hintEn: 'Did the murabbi start warmly? Was it specific? Was the circle’s trust kept? Did the parents stay partners?',
    fields: [
      { key: 'scenario', labelUr: 'Scenario', labelEn: 'Scenario', kind: 'choice', options: [
        { value: 'boring', ur: '"میرا بیٹا کہتا ہے کہ وہ اب circle نہیں آنا چاہتا… کیونکہ یہ boring ہے۔"', en: '“My son says he doesn’t want to come any more because it’s boring.”' },
        { value: 'privacy', ur: '"مجھے جاننا ہے کہ میری بیٹی نے circle میں کیا بتایا تھا۔"', en: '“I need to know what my daughter said in the circle.”' },
        { value: 'changed', ur: '"جب سے circle شروع ہوا ہے، میرا بچہ کچھ بدلا بدلا سا ہے۔ کیا مجھے فکر کرنی چاہیے؟"', en: '“My child seems different since the circle started. Should I worry?”' },
      ] },
      { key: 'role', labelUr: 'میرا کردار', labelEn: 'My role', kind: 'choice', options: [
        { value: 'murabbi', ur: 'مربی', en: 'Murabbi' },
        { value: 'parent', ur: 'والد یا والدہ', en: 'Parent' },
        { value: 'observer', ur: 'Observer', en: 'Observer' },
      ] },
      t('said', 'کیا کہا گیا… اور میں نے کیا دیکھا', 'What was said, and what I saw'),
      t('learned', 'میں نے کیا سیکھا', 'What I learned'),
    ],
  },
  {
    key: 'sustainability', number: 11, lessonCode: 'M6-08', kind: 'fields',
    titleEn: 'My Sustainability Map', titleUr: 'میرا Sustainability Map',
    introUr: 'خالی برتن سے کوئی نہیں پلا سکتا۔ اپنا ذاتی Sustainability Map بنائیں: تین حصے۔',
    introEn: 'No one can pour from an empty cup. Make your own Sustainability Map in three parts.',
    hintUr: 'Specific لکھیں۔ "آرام" نہیں… کونسا آرام؟ شاید: "صبح فجر کے بعد چھت پر بیٹھ کر چائے پینا۔" "اتوار کو امی کے ساتھ بازار جانا۔"',
    hintEn: 'Be specific. Not “rest”: which rest? Perhaps “tea on the roof after Fajr” or “going to the market with Ammi on Sunday”.',
    fields: [
      t('warning', 'میری خطرے کی گھنٹیاں: جب میں تھکن کے قریب ہوتا ہوں، یا ہوتی ہوں… تو میرے اندر کیا ہوتا ہے؟ (دو یا تین نشانیاں)', 'My warning signs: what happens in me when I’m close to burning out? (two or three signs)'),
      t('refresh', 'مجھے کیا چیز واقعی تازہ کرتی ہے؟ (دو یا تین specific چیزیں)', 'What truly refreshes me? (two or three specific things)'),
      t('pledge', 'میرا عہد: "جب مجھے… فلاں نشانی نظر آئے گی… تو میں اگلے session سے پہلے… یہ specific کام کروں گا، یا کروں گی۔"', 'My pledge: “When I notice…, before the next session I will…”'),
    ],
  },
  {
    key: 'reflection', number: 12, lessonCode: 'FA-04', kind: 'reflection',
    titleEn: 'Final reflection', titleUr: 'آخری صفحہ: لکھی ہوئی Reflection',
    introUr: 'یہ آپ کے Noor Journal کا… اس training کا آخری صفحہ ہے۔ یہ صفحہ Noor Circles ٹیم پڑھے گی اور اس پر رائے دے گی۔',
    introEn: 'The last page of your Noor Journal and of this training. This page is read by the Noor Circles team, who will give feedback.',
    fields: [],
  },
];

/** Moments of light: dated notes from real circles, added any time after this lesson. */
export const MOMENTS_LESSON = 'M6-02';
export const JOURNAL_POINTS = 10;
