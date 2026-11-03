/**
 * Hosts: the choices for a space, the visit checklist and the Asaas for Hosts
 * training (6 short written modules, Urdu first with English beneath, a short
 * check after each, and a Noor Circles Host certificate at the end).
 */

export const SPACE_TYPES = [
  { value: 'living-room', en: 'Living room',      ur: 'بیٹھک / ڈرائنگ روم' },
  { value: 'lawn',        en: 'Lawn / garden',    ur: 'لان / باغیچہ' },
  { value: 'community',   en: 'Community space',  ur: 'کمیونٹی کی جگہ' },
  { value: 'masjid-room', en: 'Masjid room',      ur: 'مسجد کا کمرہ' },
  { value: 'hall',        en: 'Hall',             ur: 'ہال' },
  { value: 'other',       en: 'Other',            ur: 'دیگر' },
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number]['value'];

/** The website form's wording → a space type. */
export function spaceTypeFrom(text: string | null | undefined): SpaceType {
  const t = (text ?? '').toLowerCase();
  if (t.includes('living')) return 'living-room';
  if (t.includes('lawn') || t.includes('garden')) return 'lawn';
  if (t.includes('community')) return 'community';
  if (t.includes('masjid') || t.includes('mosque')) return 'masjid-room';
  if (t.includes('hall')) return 'hall';
  return 'other';
}

export const FACILITIES = [
  { value: 'wudu',      en: 'Place for wudu',      ur: 'وضو کی جگہ' },
  { value: 'toilet',    en: 'Clean toilet',        ur: 'صاف واش روم' },
  { value: 'prayer',    en: 'Space to pray',       ur: 'نماز کی جگہ' },
  { value: 'fan',       en: 'Fan or AC',           ur: 'پنکھا یا اے سی' },
  { value: 'water',     en: 'Drinking water',      ur: 'پینے کا پانی' },
  { value: 'backup',    en: 'UPS / generator',     ur: 'یو پی ایس / جنریٹر' },
  { value: 'ground',    en: 'Ground floor',        ur: 'گراؤنڈ فلور' },
  { value: 'entrance',  en: 'Separate entrance',   ur: 'الگ داخلی راستہ' },
  { value: 'parking',   en: 'Parking / drop-off',  ur: 'گاڑی کھڑی کرنے کی جگہ' },
] as const;

export const SPACE_STATUSES = ['offered', 'visited', 'approved', 'in-use', 'inactive'] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** What the admin or cluster supervisor checks on a visit. */
export const VISIT_CHECKLIST = [
  { key: 'entrance',  en: 'Safe, easy entrance for children (no busy road at the door)', ur: 'بچوں کے لیے محفوظ داخلی راستہ' },
  { key: 'room',      en: 'Enough room for the circle to sit together',                  ur: 'حلقے کے بیٹھنے کے لیے کافی جگہ' },
  { key: 'light',     en: 'Good light and fresh air; fan or AC works',                   ur: 'روشنی اور ہوا کا اچھا انتظام' },
  { key: 'washroom',  en: 'Clean toilet and a place for wudu',                           ur: 'صاف واش روم اور وضو کی جگہ' },
  { key: 'hazards',   en: 'No hazards in reach: open stairs, water tanks, wires, pets',  ur: 'کوئی خطرہ نہیں: سیڑھیاں، پانی کی ٹنکی، تاریں، جانور' },
  { key: 'separate',  en: 'Kept apart from household traffic during the circle',         ur: 'حلقے کے وقت گھر کی آمد و رفت سے الگ' },
  { key: 'adults',    en: 'Two adults can always be present; doors stay open',           ur: 'ہر وقت دو بالغ موجود؛ دروازے کھلے' },
  { key: 'dropoff',   en: 'A safe spot for parents to drop off and collect',             ur: 'بچوں کو چھوڑنے اور لینے کی محفوظ جگہ' },
  { key: 'firstaid',  en: 'First-aid box and an emergency number on hand',               ur: 'فرسٹ ایڈ باکس اور ایمرجنسی نمبر' },
  { key: 'host',      en: 'Host understands the safeguarding rules',                     ur: 'میزبان حفاظتی اصول سمجھتا ہے' },
] as const;

export interface HostModule {
  key: string;
  number: number;
  titleEn: string;
  titleUr: string;
  summaryEn: string;
  summaryUr: string;
  sections: { headingEn: string; headingUr: string; ur: string[]; en: string[] }[];
  check: { questionUr: string; questionEn: string; options: { ur: string; en: string }[]; correct: number }[];
}

export const HOST_PASS_MARK = 3; // of 4

export const HOST_MODULES: HostModule[] = [
  {
    key: 'why', number: 1,
    titleEn: 'Why hosting matters', titleUr: 'میزبانی کیوں اہم ہے',
    summaryEn: 'Opening your home is a sadaqah jariyah: every word of good the children learn there is a reward for you.',
    summaryUr: 'اپنا گھر کھولنا صدقۂ جاریہ ہے: بچے وہاں جو بھلائی سیکھیں گے اس کا اجر آپ کو بھی ملے گا۔',
    sections: [
      {
        headingEn: 'A circle of light in every neighbourhood', headingUr: 'ہر محلے میں روشنی کا ایک حلقہ',
        ur: ['نور سرکلز 6 سے 13 سال کے بچوں کے لیے ہفتہ وار تربیتی حلقے ہیں، جو ایک تربیت یافتہ مربی چلاتا ہے۔', 'یہ حلقے گھروں، لانوں اور کمیونٹی کی جگہوں میں ہوتے ہیں، تاکہ بچہ اپنے گھر کے قریب سیکھ سکے۔', 'آپ کی جگہ کے بغیر یہ حلقہ ممکن نہیں۔ آپ اس محلے کی پہلی اینٹ ہیں۔'],
        en: ['Noor Circles are weekly tarbiyah circles for children aged 6 to 13, led by a trained murabbi.', 'They meet in homes, lawns and community spaces, so a child can learn close to home.', 'Without your space the circle cannot happen. You are the first brick of this neighbourhood’s circle.'],
      },
      {
        headingEn: 'The reward of opening your door', headingUr: 'دروازہ کھولنے کا اجر',
        ur: ['رسول اللہ ﷺ نے فرمایا: "جس نے بھلائی کی طرف رہنمائی کی، اسے بھی اتنا ہی اجر ملے گا جتنا کرنے والے کو۔" (صحیح مسلم، 1893)', 'مہمان نوازی اور علم کی مجلس کو جگہ دینا، دونوں نیکیاں آپ کے گھر میں جمع ہوتی ہیں۔'],
        en: ['The Prophet ﷺ said: "Whoever guides to good has the like of the reward of the one who does it." (Sahih Muslim, 1893)', 'Hospitality and giving room to a gathering of knowledge: both good deeds meet in your home.'],
      },
      {
        headingEn: 'What the host does, and does not do', headingUr: 'میزبان کیا کرتا ہے، اور کیا نہیں',
        ur: ['آپ: جگہ تیار رکھتے ہیں، وقت پر دروازہ کھولتے ہیں، اور حفاظت کا خیال رکھتے ہیں۔', 'آپ کو: پڑھانا، کوئی خرچ کرنا، یا بچوں کی ذمہ داری اکیلے اٹھانا نہیں ہے۔ حلقہ مربی چلاتا ہے۔'],
        en: ['You: keep the space ready, open the door on time and help keep everyone safe.', 'You do not: teach, spend money, or take charge of the children alone. The murabbi leads the circle.'],
      },
    ],
    check: [
      { questionUr: 'نور سرکلز کس عمر کے بچوں کے لیے ہیں؟', questionEn: 'Which children are Noor Circles for?', options: [{ ur: '3 سے 5 سال', en: '3 to 5 years' }, { ur: '6 سے 13 سال', en: '6 to 13 years' }, { ur: 'صرف نوجوان', en: 'Teenagers only' }], correct: 1 },
      { questionUr: 'حلقہ کون چلاتا ہے؟', questionEn: 'Who leads the circle?', options: [{ ur: 'میزبان', en: 'The host' }, { ur: 'والدین', en: 'The parents' }, { ur: 'تربیت یافتہ مربی', en: 'A trained murabbi' }], correct: 2 },
      { questionUr: 'کیا میزبان کو حلقے کے لیے پیسے خرچ کرنے ہوتے ہیں؟', questionEn: 'Does the host have to spend money on the circle?', options: [{ ur: 'جی ہاں، ہر ہفتے', en: 'Yes, every week' }, { ur: 'نہیں', en: 'No' }, { ur: 'صرف کھانے پر', en: 'Only on food' }], correct: 1 },
      { questionUr: 'میزبان کا سب سے اہم کام کیا ہے؟', questionEn: 'What is the host’s main role?', options: [{ ur: 'سبق پڑھانا', en: 'Teaching the lesson' }, { ur: 'جگہ تیار اور محفوظ رکھنا', en: 'Keeping the space ready and safe' }, { ur: 'حاضری لگانا', en: 'Taking attendance' }], correct: 1 },
    ],
  },
  {
    key: 'space', number: 2,
    titleEn: 'Preparing the space', titleUr: 'جگہ کی تیاری',
    summaryEn: 'A calm, clean, comfortable corner where children can sit in a circle and focus.',
    summaryUr: 'ایک پُرسکون، صاف اور آرام دہ جگہ جہاں بچے دائرے میں بیٹھ کر توجہ دے سکیں۔',
    sections: [
      {
        headingEn: 'Seating', headingUr: 'بیٹھنے کا انتظام',
        ur: ['دری، چادر یا گدے فرش پر دائرے میں بچھائیں، تاکہ سب ایک دوسرے کو دیکھ سکیں۔', 'تقریباً 10 سے 15 بچوں اور مربی کے لیے جگہ رکھیں۔ کرسیاں ضروری نہیں۔'],
        en: ['Lay a durrie, sheet or mattresses on the floor in a circle, so everyone can see each other.', 'Allow room for about 10 to 15 children and the murabbi. Chairs are not needed.'],
      },
      {
        headingEn: 'Light, air and quiet', headingUr: 'روشنی، ہوا اور خاموشی',
        ur: ['اچھی روشنی اور ہوا ہو؛ گرمی میں پنکھا یا اے سی چلائیں۔', 'ٹی وی بند رکھیں اور گھر کی آوازیں کم سے کم ہوں۔'],
        en: ['Good light and fresh air; run a fan or AC in the heat.', 'Keep the TV off and household noise to a minimum.'],
      },
      {
        headingEn: 'Wudu, toilet and a phone-free corner', headingUr: 'وضو، واش روم اور موبائل سے پاک کونا',
        ur: ['وضو کی جگہ اور صاف واش روم دکھا دیں؛ صابن اور تولیہ رکھیں۔', 'ایک ٹوکری رکھیں جہاں بڑے اپنے موبائل حلقے کے دوران رکھ سکیں۔'],
        en: ['Show the place for wudu and a clean toilet; keep soap and a towel there.', 'Keep a basket where adults can leave their phones during the circle.'],
      },
      {
        headingEn: 'Before the first circle', headingUr: 'پہلے حلقے سے پہلے',
        ur: ['نور سرکلز کی ٹیم یا کلسٹر سپروائزر ایک بار آ کر جگہ دیکھے گا اور ایک مختصر چیک لسٹ مکمل کرے گا۔', 'منظوری کے بعد ہی حلقہ آپ کی جگہ پر شروع ہوتا ہے۔'],
        en: ['The Noor Circles team or the cluster supervisor will visit once and fill in a short checklist.', 'A circle starts at your space only after it is approved.'],
      },
    ],
    check: [
      { questionUr: 'بچے کیسے بیٹھیں؟', questionEn: 'How should the children sit?', options: [{ ur: 'قطاروں میں کرسیوں پر', en: 'In rows of chairs' }, { ur: 'فرش پر دائرے میں', en: 'On the floor in a circle' }, { ur: 'جہاں چاہیں', en: 'Anywhere they like' }], correct: 1 },
      { questionUr: 'حلقے کے دوران ٹی وی؟', questionEn: 'The TV during the circle?', options: [{ ur: 'بند رکھیں', en: 'Keep it off' }, { ur: 'آہستہ آواز میں', en: 'On low' }, { ur: 'بچوں کی مرضی', en: 'Children decide' }], correct: 0 },
      { questionUr: 'حلقہ آپ کی جگہ پر کب شروع ہوتا ہے؟', questionEn: 'When does a circle start at your space?', options: [{ ur: 'فارم بھیجتے ہی', en: 'As soon as you send the form' }, { ur: 'وزٹ اور منظوری کے بعد', en: 'After a visit and approval' }, { ur: 'جب والدین کہیں', en: 'When parents ask' }], correct: 1 },
      { questionUr: 'بڑوں کے موبائل کہاں؟', questionEn: 'Where do adults keep phones?', options: [{ ur: 'ہاتھ میں', en: 'In their hands' }, { ur: 'ایک ٹوکری میں', en: 'In a basket' }, { ur: 'بچوں کے پاس', en: 'With the children' }], correct: 1 },
    ],
  },
  {
    key: 'safety', number: 3,
    titleEn: 'Safety and safeguarding', titleUr: 'حفاظت اور بچوں کا تحفظ',
    summaryEn: 'Every child must be safe, and seen to be safe, from arrival to collection.',
    summaryUr: 'ہر بچہ آنے سے جانے تک محفوظ ہو، اور سب کو محفوظ نظر بھی آئے۔',
    sections: [
      {
        headingEn: 'The two-adult rule', headingUr: 'دو بالغوں کا اصول',
        ur: ['حلقے کے دوران ہمیشہ کم از کم دو بالغ موجود ہوں (مربی اور میزبان، یا کوئی والد/والدہ)۔', 'کوئی بڑا کسی بچے کے ساتھ بند کمرے میں اکیلا نہ ہو۔ دروازے کھلے رہیں۔'],
        en: ['At least two adults are always present during the circle (the murabbi and the host, or a parent).', 'No adult is ever alone with a child behind a closed door. Doors stay open.'],
      },
      {
        headingEn: 'Arrival and collection', headingUr: 'آمد اور واپسی',
        ur: ['بچے صرف ان بڑوں کے ساتھ جائیں جنہیں والدین نے بتایا ہو۔ کوئی اجنبی آئے تو مربی کو بتائیں۔', 'حلقے سے پہلے اور بعد بچے گلی یا سڑک پر نہ کھیلیں۔'],
        en: ['Children leave only with adults their parents have named. Tell the murabbi if someone unfamiliar comes.', 'Children don’t play on the street or road before or after the circle.'],
      },
      {
        headingEn: 'Hazards, allergies and first aid', headingUr: 'خطرات، الرجی اور ابتدائی طبی امداد',
        ur: ['سیڑھیاں، پانی کی ٹنکیاں، بجلی کی تاریں، دوائیں اور پالتو جانور بچوں کی پہنچ سے دور رکھیں۔', 'کچھ کھلانے سے پہلے مربی سے الرجی کے بارے میں پوچھ لیں۔', 'فرسٹ ایڈ باکس رکھیں اور قریبی اسپتال اور 1122 کا نمبر معلوم ہو۔'],
        en: ['Keep stairs, water tanks, wires, medicines and pets out of children’s reach.', 'Ask the murabbi about allergies before offering any food.', 'Keep a first-aid box, and know the nearest hospital and 1122.'],
      },
      {
        headingEn: 'Photos and privacy', headingUr: 'تصاویر اور پردہ داری',
        ur: ['بچوں کی تصویر یا ویڈیو نہ بنائیں اور نہ کہیں شیئر کریں، جب تک نور سرکلز کی ٹیم اجازت نہ دے۔', 'اگر کوئی بات آپ کو پریشان کرے، فوراً مربی یا کلسٹر سپروائزر کو بتائیں۔'],
        en: ['Don’t take or share photos or videos of the children unless the Noor Circles team has given permission.', 'If anything worries you, tell the murabbi or the cluster supervisor straight away.'],
      },
    ],
    check: [
      { questionUr: 'حلقے میں کم از کم کتنے بالغ ہوں؟', questionEn: 'How many adults, at least, during the circle?', options: [{ ur: 'ایک', en: 'One' }, { ur: 'دو', en: 'Two' }, { ur: 'کوئی نہیں', en: 'None' }], correct: 1 },
      { questionUr: 'کوئی اجنبی بچے کو لینے آئے تو؟', questionEn: 'Someone unfamiliar comes to collect a child?', options: [{ ur: 'بچہ دے دیں', en: 'Let the child go' }, { ur: 'مربی کو بتائیں', en: 'Tell the murabbi' }, { ur: 'کچھ نہ کہیں', en: 'Say nothing' }], correct: 1 },
      { questionUr: 'کچھ کھلانے سے پہلے؟', questionEn: 'Before offering food?', options: [{ ur: 'الرجی کا پوچھیں', en: 'Ask about allergies' }, { ur: 'کچھ نہیں', en: 'Nothing' }, { ur: 'قیمت لیں', en: 'Charge for it' }], correct: 0 },
      { questionUr: 'بچوں کی تصویریں؟', questionEn: 'Photos of the children?', options: [{ ur: 'سوشل میڈیا پر ڈالیں', en: 'Post them online' }, { ur: 'ٹیم کی اجازت کے بغیر نہیں', en: 'Not without the team’s permission' }, { ur: 'گروپ میں بھیجیں', en: 'Send to a group' }], correct: 1 },
    ],
  },
  {
    key: 'day', number: 4,
    titleEn: 'Circle day', titleUr: 'حلقے کا دن',
    summaryEn: 'A simple timeline for before, during and after the circle.',
    summaryUr: 'حلقے سے پہلے، دوران اور بعد کا آسان سا خاکہ۔',
    sections: [
      {
        headingEn: 'Before: 30 minutes ahead', headingUr: 'پہلے: 30 منٹ قبل',
        ur: ['جگہ صاف کریں، دری بچھائیں، پنکھا اور روشنی چیک کریں۔', 'پانی اور گلاس رکھیں، واش روم صاف ہو۔', 'دروازہ مربی کے آنے پر کھولیں؛ بچوں سے پہلے مربی پہنچتا ہے۔'],
        en: ['Tidy the space, lay out the durrie, check the fan and lights.', 'Put out water and cups; make sure the toilet is clean.', 'Open the door for the murabbi, who arrives before the children.'],
      },
      {
        headingEn: 'During: about 2½ hours', headingUr: 'دوران: تقریباً ڈھائی گھنٹے',
        ur: ['حلقہ مربی کا ہے؛ آپ قریب رہیں مگر سبق میں دخل نہ دیں۔', 'گھر کے افراد کو آہستہ چلنے اور آواز کم رکھنے کا کہیں۔', 'نماز کا وقت ہو تو وضو اور نماز کی جگہ دستیاب رکھیں۔'],
        en: ['The circle belongs to the murabbi; stay nearby but don’t step into the lesson.', 'Ask the household to move quietly and keep voices low.', 'If it’s time to pray, keep the wudu and prayer space free.'],
      },
      {
        headingEn: 'After', headingUr: 'بعد میں',
        ur: ['ہر بچہ اپنے بڑے کے ساتھ جائے؛ مربی آخر تک رہتا ہے۔', 'جگہ سمیٹنے میں مربی اور بچے مدد کریں گے۔', 'کوئی بات ہو تو اسی دن مربی کو بتا دیں۔'],
        en: ['Each child leaves with their adult; the murabbi stays until the last child has gone.', 'The murabbi and children help tidy up.', 'If anything came up, tell the murabbi the same day.'],
      },
      {
        headingEn: 'If the space is not available', headingUr: 'اگر جگہ دستیاب نہ ہو',
        ur: ['مہمان، بیماری یا سفر کی وجہ سے جگہ نہ مل سکے تو پورٹل میں "Space unavailable" پر تاریخ لکھیں۔', 'مربی اور نور سرکلز ٹیم کو فوراً اطلاع ہو جاتی ہے، تاکہ والدین کو بروقت بتایا جا سکے۔'],
        en: ['If guests, illness or travel mean the space can’t be used, enter the date under "Space unavailable" in the portal.', 'The murabbi and the Noor Circles team are told at once, so parents hear in good time.'],
      },
    ],
    check: [
      { questionUr: 'تیاری کب شروع کریں؟', questionEn: 'When do you start getting ready?', options: [{ ur: 'تقریباً 30 منٹ پہلے', en: 'About 30 minutes before' }, { ur: 'بچوں کے آنے کے بعد', en: 'After the children arrive' }, { ur: 'اگلے دن', en: 'The next day' }], correct: 0 },
      { questionUr: 'حلقے کے دوران میزبان؟', questionEn: 'During the circle the host…', options: [{ ur: 'سبق پڑھاتا ہے', en: 'Teaches the lesson' }, { ur: 'قریب رہتا ہے، دخل نہیں دیتا', en: 'Stays nearby without stepping in' }, { ur: 'گھر سے چلا جاتا ہے', en: 'Leaves the house' }], correct: 1 },
      { questionUr: 'سب سے آخر میں کون جاتا ہے؟', questionEn: 'Who leaves last?', options: [{ ur: 'پہلا بچہ', en: 'The first child' }, { ur: 'مربی', en: 'The murabbi' }, { ur: 'کوئی بھی', en: 'Anyone' }], correct: 1 },
      { questionUr: 'جگہ دستیاب نہ ہو تو؟', questionEn: 'The space can’t be used on a date?', options: [{ ur: 'پورٹل میں Space unavailable پر لکھیں', en: 'Enter it under Space unavailable in the portal' }, { ur: 'کچھ نہ کریں', en: 'Do nothing' }, { ur: 'دروازہ نہ کھولیں', en: 'Just don’t open the door' }], correct: 0 },
    ],
  },
  {
    key: 'people', number: 5,
    titleEn: 'Working with the murabbi and families', titleUr: 'مربی اور خاندانوں کے ساتھ',
    summaryEn: 'Clear roles and kind boundaries keep the circle healthy and your household’s privacy safe.',
    summaryUr: 'واضح ذمہ داریاں اور نرم حدود حلقے کو صحت مند اور آپ کے گھر کی پردہ داری کو محفوظ رکھتی ہیں۔',
    sections: [
      {
        headingEn: 'Who does what', headingUr: 'کون کیا کرتا ہے',
        ur: ['مربی: حلقہ چلاتا ہے، حاضری لگاتا ہے، والدین سے رابطہ رکھتا ہے۔', 'میزبان: جگہ، وقت اور حفاظت۔', 'نور سرکلز ٹیم اور کلسٹر سپروائزر: سب کی مدد اور نگرانی۔'],
        en: ['The murabbi leads the circle, takes attendance and keeps in touch with parents.', 'The host looks after the space, the timing and safety.', 'The Noor Circles team and the cluster supervisor support and oversee everyone.'],
      },
      {
        headingEn: 'Boundaries', headingUr: 'حدود',
        ur: ['والدین کی شکایت یا سوال مربی تک پہنچائیں؛ خود فیصلہ نہ کریں۔', 'بچوں کی ذاتی باتیں دوسروں سے نہ کریں۔'],
        en: ['Pass parents’ questions or complaints to the murabbi; don’t decide on them yourself.', 'Don’t discuss children’s personal matters with others.'],
      },
      {
        headingEn: 'Your household’s privacy', headingUr: 'آپ کے گھر کی پردہ داری',
        ur: ['آپ کا پتا صرف نور سرکلز ٹیم، اس حلقے کے مربی اور داخل شدہ خاندانوں کو دکھایا جاتا ہے، کبھی ویب سائٹ پر نہیں۔', 'گھر کے جو حصے حلقے کے لیے نہیں، وہ بند رکھیں۔'],
        en: ['Your address is shown only to the Noor Circles team, that circle’s murabbi and enrolled families, never on the website.', 'Keep parts of the home that aren’t for the circle closed.'],
      },
    ],
    check: [
      { questionUr: 'حاضری کون لگاتا ہے؟', questionEn: 'Who takes attendance?', options: [{ ur: 'میزبان', en: 'The host' }, { ur: 'مربی', en: 'The murabbi' }, { ur: 'بچے', en: 'The children' }], correct: 1 },
      { questionUr: 'کسی والد کی شکایت آئے تو؟', questionEn: 'A parent complains to you?', options: [{ ur: 'خود فیصلہ کریں', en: 'Decide yourself' }, { ur: 'مربی تک پہنچائیں', en: 'Pass it to the murabbi' }, { ur: 'نظر انداز کریں', en: 'Ignore it' }], correct: 1 },
      { questionUr: 'آپ کا پتا کون دیکھ سکتا ہے؟', questionEn: 'Who can see your address?', options: [{ ur: 'ہر کوئی ویب سائٹ پر', en: 'Everyone on the website' }, { ur: 'ٹیم، مربی اور داخل شدہ خاندان', en: 'The team, the murabbi and enrolled families' }, { ur: 'کوئی نہیں', en: 'No one' }], correct: 1 },
      { questionUr: 'بچوں کی ذاتی باتیں؟', questionEn: 'Children’s personal matters?', options: [{ ur: 'دوسروں سے نہ کریں', en: 'Don’t share them' }, { ur: 'محلے میں بتائیں', en: 'Tell the neighbours' }, { ur: 'گروپ میں لکھیں', en: 'Post in a group' }], correct: 0 },
    ],
  },
  {
    key: 'adab', number: 6,
    titleEn: 'Adab, hospitality and when things go wrong', titleUr: 'آداب، مہمان نوازی اور مشکل حالات',
    summaryEn: 'Simple warmth, no costs, and knowing exactly who to call.',
    summaryUr: 'سادہ گرمجوشی، کوئی خرچ نہیں، اور یہ معلوم ہو کہ کس کو فون کرنا ہے۔',
    sections: [
      {
        headingEn: 'Simple hospitality', headingUr: 'سادہ مہمان نوازی',
        ur: ['پانی کافی ہے۔ اگر چاہیں تو کبھی کبھار سادہ سی چیز، مگر یہ کبھی لازم یا مہنگی نہ ہو۔', 'مسکراہٹ اور سلام سے استقبال کریں؛ بچے یاد رکھتے ہیں کہ انہیں کیسا محسوس ہوا۔'],
        en: ['Water is enough. Something simple now and then if you wish, but never required or costly.', 'Greet with a smile and salaam; children remember how they were made to feel.'],
      },
      {
        headingEn: 'When things go wrong', headingUr: 'جب کچھ غلط ہو جائے',
        ur: ['چوٹ یا بیماری: پہلے ابتدائی امداد، پھر مربی والدین کو فون کرے؛ سنگین ہو تو 1122۔', 'کوئی تشویش (کسی بچے کی حفاظت یا کسی بڑے کا رویہ): اسی دن مربی یا کلسٹر سپروائزر کو بتائیں۔', 'جھگڑا یا نقصان: خود حل کرنے کی بجائے مربی کو بتائیں؛ ٹیم مدد کرے گی۔'],
        en: ['Injury or illness: first aid first, then the murabbi calls the parents; if serious, call 1122.', 'Any concern (a child’s safety or an adult’s behaviour): tell the murabbi or cluster supervisor the same day.', 'A quarrel or damage: tell the murabbi rather than sorting it out alone; the team will help.'],
      },
      {
        headingEn: 'Who to call', headingUr: 'کس سے رابطہ کریں',
        ur: ['حلقے کی بات: مربی (نام اور فون آپ کے پورٹل میں "My circle" پر ہے)۔', 'جگہ یا اکاؤنٹ کی بات: support@noorcircles.com یا کسی بھی نور سرکلز ای میل کا جواب دیں۔', 'ایمرجنسی: 1122۔'],
        en: ['About the circle: the murabbi (name and phone are under "My circle" in your portal).', 'About your space or account: support@noorcircles.com, or reply to any Noor Circles email.', 'Emergency: 1122.'],
      },
    ],
    check: [
      { questionUr: 'مہمان نوازی میں کیا لازم ہے؟', questionEn: 'What hospitality is required?', options: [{ ur: 'ہر ہفتے کھانا', en: 'A meal every week' }, { ur: 'پانی کافی ہے، کچھ لازم نہیں', en: 'Water is enough; nothing is required' }, { ur: 'تحفے', en: 'Gifts' }], correct: 1 },
      { questionUr: 'کوئی بچہ زخمی ہو جائے؟', questionEn: 'A child is hurt?', options: [{ ur: 'ابتدائی امداد، پھر مربی والدین کو فون کرے', en: 'First aid, then the murabbi calls the parents' }, { ur: 'کچھ نہ کریں', en: 'Do nothing' }, { ur: 'بچے کو گھر بھیج دیں', en: 'Send the child home alone' }], correct: 0 },
      { questionUr: 'کسی بچے کی حفاظت کی تشویش؟', questionEn: 'A worry about a child’s safety?', options: [{ ur: 'اگلے مہینے بتائیں', en: 'Mention it next month' }, { ur: 'اسی دن مربی یا سپروائزر کو بتائیں', en: 'Tell the murabbi or supervisor the same day' }, { ur: 'خود حل کریں', en: 'Handle it yourself' }], correct: 1 },
      { questionUr: 'ایمرجنسی نمبر؟', questionEn: 'The emergency number?', options: [{ ur: '1122', en: '1122' }, { ur: '15', en: '15' }, { ur: 'مربی کا نمبر', en: 'The murabbi’s number' }], correct: 0 },
    ],
  },
];
