import { describe, expect, it } from 'vitest';
import {
  FOLLOW_DEFAULTS,
  followAt,
  followCommands,
  followFrames,
  followPath,
  followTarget,
} from '@core/framing';

/** a series at 30 Hz of `n` samples with the same yaw rate throughout */
function steady(n: number, yawDps: number): { t: number[]; yaw: number[] } {
  return {
    t: Array.from({ length: n }, (_, i) => i / 30),
    yaw: Array.from({ length: n }, () => yawDps),
  };
}
const o = { ...FOLLOW_DEFAULTS, p0: 0.5 };

describe('where the window wants to be', () => {
  it('rests where the rider put it when the bike goes straight', () => {
    expect(followTarget(0, 0.5, o)).toBe(0.5);
    expect(followTarget(0, 0.2, { ...o, p0: 0.2 })).toBe(0.2);
  });

  it('ignores the small corrections and head turns of a straight road', () => {
    expect(followTarget(FOLLOW_DEFAULTS.deadDps - 1, 0.5, o)).toBe(0.5);
    expect(followTarget(-(FOLLOW_DEFAULTS.deadDps - 1), 0.5, o)).toBe(0.5);
    expect(followTarget(FOLLOW_DEFAULTS.deadDps + 10, 0.5, o)).toBeGreaterThan(0.5);
  });

  it('moves right on a right-hand turn and left on a left-hand one', () => {
    // positive yaw = turning right (checked against real recordings)
    expect(followTarget(60, 0.5, o)).toBeGreaterThan(0.5);
    expect(followTarget(-60, 0.5, o)).toBeLessThan(0.5);
  });

  it('never leaves the picture, however hard the turn', () => {
    for (const p0 of [0, 0.1, 0.5, 0.9, 1]) {
      for (const yaw of [-1000, -60, 0, 60, 1000]) {
        const v = followTarget(yaw, p0, { ...o, p0 });
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('uses at most the share of the room it is allowed', () => {
    expect(followTarget(1e6, 0.5, o)).toBeCloseTo(0.5 + FOLLOW_DEFAULTS.travel * 0.5, 6);
  });
});

describe('the path over a recording', () => {
  it('stays put on a straight road', () => {
    const { t, yaw } = steady(90, 0);
    const path = followPath(t, yaw, { p0: 0.4 });
    expect(Array.from(path).every((v) => Math.abs(v - 0.4) < 1e-9)).toBe(true);
  });

  it('leans into a long corner and comes back afterwards', () => {
    const t: number[] = [];
    const yaw: number[] = [];
    for (let i = 0; i < 300; i++) {
      t.push(i / 30);
      yaw.push(i < 150 ? 60 : 0);
    }
    const path = followPath(t, yaw, { p0: 0.5 });
    expect(path[149]).toBeGreaterThan(0.6);
    expect(path[299]).toBeCloseTo(0.5, 2);
  });

  it('pans instead of jumping: no step is faster than the limit', () => {
    const { t, yaw } = steady(120, 400);
    const path = followPath(t, yaw, { p0: 0.5 });
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i] - path[i - 1])).toBeLessThanOrEqual(
        FOLLOW_DEFAULTS.maxRatePerS / 30 + 1e-9,
      );
    }
  });

  it('holds a missing sample instead of jumping to the middle', () => {
    const t = [0, 1 / 30, 2 / 30];
    const path = followPath(t, [60, null, 60], { p0: 0.5 });
    expect(path[1]).toBeGreaterThan(0.5);
  });

  it('reads a moment and a part out of the path', () => {
    const { t, yaw } = steady(90, 0);
    const path = followPath(t, yaw, { p0: 0.25 });
    expect(followAt(t, path, -5)).toBeCloseTo(0.25, 6);
    expect(followAt(t, path, 99)).toBeCloseTo(0.25, 6);
    expect(followFrames(t, path, 0, 1, 30)).toHaveLength(30);
  });
});

describe('the commands the export burns in', () => {
  it('writes even pixels, only when the window actually moved', () => {
    const text = followCommands([0.5, 0.5, 0.5], 30, 1680);
    expect(text).toBe('0.0000 crop@follow x 840;');
  });

  it('keeps the window inside the picture', () => {
    const text = followCommands([0, 1], 30, 1680).split('\n');
    expect(text[0]).toBe('0.0000 crop@follow x 0;');
    expect(text[1]).toBe('0.0333 crop@follow x 1680;');
  });

  it('is empty for a window that never moves and a slack of nothing', () => {
    expect(followCommands([], 30, 1680)).toBe('');
    expect(followCommands([0.5, 0.9], 30, 0)).toBe('0.0000 crop@follow x 0;');
  });
});
