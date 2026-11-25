// The Parent Journal: the at-home writing activities of Asaas for Parents,
// with the prompts as spoken in the audio (Urdu) and English beneath. Each
// page opens once its lesson (lessonCode) has been heard. The audio promises
// parents the journal is "only for you": the team sees how many pages are
// written, never what is written.

export interface ParentJournalField {
  key: string;
  labelUr: string;
  labelEn: string;
  kind: 'text' | 'textarea';
  /** Not needed for the page to count as written. */
  optional?: boolean;
}

export interface ParentJournalPage {
  key: string;
  number: number;
  lessonCode: string;
  titleEn: string;
  titleUr: string;
  introUr: string;
  introEn: string;
  hintUr?: string;
  hintEn?: string;
  fields: ParentJournalField[];
}

/** Points for each page written (once per page). */
export const PARENT_JOURNAL_POINTS = 10;
/** "Moments at home" open with the welcome lesson that introduces the journal. */
export const PARENT_MOMENTS_LESSON = 'PW-02';

const t = (key: string, labelUr: string, labelEn: string, kind: ParentJournalField['kind'] = 'textarea', optional = false): ParentJournalField =>
  ({ key, labelUr, labelEn, kind, ...(optional && { optional }) });

export const PARENT_JOURNAL_PAGES: ParentJournalPage[] = [
  {
    key: 'roots', number: 1, lessonCode: 'P1-05',
    titleEn: 'Roots and Branches', titleUr: 'جڑیں اور شاخیں',
    introUr: 'جڑوں میں وہ باتیں لکھیں جو آپ کو اپنے ماں باپ سے ملیں، اچھی بھی اور مشکل بھی، کم از کم چار۔ شاخوں پر وہ باتیں جو آپ اپنے بچے کو دینا چاہتے ہیں۔ آخر میں جڑوں میں سے ایک بات چنیں جو آپ آگے نہیں لے جانا چاہتے۔',
    introEn: 'In the roots, write what you received from your own parents, the good and the hard, at least four. On the branches, what you want to give your child. Then choose one root you will not pass on.',
    hintUr: 'یہ درخت صرف آپ کا ہے۔ اگر کوئی پرانا دکھ یاد آ جائے تو یہ فطری ہے۔ رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا',
    hintEn: 'This tree is yours alone. If an old hurt comes back, that is natural. “My Lord, have mercy on them as they raised me when I was small.”',
    fields: [
      t('roots', 'جڑیں: جو مجھے اپنے ماں باپ سے ملا (اچھا بھی، مشکل بھی)', 'Roots: what I received from my parents (good and hard)'),
      t('branches', 'شاخیں: جو میں اپنے بچے کو دینا چاہتا ہوں… یا چاہتی ہوں', 'Branches: what I want to give my child'),
      t('letGo', 'ایک جڑ جس پر میں لکیر کھینچتا ہوں… یا کھینچتی ہوں… جو آگے نہیں جائے گی', 'One root I cross out, that will not go on', 'text'),
    ],
  },
  {
    key: 'two-endings', number: 2, lessonCode: 'P2-03',
    titleEn: 'One Scene, Two Endings', titleUr: 'ایک منظر، دو انجام',
    introUr: 'زینب کی کہانی کے دونوں انجاموں میں آپ نے جو تین فرق سنے، وہ لکھیں: اس کی آواز میں، اس کے الفاظ میں، اور آخر میں کیا ہوا۔',
    introEn: 'Write the three differences you heard between the two endings of Zainab’s story: in her voice, in her words, and in how it ended.',
    hintUr: 'یہ تینوں فرق آپ کے knowledge check میں بھی آئیں گے۔',
    hintEn: 'These three differences also come up in your knowledge check.',
    fields: [
      t('voice', 'زینب کی آواز میں فرق', 'The difference in Zainab’s voice'),
      t('words', 'اس کے الفاظ میں فرق', 'The difference in her words'),
      t('ending', 'آخر میں کیا ہوا', 'The difference in how it ended'),
    ],
  },
  {
    key: 'my-phone', number: 3, lessonCode: 'P3-04',
    titleEn: 'My Own Phone First', titleUr: 'پہلے اپنا موبائل',
    introUr: 'اپنے فون میں Digital Wellbeing (Android) یا Screen Time (iPhone) کھولیں۔ کل آپ نے فون کتنے گھنٹے استعمال کیا؟ وہ نمبر یہاں لکھ لیں۔',
    introEn: 'Open Digital Wellbeing (Android) or Screen Time (iPhone). How many hours did you use your phone yesterday? Write the number here.',
    hintUr: 'صرف آپ کے لیے، کسی کو بتانے کی ضرورت نہیں۔ کام کا ضروری استعمال شرمندگی کی بات نہیں؛ بات اس وقت کی ہے جو بس scroll میں چلا جاتا ہے۔',
    hintEn: 'Only for you. Phone use for work is nothing to be ashamed of; this is about the time that slips away in scrolling.',
    fields: [
      t('hours', 'کل میرا فون اتنے گھنٹے استعمال ہوا', 'Yesterday my phone was used for … hours', 'text'),
      t('notice', 'میں نے کیا محسوس کیا؟ کس وقت فون میرے بچے کا وقت لے لیتا ہے؟', 'What did I notice? When does my phone take time from my child?', 'textarea', true),
    ],
  },
  {
    key: 'media-plan', number: 4, lessonCode: 'P3-05',
    titleEn: 'Our Family Media Plan', titleUr: 'ہمارا family media plan',
    introUr: 'یہ plan اپنے شریکِ حیات یا گھر کے کسی بڑے کے ساتھ مل کر بنائیں۔ پورے گھر کے لیے، امی ابو سمیت۔',
    introEn: 'Make this plan with your spouse or an elder at home. It is for the whole family, parents included.',
    hintUr: 'اچانک سب بند نہ کریں، ہفتہ وار تھوڑا تھوڑا کم کریں۔ اور swap list سے پہلی چیز بچے کو چننے دیں۔',
    hintEn: 'Don’t switch everything off at once; cut down a little each week. Let your child choose the first swap.',
    fields: [
      t('when', 'کب نہیں؟ (جیسے کھانے کے وقت، سونے سے ایک گھنٹہ پہلے)', 'When not? (e.g. at meals, an hour before sleep)'),
      t('where', 'کہاں نہیں؟ رات کو فون کہاں charge ہوں گے؟', 'Where not? Where will the phones charge at night?'),
      t('instead', 'اس کی جگہ کیا؟ ہماری swap list', 'What instead? Our swap list'),
      t('firstSwap', 'بچے کی چنی ہوئی پہلی چیز', 'The first swap my child chose', 'text'),
    ],
  },
  {
    key: 'three-stories', number: 5, lessonCode: 'P4-04',
    titleEn: 'What Will You Say?', titleUr: 'آپ کیا کہیں گے؟',
    introUr: 'ہر کہانی کے بعد clip روکیں اور لکھیں: آج رات آپ اپنے بچے سے کیا کہیں گے؟ پھر اگلی clip میں مشورہ سنیں۔',
    introEn: 'After each story, pause and write: what will you say to your child tonight? Then hear the advice in the next clip.',
    hintUr: 'کوئی جواب غلط نہیں… یہ صرف سوچنے کے لیے ہے۔',
    hintEn: 'No answer is wrong; this is only for thinking.',
    fields: [
      t('ayesha', 'عائشہ (8 سال): سہیلی کے بُرے الفاظ گھر میں', 'Ayesha (8): repeating a friend’s bad words at home'),
      t('umar', 'عمر (12 سال): "بھائی جان نے فون پر کچھ دکھایا… مجھے اچھا نہیں لگا"', 'Umar (12): “A cousin showed me something on a phone… I didn’t like it”'),
      t('shahzeb', 'شاہ زیب (10 سال): school سے فون، نئے لڑکے کا مذاق', 'Shahzeb (10): a call from school about teasing a new boy'),
    ],
  },
  {
    key: 'strengths', number: 6, lessonCode: 'P5-05',
    titleEn: 'The Strengths Card', titleUr: 'خوبیوں کا card',
    introUr: 'ہر بچے کے لیے ایک خانہ۔ ہر بچے کی تین خوبیاں، اور ہر خوبی کے ساتھ اسی ہفتے کی ایک سچی مثال۔',
    introEn: 'A box for each child: three strengths, each with a true example from this week.',
    hintUr: 'ہر خوبی کو تین سوالوں سے check کریں: کیا یہ specific ہے؟ کیا میں نے خود دیکھی؟ کیا یہ اسی ہفتے کی ہے؟ ضد کے پیچھے اکثر ایک خوبی چھپی ہوتی ہے۔',
    hintEn: 'Check each one: is it specific? Did I see it myself? Is it from this week? Behind stubbornness there is often a strength.',
    fields: [
      t('child1', 'پہلا بچہ: نام، تین خوبیاں اور مثالیں', 'First child: name, three strengths and examples'),
      t('child2', 'دوسرا بچہ (اگر ہے)', 'Second child (if any)', 'textarea', true),
      t('child3', 'تیسرا بچہ (اگر ہے)', 'Third child (if any)', 'textarea', true),
    ],
  },
  {
    key: 'stop-plan', number: 7, lessonCode: 'P6-03',
    titleEn: 'My Stop Plan', titleUr: 'میرا رکنے کا plan',
    introUr: 'رکیں، اعوذ باللہ پڑھیں، بیٹھ جائیں یا وضو کریں، چند لمحے خاموشی، پھر واپس آ کر بات کریں۔ اپنا plan اپنے الفاظ میں لکھیں۔',
    introEn: 'Stop; say a‘udhu billah; sit down or make wudu; a few moments of silence; then come back and talk. Write your plan in your own words.',
    hintUr: 'ایک کاغذ پر بھی لکھ کر fridge پر لگا دیں… جہاں غصے کے وقت نظر پڑے۔',
    hintEn: 'Write it on paper too and put it on the fridge, where you’ll see it when anger rises.',
    fields: [
      t('when', 'میرا صبر کب ختم ہوتا ہے؟ اس وقت کے لیے میں کیا بدلوں گا… یا بدلوں گی؟', 'When does my patience run out? What will I change about that time?'),
      t('plan', 'میرا رکنے کا plan، قدم بہ قدم', 'My stop plan, step by step'),
      t('say', 'غصے کے وقت میں بچے سے یہ کہوں گا… یا کہوں گی', 'What I will say to my child when I feel angry', 'text'),
    ],
  },
  {
    key: 'calm-limits', number: 8, lessonCode: 'P6-04',
    titleEn: 'From Threats to Calm Limits', titleUr: 'دھمکی کی جگہ پُرسکون حد',
    introUr: 'وہ تین جملے لکھیں جو آپ غصے میں سب سے زیادہ کہتے ہیں… ایمانداری سے۔ پھر ہر ایک کو ایک پُرسکون حد میں بدلیں۔',
    introEn: 'Write the three things you say most when angry, honestly. Then turn each one into a calm limit.',
    hintUr: 'نئے جملے اونچی آواز میں بولنے کی practice کریں۔ شروع میں عجیب لگے گا… پھر عادت بن جائے گی۔',
    hintEn: 'Practise the new words out loud. It feels odd at first, then it becomes habit.',
    fields: [
      t('said1', 'پہلا جملہ جو میں کہتا ہوں… یا کہتی ہوں', 'The first thing I say', 'text'),
      t('calm1', 'اس کی جگہ پُرسکون حد', 'A calm limit instead', 'text'),
      t('said2', 'دوسرا جملہ', 'The second thing I say', 'text'),
      t('calm2', 'اس کی جگہ پُرسکون حد', 'A calm limit instead', 'text'),
      t('said3', 'تیسرا جملہ', 'The third thing I say', 'text'),
      t('calm3', 'اس کی جگہ پُرسکون حد', 'A calm limit instead', 'text'),
    ],
  },
  {
    key: 'routine', number: 9, lessonCode: 'P7-05',
    titleEn: 'Our Home Routine Card', titleUr: 'گھر کا routine card',
    introUr: 'یہ card بچے کے ساتھ مل کر بنائیں۔ چار خانے: ایک نماز ساتھ، قرآن کا وقت، کہانی کی رات، اور نیکی کا ایک کام۔',
    introEn: 'Make this card together with your child. Four boxes: one prayer together, Qur’an time, a story night, and one good deed.',
    hintUr: 'Card بنا کر fridge یا دیوار پر لگا دیں۔ اور بچے سے پوچھیں: "آج حلقے میں کیا سیکھا؟"',
    hintEn: 'Put the card on the fridge or a wall. And ask your child: “What did you learn in the circle today?”',
    fields: [
      t('prayer', 'ایک نماز ساتھ: کون سی؟ (بچے نے چنی)', 'One prayer together: which one? (your child chose)', 'text'),
      t('quran', 'قرآن کا وقت: روز کب، کتنی دیر؟', 'Qur’an time: when each day, and for how long?', 'text'),
      t('story', 'کہانی کی رات: کون سی رات، کون سنائے گا؟', 'Story night: which night, and who tells the story?', 'text'),
      t('deed', 'نیکی کا ایک کام', 'One good deed', 'text'),
    ],
  },
  {
    key: 'family-map', number: 10, lessonCode: 'P8-01',
    titleEn: 'Our Family Map', titleUr: 'ہمارے گھر کا نقشہ',
    introUr: 'بیچ میں آپ کا بچہ، اور اس کے اردگرد ہر وہ شخص جو اس کا خیال رکھتا ہے۔ ہر شخص کے آگے لکھیں کہ وہ بچے کو کیا دیتا ہے: پیار، حفاظت، رہنمائی، روزی، کہانیاں۔',
    introEn: 'Your child in the middle, and around them everyone who cares for them. Next to each person, write what they give: love, safety, guidance, provision, stories.',
    hintUr: 'شاید آپ کو یہ بھی نظر آئے کہ کہاں ایک خالی جگہ ہے، جسے کوئی بھر سکتا ہے۔',
    hintEn: 'You may also see an empty place that someone could fill.',
    fields: [
      t('people', 'میرے بچے کے لوگ، اور ہر ایک کیا دیتا ہے', 'My child’s people, and what each one gives'),
      t('gap', 'ایک خالی جگہ، اور کون اسے بھر سکتا ہے', 'An empty place, and who could fill it', 'textarea', true),
    ],
  },
  {
    key: 'thirty-days', number: 11, lessonCode: 'P8-06',
    titleEn: 'My 30-Day Plan', titleUr: 'میرا تیس دن کا plan',
    introUr: 'آٹھ modules میں سے ایک بات چنیں، صرف ایک، جو آپ کے گھر کو سب سے زیادہ چاہیے۔ پھر چار خانے بھریں۔',
    introEn: 'From the eight modules, choose one thing, just one, that your home needs most. Then fill the four boxes.',
    hintUr: 'آپ کا مربی پندرہویں اور تیسویں دن آپ سے رابطہ کر کے حال پوچھے گا۔',
    hintEn: 'Your murabbi will check in with you on day 15 and day 30.',
    fields: [
      t('goal', 'میرا مقصد', 'My goal', 'text'),
      t('steps', 'اس کے تین قدم', 'Its three steps'),
      t('help', 'مجھے کیا مدد چاہیے', 'The help I need', 'text'),
      t('who', 'کون مدد کرے گا', 'Who will help', 'text'),
    ],
  },
  {
    key: 'promise', number: 12, lessonCode: 'PC-02',
    titleEn: 'My Promise', titleUr: 'میرا وعدہ',
    introUr: 'آپ نے والدین کا وعدہ سنا اور دہرایا۔ اب اسے اپنے الفاظ میں اپنے بچے کے لیے لکھیں… چند سطریں، دل سے۔',
    introEn: 'You heard and repeated the parents’ promise. Now write it for your child in your own words: a few lines, from the heart.',
    hintUr: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ',
    hintEn: '“Our Lord, grant us the coolness of our eyes in our families and children.”',
    fields: [
      t('promise', 'میرا وعدہ، میرے بچے کے لیے', 'My promise, to my child'),
    ],
  },
];
