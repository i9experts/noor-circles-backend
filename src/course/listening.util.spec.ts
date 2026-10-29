import { applyBeat, mergeRanges, rangesLength } from './listening.util';

describe('listening tracking', () => {
  it('merges overlapping and touching ranges', () => {
    expect(mergeRanges([[10, 20], [0, 5], [5.3, 8], [19, 25]])).toEqual([[0, 8], [10, 25]]);
    expect(rangesLength([[0, 8], [10, 25]])).toBe(23);
  });

  it('credits continuous listening', () => {
    let r = applyBeat([], [[0, 15]], 60, null);
    expect(r.heardSec).toBe(15);
    r = applyBeat(r.heard, [[15, 30]], 60, 15);
    expect(r.heard).toEqual([[0, 30]]);
  });

  it('does not credit more than real time allows (no faking a whole lesson)', () => {
    const r = applyBeat([[0, 10]], [[10, 60]], 60, 5); // 50s claimed in 5s
    expect(r.heardSec).toBe(10 + 5 * 2 + 3);
  });

  it('jumping ahead skips the middle', () => {
    let r = applyBeat([], [[0, 10]], 100, null);
    r = applyBeat(r.heard, [[80, 90]], 100, 10);
    expect(r.heard).toEqual([[0, 10], [80, 90]]);
    expect(r.heardSec).toBe(20);
  });

  it('replays count as listening time but add nothing new', () => {
    const r = applyBeat([[0, 30]], [[0, 15]], 60, 15);
    expect(r.heardSec).toBe(30);
    expect(r.playedSec).toBe(15);
  });

  it('clamps to the lesson length', () => {
    const r = applyBeat([], [[-5, 10], [50, 70]], 60, 60);
    expect(r.heard).toEqual([[0, 10], [50, 60]]);
  });
});
