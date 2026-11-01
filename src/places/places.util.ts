// Matching place names typed by people ("FAISALABAD", "Faislabad",
// "gulshan e iqbal") to one spelling, so a place is counted once.

export interface NamedPlace { name: string; aliases?: string[] }

/** Lower case, no accents or punctuation, single spaces: "Gulshan-e-Iqbal " → "gulshan e iqbal". */
export function normalise(s: string) {
  return (s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_.,/\\()'’`"#:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The comparison key: normalised with the spaces removed ("north nazimabad" = "northnazimabad"). */
export const placeKey = (s: string) => normalise(s).replace(/ /g, '');

/** Edit distance with transpositions (Damerau–Levenshtein, optimal string alignment). */
export function editDistance(a: string, b: string) {
  if (a === b) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** How many typing slips a name of this length may have and still count as the same place. */
export function allowedSlips(key: string) {
  if (key.length <= 4) return 0;
  if (key.length <= 7) return 1;
  return 2;
}

/** Digits must agree exactly: "F-7" is never "F-8", "Phase 5" is never "Phase 6". */
const digits = (key: string) => key.replace(/\D/g, '');

/**
 * The known place this text means, or null. An exact name or alias wins;
 * otherwise the single closest name within the allowed slips (a tie means
 * it's ambiguous, so no match).
 */
export function matchPlace<T extends NamedPlace>(text: string, places: T[]): T | null {
  const key = placeKey(text);
  if (!key) return null;
  for (const p of places) {
    if (placeKey(p.name) === key || (p.aliases ?? []).some((a) => placeKey(a) === key)) return p;
  }
  let best: T | null = null;
  let bestDist = Infinity;
  let tie = false;
  for (const p of places) {
    for (const k of [p.name, ...(p.aliases ?? [])].map(placeKey)) {
      if (!k || digits(k) !== digits(key)) continue;
      const limit = Math.min(allowedSlips(key), allowedSlips(k));
      const dist = editDistance(key, k);
      if (dist > limit) continue;
      if (dist < bestDist) { best = p; bestDist = dist; tie = false; }
      else if (dist === bestDist && best !== p) tie = true;
    }
  }
  return tie ? null : best;
}

/** "north NAZIMABAD " → "North Nazimabad" (keeps short codes like "DHA", "F-7" as they are). */
export function tidyName(s: string) {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.split(' ').map((w) => (/\d/.test(w) || (w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w))
    ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}

/**
 * Groups free-typed names that are the same place: known places first,
 * then look-alikes among themselves (the most used spelling wins).
 * Returns a map from each original text to the name to show.
 */
export function groupNames(values: string[], known: NamedPlace[] = []): Map<string, string> {
  const out = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const v of values) if (v?.trim()) counts.set(v, (counts.get(v) ?? 0) + 1);
  const heads: NamedPlace[] = [];
  for (const [v] of [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const k = matchPlace(v, known);
    if (k) { out.set(v, k.name); continue; }
    const h = matchPlace(v, heads);
    if (h) { out.set(v, h.name); continue; }
    const head = { name: tidyName(v) };
    heads.push(head);
    out.set(v, head.name);
  }
  return out;
}
