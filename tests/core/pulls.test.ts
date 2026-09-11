import { describe, expect, it } from 'vitest';
import type { ImuSignals } from '@core/imu';
import { compute, DEFAULT_CONFIG, detectPulls } from '@core/score';

/** A flat, straight ride at 30 Hz with forward pulls `[startS, durS, g]` and nothing else. */
function straightRide(totalS: number, pulls: [number, number, number][]): ImuSignals {
  const fs = 30;
  const n = totalS * fs;
  const z = (): Float64Array => new Float64Array(n);
  const t = new Float64Array(n);
  const aLon = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    t[i] = i / fs;
    for (const [s0, d, g] of pulls) if (t[i] >= s0 && t[i] < s0 + d) aLon[i] = g;
  }
  return {
    t,
    fs,
    aLonG: aLon,
    rollDeg: z(),
    pitchDeg: z(),
    yawDeg: z(),
    yawRateDps: z(),
    yawRateLpDps: z(),
    aLatG: z(),
    aVertG: z(),
    leanDeg: z(),
  };
}

describe('detectPulls', () => {
  const cfg = { ...DEFAULT_CONFIG, pulls: true };
  it('marks a sustained pull with a real speed gain', () => {
    const a = new Float64Array(200); // 20 s at 10 Hz
    a.fill(0.3, 50, 100); // 5 s at 0.3 g → +14.7 m/s
    const m = detectPulls(a, 10, cfg);
    expect(m[49]).toBe(0);
    expect(m[50]).toBe(1);
    expect(m[99]).toBe(1);
    expect(m[100]).toBe(0);
  });
  it('skips short blips and gentle creeping', () => {
    const a = new Float64Array(200);
    a.fill(0.5, 20, 30); // 1 s: hard but too short
    a.fill(0.13, 100, 180); // 8 s at 0.13 g → +10 m/s, above the g floor... counts
    a.fill(0.1, 190, 200); // under the g floor
    const m = detectPulls(a, 10, cfg);
    expect(m.subarray(20, 30).some((v) => v === 1)).toBe(false);
    expect(m[150]).toBe(1);
    expect(m[195]).toBe(0);
  });
  it('needs the speed gain, not only the duration', () => {
    const a = new Float64Array(200);
    a.fill(0.13, 100, 130); // 3 s at 0.13 g → +3.8 m/s, under 6 m/s
    expect(detectPulls(a, 10, cfg).some((v) => v === 1)).toBe(false);
  });
  it('never marks braking', () => {
    const a = new Float64Array(200);
    a.fill(-0.6, 50, 120);
    expect(detectPulls(a, 10, cfg).some((v) => v === 1)).toBe(false);
  });
});

describe('compute with pulls', () => {
  const ride = straightRide(240, [[100, 6, 0.3]]);
  it('finds nothing on a straight by default (parity behaviour)', () => {
    const r = compute(ride);
    expect(r.config.pulls).toBe(false);
    expect(r.segments).toEqual([]);
    expect(r.signals.pullGate.every((v) => v === 0)).toBe(true);
  });
  it('turns the pull into an acceleration part when asked', () => {
    const r = compute(ride, { pulls: true });
    expect(r.segments.length).toBe(1);
    const seg = r.segments[0];
    expect(seg.reden).toBe('accel/rem');
    expect(seg.core_start_s).toBeGreaterThanOrEqual(97);
    expect(seg.core_end_s).toBeLessThanOrEqual(110);
    expect(seg.max_accel_g).toBeCloseTo(0.3, 1);
  });
});
