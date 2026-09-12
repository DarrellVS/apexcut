import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { axisMap, goproFrames, GOPRO_HZ } from '@core/gopro/attitude';
import { gpmfSeries, parseGpmf } from '@core/gopro/gpmf';
import { isGpmf, parseGopro } from '@core/gopro';
import { derive } from '@core/imu';

/**
 * Reading a GoPro. The fixtures are the metadata tracks of GoPro's own sample recordings (see
 * tests/fixtures/gopro/README.md): one camera that says nothing about its axes, one that does, and
 * one that also stores the attitude it worked out itself — which is what the fusion is measured
 * against here.
 */
const CLIPS = {
  hero5: { file: 'hero5.gpmf', durationS: 34.576, payloads: 34, device: 'Camera' },
  hero7: { file: 'hero7.gpmf', durationS: 12.715, payloads: 12, device: 'Hero7 Black' },
  hero8: { file: 'hero8.gpmf', durationS: 12.651, payloads: 13, device: 'HERO8 Black' },
};
const raw = (name: keyof typeof CLIPS): Uint8Array =>
  new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'gopro', CLIPS[name].file)));

type Q = [number, number, number, number];
const conj = (q: Q): Q => [q[0], -q[1], -q[2], -q[3]];
const mul = (a: Q, b: Q): Q => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
/** how far a quaternion turns, in degrees */
const turn = (q: Q): number => (2 * Math.acos(Math.min(1, Math.abs(q[0]))) * 180) / Math.PI;

describe('the GoPro metadata track', () => {
  it('is recognised by its first bytes', () => {
    expect(isGpmf(raw('hero8'))).toBe(true);
    expect(isGpmf(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(false);
  });

  it.each(Object.keys(CLIPS) as (keyof typeof CLIPS)[])(
    'reads every payload of %s, with the camera name and its sensors',
    (name) => {
      const payloads = parseGpmf(raw(name));
      expect(payloads).toHaveLength(CLIPS[name].payloads);
      expect(payloads.find((p) => p.device)?.device).toBe(CLIPS[name].device);
      for (const p of payloads) {
        expect(p.streams.has('ACCL')).toBe(true);
        expect(p.streams.has('GYRO')).toBe(true);
      }
    },
  );

  it('scales the accelerometer into metres per second squared', () => {
    const acc = gpmfSeries(parseGpmf(raw('hero5')), 'ACCL', CLIPS.hero5.durationS)!;
    const mean = acc.rows.reduce((s, r) => s + Math.hypot(r[0], r[1], r[2]), 0) / acc.rows.length;
    // a camera lying about on a desk feels one g, whichever way it is pointing
    expect(mean).toBeGreaterThan(9);
    expect(mean).toBeLessThan(11);
  });

  it('spreads the samples over the recording, in order', () => {
    const acc = gpmfSeries(parseGpmf(raw('hero5')), 'ACCL', CLIPS.hero5.durationS)!;
    expect(acc.t[0]).toBeCloseTo(0, 1);
    expect(acc.t[acc.t.length - 1]).toBeGreaterThan(CLIPS.hero5.durationS - 2);
    expect(acc.t[acc.t.length - 1]).toBeLessThanOrEqual(CLIPS.hero5.durationS + 0.1);
    for (let i = 1; i < acc.t.length; i++) expect(acc.t[i]).toBeGreaterThanOrEqual(acc.t[i - 1]);
  });

  it('has nothing to say about a track that is not GPMF', () => {
    expect(parseGpmf(new Uint8Array(64))).toHaveLength(0);
    expect(() => parseGopro(new Uint8Array(64), 10)).toThrow(/no GoPro metadata/);
  });
});

describe('which way the camera points', () => {
  it('follows the axis string the camera writes', () => {
    // the camera's X is right, Y forward, Z up; lower case means the other way round
    expect(axisMap('ZXY')).toEqual({ up: [0, 1], right: [1, 1], forward: [2, 1] });
    expect(axisMap('zxY')).toEqual({ up: [0, -1], right: [1, -1], forward: [2, 1] });
    expect(axisMap('XYZ')).toEqual({ right: [0, 1], forward: [1, 1], up: [2, 1] });
  });

  it('falls back to up, right, forward for a camera that says nothing', () => {
    expect(axisMap('')).toEqual(axisMap('ZXY'));
    expect(axisMap('nonsense')).toEqual(axisMap('ZXY'));
  });
});

describe('the attitude we work out from the sensors', () => {
  it('comes out at a steady 30 Hz over the whole recording', () => {
    const frames = goproFrames(parseGpmf(raw('hero5')), CLIPS.hero5.durationS);
    expect(frames.t.length).toBe(Math.round(CLIPS.hero5.durationS * GOPRO_HZ));
    expect(frames.quaternionCoverage).toBe(1);
    const imu = derive(frames);
    expect(imu.fs).toBeCloseTo(GOPRO_HZ, 1);
    // every quaternion is a rotation
    for (let i = 0; i < frames.t.length; i += 37) {
      expect(Math.hypot(frames.qw[i], frames.qx[i], frames.qy[i], frames.qz[i])).toBeCloseTo(1, 6);
    }
  });

  it('reads an upright camera as upright, whichever way up it was mounted', () => {
    // the Hero8 sample is mounted upside down: gravity sits on the wrong side of its "up" axis
    const frames = goproFrames(parseGpmf(raw('hero8')), CLIPS.hero8.durationS);
    const imu = derive(frames);
    const mid = Math.floor(imu.rollDeg.length / 2);
    expect(Math.abs(imu.rollDeg[mid])).toBeLessThan(20);
    // an upright camera at rest reads about −1 g on its down axis
    const meanDown = frames.az.reduce((a, v) => a + v, 0) / frames.az.length;
    expect(meanDown).toBeLessThan(-0.8);
    expect(meanDown).toBeGreaterThan(-1.2);
  });

  it('agrees with the attitude the Hero8 worked out itself', () => {
    const payloads = parseGpmf(raw('hero8'));
    const cori = gpmfSeries(payloads, 'CORI', CLIPS.hero8.durationS)!;
    const frames = goproFrames(payloads, CLIPS.hero8.durationS);
    const ours = (k: number): Q => [frames.qw[k], frames.qx[k], frames.qy[k], frames.qz[k]];
    const start = cori.rows[0] as Q;
    let worst = 0;
    for (let i = 1; i < cori.rows.length; i++) {
      const k = Math.round(cori.t[i] * GOPRO_HZ);
      if (k >= frames.t.length) break;
      // how far the camera has turned since the start, by its reckoning and by ours
      const theirs = turn(mul(conj(start), cori.rows[i] as Q));
      const mine = turn(mul(conj(ours(0)), ours(k)));
      worst = Math.max(worst, Math.abs(theirs - mine));
    }
    expect(worst).toBeLessThan(6);
  });

  it('turns a pan to the right into a positive yaw rate', () => {
    // measured from the picture itself: between 15.0 s and 15.2 s of the Hero5 sample the scene
    // slides left, so the camera swung right — and that has to read positive, like DJI
    const imu = derive(goproFrames(parseGpmf(raw('hero5')), CLIPS.hero5.durationS));
    const at = (s: number): number => imu.yawRateLpDps[Math.round(s * GOPRO_HZ)];
    expect(at(15.1)).toBeGreaterThan(40);
    expect(Math.max(...imu.yawRateLpDps)).toBeGreaterThan(60);
  });

  it('says so plainly when the track holds no motion data', () => {
    const payloads = parseGpmf(raw('hero5')).map((p) => ({ ...p, streams: new Map() }));
    expect(() => goproFrames(payloads, 10)).toThrow(/no motion data/);
  });
});
