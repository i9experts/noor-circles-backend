import { editDistance, groupNames, matchPlace, normalise, tidyName } from './places.util';

const CITIES = [
  { name: 'Faisalabad', aliases: ['Lyallpur'] },
  { name: 'Karachi', aliases: ['Khi'] },
  { name: 'Lahore' },
];
const AREAS = [
  { name: 'Gulshan-e-Iqbal', aliases: ['Gulshan Iqbal'] },
  { name: 'Gulberg' },
  { name: 'F-7' }, { name: 'F-8' },
  { name: 'DHA Phase 5' }, { name: 'DHA Phase 6' },
];

describe('place names', () => {
  it('normalises case, accents, punctuation and spaces', () => {
    expect(normalise('  Gulshan-e-Iqbal,  Block 13 ')).toBe('gulshan e iqbal block 13');
  });

  it('counts transposed letters as one slip', () => {
    expect(editDistance('faislabad', 'faisalabad')).toBe(1);
    expect(editDistance('karahci', 'karachi')).toBe(1);
  });

  it('matches capitals, spacing, aliases and small spelling slips', () => {
    for (const t of ['FAISALABAD', 'faisalabad ', 'Faislabad', 'Faisal Abad', 'faisalabd', 'Lyallpur']) {
      expect([t, matchPlace(t, CITIES)?.name]).toEqual([t, 'Faisalabad']);
    }
    expect(matchPlace('karachi', CITIES)?.name).toBe('Karachi');
    expect(matchPlace('Gulshan e Iqbal', AREAS)?.name).toBe('Gulshan-e-Iqbal');
    expect(matchPlace('gulshaneiqbal', AREAS)?.name).toBe('Gulshan-e-Iqbal');
  });

  it('never merges different places that only look alike', () => {
    expect(matchPlace('Gulshan', AREAS)).toBeNull();     // not Gulberg
    expect(matchPlace('F-9', AREAS)).toBeNull();         // numbers must agree
    expect(matchPlace('DHA Phase 7', AREAS)).toBeNull();
    expect(matchPlace('Multan', CITIES)).toBeNull();
  });

  it('tidies unknown names', () => {
    expect(tidyName('north  NAZIMABAD')).toBe('North Nazimabad');
    expect(tidyName('DHA phase 5')).toBe('DHA Phase 5');
  });

  it('groups free-typed spellings, most common first', () => {
    const g = groupNames(['FAISALABAD', 'Faisalabad', 'Faislabad', 'KARACHI', 'Karachi', 'Sargodha', 'sargodah', 'SARGODHA', 'Sargodha'], CITIES);
    expect(new Set(g.values())).toEqual(new Set(['Faisalabad', 'Karachi', 'Sargodha']));
    expect(g.get('sargodah')).toBe('Sargodha');
  });
});
