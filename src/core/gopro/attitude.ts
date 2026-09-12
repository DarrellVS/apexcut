/**
 * GoPro gives raw sensors, not an attitude: an accelerometer and a gyroscope, in the camera's own
 * axes. This turns them into the same thing DJI hands over — time, attitude quaternion and
 * acceleration in one frame (x forward, y right, z down, g) — so everything downstream is shared.
 *
 * How: the axes are put in that order (the camera says which is which in `ORIO`; the oldest models
 * that say nothing write up, right, forward), an upside-down mount is noticed from where gravity
 * sits on average and turned back up, and a Mahony complementary filter fuses the two sensors —
 * the gyroscope for the fast movement, the accelerometer pulling the horizon level so it cannot
 * drift away. Yaw drifts, as it must without a compass, but only the *rate* of it is ever used.
 *
 * Checked against GoPro's own sample recordings: on a Hero8, which also stores the camera's own
 * fused attitude (`CORI`), this agrees to a few degrees; and on a Hero5 pan, a turn to the right
 * comes out positive — the same sign as DJI, measured from the picture itself.
 */
import type { FrameMeta } from '../frames';
import { type GpmfPayload, gpmfSeries } from './gpmf';

const G = 9.80665;
/** how hard the accelerometer pulls the attitude level, and how fast a gyro bias is learned */
const KP = 1;
const KI = 0.02;
/** the rate the fused result is written at (DJI records ~30 Hz, and scoring is tuned for it) */
export const GOPRO_HZ = 30;

/** where one wire component of a GoPro stream points: the camera's X is right, Y forward, Z up */
type Axis = 'forward' | 'right' | 'up';
const AXIS_OF: Record<string, Axis> = { X: 'right', Y: 'forward', Z: 'up' };

export interface AxisMap {
  /** which wire component holds each axis, and with which sign */
  forward: [number, number];
  right: [number, number];
  up: [number, number];
}

/** The order the camera writes its axes in ("ZXY", lower case = the other way round). */
export function axisMap(orderOut: string): AxisMap {
  const order = /^[XYZxyz]{3}$/.test(orderOut) ? orderOut : 'ZXY';
  const map: AxisMap = { forward: [2, 1], right: [1, 1], up: [0, 1] };
  for (let i = 0; i < 3; i++) {
    const c = order[i];
    const axis = AXIS_OF[c.toUpperCase()];
    map[axis] = [i, c === c.toUpperCase() ? 1 : -1];
  }
  return map;
}

/** one row of a GoPro stream as (forward, right, down); `upside` turns an inverted mount back up */
function toBody(row: number[], m: AxisMap, upside: boolean): [number, number, number] {
  const pick = ([i, s]: [number, number]): number => (row[i] ?? 0) * s;
  const forward = pick(m.forward);
  const right = pick(m.right);
  const down = -pick(m.up);
  return upside ? [forward, -right, -down] : [forward, right, down];
}

export interface Fused {
  t: Float64Array;
  qw: Float64Array;
  qx: Float64Array;
  qy: Float64Array;
  qz: Float64Array;
}

/**
 * Attitude over the whole recording, at the gyroscope's own rate. `acc` is in g, `gyr` in radians
 * per second, both already as (forward, right, down).
 */
export function fuse(
  accT: ArrayLike<number>,
  acc: number[][],
  gyrT: ArrayLike<number>,
  gyr: number[][],
): Fused {
  const n = gyrT.length;
  const t = new Float64Array(n);
  const qwA = new Float64Array(n);
  const qxA = new Float64Array(n);
  const qyA = new Float64Array(n);
  const qzA = new Float64Array(n);
  let qw = 1;
  let qx = 0;
  let qy = 0;
  let qz = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  let ai = 0;
  for (let i = 0; i < n; i++) {
    const dt = i === 0 ? 0 : Math.min(0.1, Math.max(0, gyrT[i] - gyrT[i - 1]));
    let [gp, gq, gr] = gyr[i] as [number, number, number];
    while (ai + 1 < accT.length && accT[ai + 1] <= gyrT[i]) ai++;
    const a = acc[ai];
    const norm = a ? Math.hypot(a[0], a[1], a[2]) : 0;
    if (dt > 0 && norm > 0.1) {
      const ax = a[0] / norm;
      const ay = a[1] / norm;
      const az = a[2] / norm;
      // which way the current attitude thinks down is, seen from the camera
      const vx = 2 * (qx * qz - qw * qy);
      const vy = 2 * (qw * qx + qy * qz);
      const vz = qw * qw - qx * qx - qy * qy + qz * qz;
      // at rest the accelerometer points the other way, at −down: that is the error to correct
      const ex = -(ay * vz - az * vy);
      const ey = -(az * vx - ax * vz);
      const ez = -(ax * vy - ay * vx);
      bx += ex * KI * dt;
      by += ey * KI * dt;
      bz += ez * KI * dt;
      gp += KP * ex + bx;
      gq += KP * ey + by;
      gr += KP * ez + bz;
    }
    if (dt > 0) {
      const h = 0.5 * dt;
      const nw = qw + h * (-qx * gp - qy * gq - qz * gr);
      const nx = qx + h * (qw * gp + qy * gr - qz * gq);
      const ny = qy + h * (qw * gq - qx * gr + qz * gp);
      const nz = qz + h * (qw * gr + qx * gq - qy * gp);
      const len = Math.hypot(nw, nx, ny, nz) || 1;
      qw = nw / len;
      qx = nx / len;
      qy = ny / len;
      qz = nz / len;
    }
    t[i] = gyrT[i];
    qwA[i] = qw;
    qxA[i] = qx;
    qyA[i] = qy;
    qzA[i] = qz;
  }
  return { t, qw: qwA, qx: qxA, qy: qyA, qz: qzA };
}

/** the sample at or before a moment */
function indexAt(t: ArrayLike<number>, time: number, from: number): number {
  let i = from;
  while (i + 1 < t.length && t[i + 1] <= time) i++;
  return i;
}

export class NoMotionData extends Error {}

/**
 * The whole recording as frames: accelerometer and gyroscope fused, written at a steady 30 Hz.
 * Throws when the track has no motion streams at all (a GoPro that only wrote GPS, say).
 */
export function goproFrames(payloads: GpmfPayload[], durationS: number): FrameMeta {
  const accS = gpmfSeries(payloads, 'ACCL', durationS);
  const gyrS = gpmfSeries(payloads, 'GYRO', durationS);
  if (!accS || !gyrS || accS.rows.length < 2 || gyrS.rows.length < 2) {
    throw new NoMotionData(
      'This video has no motion data (no accelerometer or gyroscope in the GoPro track).',
    );
  }
  const first = payloads.find((p) => p.streams.has('ACCL'));
  const map = axisMap(first?.streams.get('ACCL')?.orderOut ?? '');
  const gyroMap = axisMap(
    payloads.find((p) => p.streams.has('GYRO'))?.streams.get('GYRO')?.orderOut ?? '',
  );

  // where gravity sits on average says which way up the camera was mounted
  let sumUp = 0;
  for (const row of accS.rows) sumUp += -toBody(row, map, false)[2];
  const upside = sumUp / accS.rows.length < 0;

  const acc = accS.rows.map((row) => {
    const b = toBody(row, map, upside);
    return [b[0] / G, b[1] / G, b[2] / G];
  });
  const gyr = gyrS.rows.map((row) => toBody(row, gyroMap, upside));
  const fused = fuse(accS.t, acc, gyrS.t, gyr);

  const n = Math.max(2, Math.round(durationS * GOPRO_HZ));
  const t = new Float64Array(n);
  const tsUs = new Float64Array(n);
  const qw = new Float64Array(n);
  const qx = new Float64Array(n);
  const qy = new Float64Array(n);
  const qz = new Float64Array(n);
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const az = new Float64Array(n);
  let fi = 0;
  let aiIdx = 0;
  for (let k = 0; k < n; k++) {
    const time = k / GOPRO_HZ;
    fi = indexAt(fused.t, time, fi);
    aiIdx = indexAt(accS.t, time, aiIdx);
    t[k] = time;
    tsUs[k] = time * 1e6;
    qw[k] = fused.qw[fi];
    qx[k] = fused.qx[fi];
    qy[k] = fused.qy[fi];
    qz[k] = fused.qz[fi];
    const a = acc[aiIdx] ?? [0, 0, -1];
    ax[k] = a[0];
    ay[k] = a[1];
    az[k] = a[2];
  }
  return { t, tsUs, qw, qx, qy, qz, ax, ay, az, quaternionCoverage: 1 };
}
