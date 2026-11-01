// The founder's profile as approved. Admins can change any of it later
// (Admin → Founder Profile); this is what a fresh deployment starts with.
//
// Text format: a blank line starts a new paragraph, a line starting "- " is a
// bullet, and **words** are bold.

export const FOUNDER_DEFAULTS = {
  name: 'Atiq ur Rehman Ayubi',
  titleEn: 'Founder, Noor Circles',
  titleUr: 'بانی، نور سرکلز',
  taglineEn: 'Building honest, useful institutions for Muslim communities.',
  taglineUr: 'دیانت دار اور مفید ادارے، امت کے لیے',
  /** Empty = the photo bundled with the portal and website. */
  photo: '',
  blogUrl: 'https://ayubi.blog',
  quoteEn: 'Most of what I know I’ve learned through doing.',
  quoteUr: 'زیادہ تر جو کچھ میں جانتا ہوں، وہ کر کے سیکھا ہے۔',
  storyEn: [
    'I’m based in Karachi, Pakistan. My work spans design, education, entrepreneurship, publishing, training and community welfare: fields that look different on paper but are, for me, one connected project. That project is building useful, honest institutions and tools for Muslim communities.',
    '',
    'Everything I have built starts with a gap I could not ignore:',
    '- I founded **The Deenway School** and **Noor Circles** because tarbiyah and academic excellence belong together, as one project rather than separate departments.',
    '- **i9 Experts** exists because too many good institutions were held back by weak systems and poor design.',
    '- **M.Publishers** began because the Islamic learning materials our children needed were missing or uninspiring.',
    '- **Edudeen** takes Islamic education further than any single school can.',
    '- **SmartVan** gives parents, schools and drivers the visibility and accountability they deserve.',
    '- I train teachers because no school rises above the people who teach in it.',
    '',
    'My worldview is shaped by Islam, by the realities of Karachi, and by years of watching things succeed and fail in real institutions. I write to share the thinking: not as advice, but as honest reflection from someone still learning.',
  ].join('\n'),
  storyUr: [
    'میں کراچی، پاکستان میں مقیم ہوں۔ میرا کام ڈیزائن، تعلیم، کاروبار، اشاعت، تربیت اور سماجی بہبود تک پھیلا ہوا ہے۔ کاغذ پر یہ مختلف شعبے لگتے ہیں، مگر میرے لیے یہ ایک ہی منصوبہ ہیں: امت کے لیے دیانت دار اور مفید ادارے اور وسائل بنانا۔',
    '',
    'میں نے جو کچھ بھی بنایا، اس کی ابتدا کسی ایسی کمی سے ہوئی جسے میں نظرانداز نہ کر سکا:',
    '- **دی ڈین وے اسکول** اور **نور سرکلز** اس یقین سے قائم کیے کہ تربیت اور تعلیمی معیار الگ الگ شعبے نہیں، ایک ہی منصوبہ ہیں۔',
    '- **آئی نائن ایکسپرٹس** اس لیے بنایا کہ بہت سے اچھے ادارے کمزور نظام اور ناقص ڈیزائن کی وجہ سے پیچھے رہ جاتے تھے۔',
    '- **ایم پبلشرز** اس لیے شروع کیا کہ ہمارے بچوں کو جن اسلامی تعلیمی کتب کی ضرورت تھی، وہ یا تو دستیاب نہ تھیں یا دل کو نہیں چھوتی تھیں۔',
    '- **ایڈودین** اس لیے بنا رہا ہوں کہ اسلامی تعلیم کسی ایک اسکول سے کہیں آگے تک پہنچے۔',
    '- **اسمارٹ وین** اس لیے کہ والدین، اسکولوں اور ڈرائیوروں کو وہ شفافیت اور جواب دہی ملے جس کے وہ حق دار ہیں۔',
    '- اور اساتذہ کی تربیت اس لیے کرتا ہوں کہ کوئی اسکول اپنے اساتذہ سے بلند نہیں ہوتا۔',
    '',
    'میری سوچ اسلام، کراچی کے حالات، اور حقیقی اداروں کو کامیاب اور ناکام ہوتے دیکھنے کے برسوں کے تجربے سے بنی ہے۔ میں لکھتا ہوں تاکہ اپنی سوچ بانٹ سکوں: نصیحت کے طور پر نہیں، بلکہ ایک ایسے شخص کی دیانت دارانہ رائے کے طور پر جو اب بھی سیکھ رہا ہے۔',
  ].join('\n'),
  vision: [
    { en: 'A circle of light in every neighbourhood', ur: 'ہر محلے میں روشنی کا ایک حلقہ', detailEn: 'Small weekly circles, close enough to walk to.' },
    { en: 'Tarbiyah and excellence, together', ur: 'تربیت اور علم، ایک ساتھ', detailEn: 'Faith, character and learning as one.' },
    { en: 'No circle rises above its murabbi', ur: 'ہر حلقہ اپنے مربی جتنا ہی بلند ہوتا ہے', detailEn: 'Trained, supported and trusted mentors.' },
    { en: 'Families as partners', ur: 'والدین، تربیت کے شریکِ سفر', detailEn: 'Parents growing alongside their children.' },
  ],
  messageParentsUr: [
    'محترم والدین، السلام علیکم ورحمۃ اللہ وبرکاتہ۔',
    '',
    'آپ نے اپنے بچے کو نور سرکل میں بھیج کر ہم پر جو اعتماد کیا ہے، ہم دل سے اس کی قدر کرتے ہیں۔ بچے کی تربیت صرف حلقے میں مکمل نہیں ہوتی، اس کی اصل جگہ گھر ہے۔ اسی لیے ہم نے آپ کے لیے "والدین کا اساس" بنایا ہے، تاکہ گھر اور حلقہ ایک ہی سمت میں چلیں۔ ہر ہفتے کی گھریلو سرگرمی بچے کے ساتھ کیجیے، اس کی چھوٹی چھوٹی کامیابیوں کی قدر کیجیے، اور اپنے مربی سے رابطے میں رہیے۔',
    '',
    'اللہ تعالیٰ ہمارے بچوں کو ایمان، اخلاق اور علم کا نور عطا فرمائے۔',
  ].join('\n'),
  messageParentsEn: [
    'Dear parents, Assalamu alaikum.',
    '',
    'We truly value the trust you have placed in us by sending your child to a Noor Circle. A child’s tarbiyah is never completed in the circle alone; its real home is your home. That is why we made Asaas for Parents, so that home and circle move in the same direction. Do each week’s home activity together, notice your child’s small wins, and stay in touch with your murabbi.',
    '',
    'May Allah grant our children the light of faith, character and knowledge.',
  ].join('\n'),
  messageMurabbisEn: [
    'Dear murabbi, Assalamu alaikum.',
    '',
    'Every week you sit with a small circle of children and hold something precious: their questions, their trust, and their first understanding of who Allah is and who they can become. No school rises above the people who teach in it, and no circle rises above its murabbi. Prepare with care, listen more than you speak, and lead with warmth, never fear. You are not alone: the Asaas training, your cluster supervisor and the whole Noor Circles team are behind you.',
    '',
    'May Allah accept your effort and make it a lasting light for you and for the children of your neighbourhood.',
  ].join('\n'),
  messageMurabbisUr: [
    'محترم مربی، السلام علیکم۔',
    '',
    'ہر ہفتے آپ بچوں کے ایک چھوٹے حلقے کے ساتھ بیٹھتے ہیں اور ایک قیمتی امانت سنبھالتے ہیں: ان کے سوال، ان کا اعتماد، اور اللہ کی پہچان کی ان کی پہلی سمجھ۔ کوئی اسکول اپنے اساتذہ سے بلند نہیں ہوتا، اور کوئی حلقہ اپنے مربی سے۔ تیاری سے آئیے، بولنے سے زیادہ سنیے، اور خوف کے بجائے محبت سے رہنمائی کیجیے۔ آپ اکیلے نہیں: اساس کی تربیت، آپ کے کلسٹر سپروائزر اور پوری نور سرکلز ٹیم آپ کے ساتھ ہے۔',
    '',
    'اللہ تعالیٰ آپ کی محنت قبول فرمائے۔',
  ].join('\n'),
};

export type FounderContent = typeof FOUNDER_DEFAULTS;
