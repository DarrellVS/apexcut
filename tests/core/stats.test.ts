import { describe, expect, it } from 'vitest';
import { countCorners, rangeStats, twistiestMinute } from '@core/stats';

/** 10 Hz lean trace: `corners` as [startS, durS, peakDeg] bumps (positive = left, negative = right) */
function trace(
  totalS: number,
  corners: [number, number, number][],
): { t: number[]; lean: number[] } {
  const t: number[] = [];
  const lean: number[] = [];
  for (let i = 0; i < totalS * 10; i++) {
    const s = i / 10;
    let v = 0;
    for (const [c0, d, peak] of corners) {
      if (s >= c0 && s <= c0 + d) v += peak * Math.sin(((s - c0) / d) * Math.PI);
    }
    t.push(s);
    lean.push(v);
  }
  return { t, lean };
}

describe('countCorners', () => {
  it('counts each lean excursion once', () => {
    const { t, lean } = trace(60, [
      [5, 4, 30],
      [12, 3, -28],
      [20, 5, 35],
      [30, 2, 25],
    ]);
    expect(countCorners(t, lean, [{ start_s: 0, end_s: 60 }])).toBe(4);
  });
  it('ignores gentle bends and blips', () => {
    const { t, lean } = trace(30, [
      [5, 4, 15], // under the 20° entry
      [12, 0.2, 40], // too short
    ]);
    expect(countCorners(t, lean, [{ start_s: 0, end_s: 30 }])).toBe(0);
  });
  it('does not double count when the lean flickers around the threshold', () => {
    const { t, lean } = trace(30, [[5, 6, 24]]);
    for (let i = 60; i < 100; i += 4) lean[i] = 19; // dips under 20° but stays over 12°
    expect(countCorners(t, lean, [{ start_s: 0, end_s: 30 }])).toBe(1);
  });
  it('a left-right flick is two corners', () => {
    const { t, lean } = trace(30, [
      [5, 2, 30],
      [7, 2, -30],
    ]);
    expect(countCorners(t, lean, [{ start_s: 0, end_s: 30 }])).toBe(2);
  });
  it('only counts inside the given ranges', () => {
    const { t, lean } = trace(60, [
      [5, 4, 30],
      [40, 4, 30],
    ]);
    expect(countCorners(t, lean, [{ start_s: 0, end_s: 20 }])).toBe(1);
    expect(countCorners(t, lean, [])).toBe(0);
  });
});

describe('rangeStats', () => {
  it('takes the extremes inside the range only', () => {
    const t = [0, 1, 2, 3, 4];
    const lean = [5, -30, 10, 40, 0];
    const aLon = [0.1, -0.7, 0.3, -0.2, 0.9];
    expect(rangeStats(t, lean, aLon, { start_s: 0, end_s: 2 })).toEqual({
      maxLeanDeg: 30,
      maxBrakeG: 0.7,
      maxAccelG: 0.3,
    });
  });
});

describe('twistiestMinute', () => {
  it('finds the minute with the most leaning, inside the ranges', () => {
    const { t, lean } = trace(300, [
      [100, 40, 30],
      [200, 20, 30],
    ]);
    const r = twistiestMinute(t, lean, [{ start_s: 0, end_s: 300 }]);
    expect(r).not.toBeNull();
    expect(r!.tS).toBeGreaterThanOrEqual(70);
    expect(r!.tS).toBeLessThanOrEqual(100);
    expect(r!.pct).toBeGreaterThan(50);
    expect(twistiestMinute(t, lean, [])).toEqual({ tS: 0, pct: 0 });
  });
});
