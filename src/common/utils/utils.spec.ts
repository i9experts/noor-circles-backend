import { escapeRegex } from './regex.util';
import { addMonths, monthOf, monthRange, monthsBetween } from './month.util';

describe('escapeRegex', () => {
  it('matches the input literally', () => {
    for (const s of ['DHA Phase (2', 'Block.A', 'a+b*c?', '[x]{1}|^$\\']) {
      expect(new RegExp(`^${escapeRegex(s)}$`).test(s)).toBe(true);
    }
    expect(new RegExp(`^${escapeRegex('Block.A')}$`).test('BlockXA')).toBe(false);
  });
});

describe('month utils (Pakistan time)', () => {
  it('monthOf uses UTC+5', () => {
    // 20:00 UTC on 31 Jan is already 1 Feb in Pakistan
    expect(monthOf(new Date('2026-01-31T20:00:00Z'))).toBe('2026-02');
    expect(monthOf(new Date('2026-01-31T18:00:00Z'))).toBe('2026-01');
  });

  it('monthRange covers the Pakistan month', () => {
    const { start, end } = monthRange('2026-02');
    expect(start.toISOString()).toBe('2026-01-31T19:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-28T19:00:00.000Z');
  });

  it('addMonths / monthsBetween cross years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
