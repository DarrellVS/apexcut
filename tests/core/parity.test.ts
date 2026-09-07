/**
 * Parity with the Python oracle (dji-highlights) on clip 0034.
 * Fixture: raw djmd track + intermediate signals + segments produced by the Python code.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDjmd } from '@core/dji/djmd';
import { derive } from '@core/imu';
import { compute } from '@core/score';

const raw = new Uint8Array(readFileSync(resolve(__dirname, '../fixtures/clip0034.djmd')));
const expected = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/clip0034.expected.json'), 'utf8'),
);

function closeArrays(
  actual: ArrayLike<number>,
  exp: (number | null)[],
  tol: number,
  label: string,
): void {
  expect(actual.length, `${label} length`).toBe(exp.length);
  let worst = 0;
  let worstIdx = -1;
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i];
    const a = actual[i];
    if (e === null) {
      if (!Number.isNaN(a)) {
        worst = Infinity;
        worstIdx = i;
        break;
      }
      continue;
    }
    const d = Math.abs(a - e);
    if (d > worst) {
      worst = d;
      worstIdx = i;
    }
  }
  expect(
    worst,
    `${label}: max deviation ${worst} at index ${worstIdx} (got ${actual[worstIdx]}, want ${exp[worstIdx]})`,
  ).toBeLessThanOrEqual(tol);
}

describe('djmd parsing', () => {
  const { header, frames } = parseDjmd(raw);
  it('reads the header', () => {
    expect(header.model).toBe(expected.header.model);
    expect(header.firmware).toBe(expected.header.firmware);
    expect(header.proto).toBe(expected.header.proto);
  });
  it('reads every frame', () => {
    expect(frames.t.length).toBe(expected.frames);
    expect(frames.quaternionCoverage).toBe(1);
  });
  it('matches the first frames exactly', () => {
    expected.parsed_first10.forEach((row: Record<string, number>, i: number) => {
      expect(frames.tsUs[i]).toBe(row.ts_us);
      expect(frames.qw[i]).toBeCloseTo(row.qw, 6);
      expect(frames.qz[i]).toBeCloseTo(row.qz, 6);
      expect(frames.ax[i]).toBeCloseTo(row.ax, 6);
      expect(frames.az[i]).toBeCloseTo(row.az, 6);
    });
  });
});

describe('imu derivation', () => {
  const imu = derive(parseDjmd(raw).frames);
  const every30 = (a: Float64Array): number[] => Array.from(a).filter((_, i) => i % 30 === 0);
  it('sampling rate', () => expect(imu.fs).toBeCloseTo(29.97, 2));
  it('euler angles', () => {
    closeArrays(every30(imu.rollDeg), expected.imu30_every30.roll_deg, 1e-4, 'roll');
    closeArrays(every30(imu.pitchDeg), expected.imu30_every30.pitch_deg, 1e-4, 'pitch');
    closeArrays(every30(imu.yawDeg), expected.imu30_every30.yaw_deg, 1e-4, 'yaw');
  });
  it('filtered signals (scipy filtfilt parity)', () => {
    closeArrays(
      every30(imu.yawRateLpDps),
      expected.imu30_every30.yaw_rate_lp_dps,
      1e-4,
      'yaw_rate_lp',
    );
    closeArrays(every30(imu.aLonG), expected.imu30_every30.a_lon_g, 1e-5, 'a_lon');
    closeArrays(every30(imu.aLatG), expected.imu30_every30.a_lat_g, 1e-5, 'a_lat');
    closeArrays(every30(imu.leanDeg), expected.imu30_every30.lean_deg, 1e-4, 'lean');
  });
});

describe('scoring', () => {
  const res = compute(derive(parseDjmd(raw).frames), null);
  const s = res.signals;
  it('10 Hz grid', () => closeArrays(s.t, expected.sig10.t, 1e-6, 't'));
  it('resampled inputs', () => {
    closeArrays(s.leanDeg, expected.sig10.lean_deg, 1e-3, 'lean_deg');
    closeArrays(s.aLonG, expected.sig10.a_lon_g, 1e-3, 'a_lon_g');
  });
  it('gates', () => {
    closeArrays(s.speedGate, expected.sig10.speed_gate, 1e-3, 'speed_gate');
    closeArrays(s.leanYawGate, expected.sig10.lean_yaw_gate, 1e-3, 'lean_yaw_gate');
    closeArrays(s.accelGate, expected.sig10.accel_gate, 1e-3, 'accel_gate');
  });
  it('features', () => {
    closeArrays(s.fLean, expected.sig10.f_lean, 1e-3, 'f_lean');
    closeArrays(s.fYaw, expected.sig10.f_yaw, 1e-3, 'f_yaw');
    closeArrays(s.fAccel, expected.sig10.f_accel, 1e-4, 'f_accel');
    closeArrays(s.nLean, expected.sig10.n_lean, 1e-3, 'n_lean');
    closeArrays(s.nAccel, expected.sig10.n_accel, 1e-3, 'n_accel');
    closeArrays(s.score, expected.sig10.score, 1e-3, 'score');
  });
  it('threshold and segments', () => {
    expect(res.threshold).toBeCloseTo(expected.threshold, 3);
    expect(res.segments.length).toBe(expected.segments.length);
    res.segments.forEach((seg, i) => {
      const e = expected.segments[i];
      expect(seg.start_s).toBeCloseTo(e.start_s, 1);
      expect(seg.end_s).toBeCloseTo(e.end_s, 1);
      expect(seg.reden).toBe(e.reden);
      expect(seg.max_lean_deg).toBeCloseTo(e.max_lean_deg, 0);
    });
  });
});
