import { proportional } from './rewards.service';
import { EngagementService } from '../engagement/engagement.service';

describe('proportional', () => {
  it('splits by weight, rounding each share down to PKR 10', () => {
    expect(proportional(1000, [3, 1])).toEqual([750, 250]);
    expect(proportional(1000, [1, 1, 1])).toEqual([330, 330, 330]);
  });

  it('never exceeds the budget', () => {
    const shares = proportional(997, [7, 5, 3, 2]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(997);
  });

  it('returns zeros for no weight or no budget', () => {
    expect(proportional(0, [1, 2])).toEqual([0, 0]);
    expect(proportional(500, [0, 0])).toEqual([0, 0]);
  });
});

describe('EngagementService.autoScore', () => {
  const c = (score: number | null, weight: number) => ({ key: 'k', label: 'l', detail: '', score, weight });

  it('is the weighted average of components with data', () => {
    expect(EngagementService.autoScore([c(100, 25), c(50, 25)])).toBe(75);
  });

  it('rescales over components that have data', () => {
    // 80 at weight 25 and no data at weight 75 → 80, not 20
    expect(EngagementService.autoScore([c(80, 25), c(null, 75)])).toBe(80);
  });

  it('is 0 with no data at all', () => {
    expect(EngagementService.autoScore([c(null, 50), c(null, 50)])).toBe(0);
  });
});
