// Weekly meeting dates for a circle, worked out in Pakistan time (UTC+5,
// no daylight saving). Dates are 'YYYY-MM-DD' strings in Pakistan time.

const PKT_MS = 5 * 3600_000;
const DAY_MS = 24 * 3600_000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Pakistan. */
export function pkToday(now: Date = new Date()): string {
  return new Date(now.getTime() + PKT_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The UTC instant of `date` at `time` ("HH:MM") Pakistan time. */
export function pkInstant(date: string, time = '00:00'): Date {
  return new Date(Date.parse(`${date}T${time}:00Z`) - PKT_MS);
}

export interface Closure { startDate: string; endDate: string }

export const isClosed = (date: string, closures: Closure[]) =>
  closures.some((c) => date >= c.startDate && date <= c.endDate);

/** Meeting dates from `from` to `to` (inclusive) on `weekday`, skipping closures. */
export function meetingDates(weekday: number, from: string, to: string, closures: Closure[] = []): string[] {
  const out: string[] = [];
  let d = addDays(from, (weekday - weekdayOf(from) + 7) % 7);
  while (d <= to) {
    if (!isClosed(d, closures)) out.push(d);
    d = addDays(d, 7);
  }
  return out;
}

export interface CircleSchedule {
  meetingDay : number | null;
  meetingTime: string | null;
  startDate  : string | null;
}

/**
 * How many meetings the circle should have held by now: every scheduled
 * meeting from its start date whose start time has passed, minus closures.
 * null when the circle has no schedule.
 */
export function expectedSessions(c: CircleSchedule, closures: Closure[], now: Date = new Date()): number | null {
  if (c.meetingDay == null || !c.startDate) return null;
  const today = pkToday(now);
  const dates = meetingDates(c.meetingDay, c.startDate, today, closures);
  // today's meeting only counts once it has started
  if (dates[dates.length - 1] === today && now < pkInstant(today, c.meetingTime ?? '00:00')) dates.pop();
  return dates.length;
}

/** Next meeting on or after today (today counts until the meeting has started + 3h). */
export function nextMeeting(c: CircleSchedule, closures: Closure[], now: Date = new Date()): string | null {
  if (c.meetingDay == null) return null;
  let from = pkToday(now);
  if (c.startDate && c.startDate > from) from = c.startDate;
  const candidates = meetingDates(c.meetingDay, from, addDays(from, 7 * 26), closures);
  for (const d of candidates) {
    if (pkInstant(d, c.meetingTime ?? '00:00').getTime() + 3 * 3600_000 > now.getTime()) return d;
  }
  return null;
}
