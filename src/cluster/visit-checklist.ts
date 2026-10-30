// The checklist a cluster supervisor fills in after visiting a circle.
// Drafted from the six parts of a circle session and the safeguarding rules;
// each item is scored 0 (needs support), 1 (good) or 2 (strong), or left out
// if it wasn't seen. Change the items here; old visits keep their own copy.

export interface ChecklistItem {
  key: string;
  group: string;
  title: string;
  /** What to look for. */
  look: string;
}

export const VISIT_CHECKLIST: ChecklistItem[] = [
  { key: 'setting',     group: 'Setting and safety', title: 'Safe, clean, welcoming space', look: 'Enough room to sit in a circle, clean, ventilated; a host adult present; children collected by a known adult.' },
  { key: 'two-adults',  group: 'Setting and safety', title: 'Safeguarding rules followed', look: 'Never one adult alone with one child; doors open; phones and photos only with consent; the murabbi knows who the Safeguarding Lead is.' },
  { key: 'punctual',    group: 'Setting and safety', title: 'Started and ended on time', look: 'Started within 10 minutes of the schedule; finished on time; parents knew when to collect.' },
  { key: 'welcome',     group: 'The six parts', title: 'Welcome and warm-up', look: 'Salam circle, the weekly opening du’a, feelings check; every child greeted by name.' },
  { key: 'quran',       group: 'The six parts', title: 'Qur’an and recitation', look: 'The month’s surah taught a few ayat at a time with meaning; gentle correction; earlier surahs reviewed.' },
  { key: 'tarbiyah',    group: 'The six parts', title: 'Tarbiyah lesson', look: 'This week’s syllabus session taught; story told (not read); children asked and answered questions.' },
  { key: 'activity',    group: 'The six parts', title: 'Activity and reflection', look: 'Hands-on activity linked to the lesson; every child took part; “one thing I learned” round.' },
  { key: 'dhikr',       group: 'The six parts', title: 'Dhikr and du’a circle', look: 'The month’s dhikr said together calmly; a quiet minute; children made their own du’as.' },
  { key: 'closing',     group: 'The six parts', title: 'Closing and pledge', look: 'Pledge said together; Noor Stars for effort; closing du’a; home activity explained to parents.' },
  { key: 'engagement',  group: 'Children', title: 'Children engaged and happy', look: 'Children attentive and joining in; shy children drawn in kindly; no child left out or shamed.' },
  { key: 'murabbi',     group: 'The murabbi', title: 'Murabbi’s manner', look: 'Warm, patient and prepared; uses love and hope, never fear; keeps the group calm without shouting.' },
  { key: 'records',     group: 'The murabbi', title: 'Attendance and agenda kept up', look: 'Attendance marked in the portal; this week’s session ticked off; notes to families written.' },
  { key: 'families',    group: 'Families', title: 'Connection with families', look: 'Parents briefed at pick-up; families know the family page and this week’s home activity.' },
];

export const VISIT_RATINGS = ['strong', 'good', 'needs-support', 'urgent'] as const;
export type VisitRating = (typeof VISIT_RATINGS)[number];
