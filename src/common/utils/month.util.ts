/**
 * Month helpers. A "month" is a 'YYYY-MM' string in Pakistan time (UTC+5,
 * no DST), so e.g. a payment at 02:00 PKT on the 1st belongs to the new month.
 */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthOf(date: Date = new Date()): string {
  const d = new Date(date.getTime() + PKT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  return monthOf(new Date());
}

/** [start, end) instants of a PKT month. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - PKT_OFFSET_MS),
    end  : new Date(Date.UTC(y, m, 1) - PKT_OFFSET_MS),
  };
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive list of months from `from` to `to` (empty if from > to). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Days of the month that have elapsed (whole month if it's in the past). */
export function elapsedDays(month: string, now: Date = new Date()): number {
  const { start, end } = monthRange(month);
  const total = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (now >= end) return total;
  if (now < start) return 0;
  return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86_400_000));
}
