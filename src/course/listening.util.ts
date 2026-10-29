// Listening tracking: which parts of a lesson were actually heard.
//
// The player reports the ranges it played since the last report. The server
// clamps them to the lesson, caps the new listening at what real time allows
// (at most 2× speed, plus a little slack), and merges them into the ranges
// already heard. Jumping ahead plays nothing, so it earns nothing.

export type Range = [number, number];

/** Sorts and merges overlapping or touching ranges (within 0.5s). */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .map(([a, b]) => [a, b] as Range)
    .sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export const rangesLength = (ranges: Range[]) => ranges.reduce((s, [a, b]) => s + (b - a), 0);

/** Parts of `incoming` not already covered by `heard`. */
function uncovered(incoming: Range[], heard: Range[]): Range[] {
  const out: Range[] = [];
  for (const [a0, b] of incoming) {
    let a = a0;
    for (const [h0, h1] of heard) {
      if (h1 <= a || h0 >= b) continue;
      if (h0 > a) out.push([a, Math.min(h0, b)]);
      a = Math.max(a, h1);
      if (a >= b) break;
    }
    if (a < b) out.push([a, b]);
  }
  return out;
}

export const MAX_RATE = 2;
export const SLACK_SEC = 3;
/** First report of a session: allow this much (the player reports every ~15s). */
export const FIRST_BEAT_ALLOWANCE_SEC = 40;

export interface BeatResult {
  heard   : Range[];
  heardSec: number;
  /** Seconds of new listening credited this beat (replays included). */
  playedSec: number;
}

/**
 * Applies one progress report.
 * @param elapsedSec seconds since the previous report (null for the first one)
 */
export function applyBeat(heard: Range[], segments: Range[], durationSec: number, elapsedSec: number | null): BeatResult {
  const clamped = mergeRanges(
    segments.map(([a, b]) => [Math.max(0, Math.min(a, durationSec)), Math.max(0, Math.min(b, durationSec))] as Range),
  );
  const allowance = elapsedSec == null
    ? FIRST_BEAT_ALLOWANCE_SEC
    : Math.min(elapsedSec, 120) * MAX_RATE + SLACK_SEC;

  // Replays count as listening time but don't need new credit; only new
  // ground is limited by the allowance, earliest first.
  const playedSec = Math.min(rangesLength(clamped), allowance);
  let budget = allowance;
  const accepted: Range[] = [];
  for (const [a, b] of uncovered(clamped, heard)) {
    if (budget <= 0) break;
    const take = Math.min(b - a, budget);
    accepted.push([a, a + take]);
    budget -= take;
  }
  const merged = mergeRanges([...heard, ...accepted]);
  return { heard: merged, heardSec: Math.min(rangesLength(merged), durationSec), playedSec };
}
