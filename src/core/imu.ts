/**
 * Motion signals from the 30 Hz attitude quaternion + camera-frame accelerometer.
 *
 * Frame conventions (verified on real footage): camera/head frame x forward, y right, z down;
 * quaternion (w,x,y,z) Hamilton, camera → world; Euler ZYX with roll + = lean right, pitch + = nose up,
 * yaw + = right turn. Accelerometer = specific force in g (~(0,0,-1) at rest).
 *
 * Gravity is removed with the Euler angles:
 *   a_lon = ax - sin(pitch)               forward +, braking -
 *   a_lat = ay + sin(roll)·cos(pitch)     ≈ tan(lean angle of the bike)
 * The helmet sits more upright than the bike, so a_lat is the better lean proxy than head roll.
 *
 * The low-pass filter reproduces scipy.signal.butter(2, fc/(fs/2)) + filtfilt (odd padding, lfilter_zi)
 * so results match the Python oracle to floating-point precision.
 */
import type { FrameMeta } from './dji/djmd';

export interface ImuSignals {
  t: Float64Array;
  rollDeg: Float64Array;
  pitchDeg: Float64Array;
  yawDeg: Float64Array;
  yawRateDps: Float64Array;
  yawRateLpDps: Float64Array;
  aLonG: Float64Array;
  aLatG: Float64Array;
  aVertG: Float64Array;
  leanDeg: Float64Array;
  fs: number;
}

// ---------------------------------------------------------------- filtering (scipy-compatible)

/** 2nd-order Butterworth low-pass, bilinear transform. Returns normalised [b, a] like scipy.butter(2, Wn). */
export function butter2(fc: number, fs: number): { b: number[]; a: number[] } {
  const k = Math.tan((Math.PI * fc) / fs);
  const k2 = k * k;
  const sqrt2 = Math.SQRT2;
  const norm = 1 / (1 + sqrt2 * k + k2);
  const b0 = k2 * norm;
  return { b: [b0, 2 * b0, b0], a: [1, 2 * (k2 - 1) * norm, (1 - sqrt2 * k + k2) * norm] };
}

/** scipy.signal.lfilter_zi for a 2nd-order section. */
function lfilterZi(b: number[], a: number[]): [number, number] {
  // (I - companion(a).T) zi = b[1:] - a[1:]*b[0]
  const a1 = a[1];
  const a2 = a[2];
  const B0 = b[1] - a1 * b[0];
  const B1 = b[2] - a2 * b[0];
  // matrix [[1+a1, -1],[a2, 1]]
  const det = (1 + a1) * 1 - -1 * a2;
  const z0 = (B0 * 1 - -1 * B1) / det;
  const z1 = ((1 + a1) * B1 - a2 * B0) / det;
  return [z0, z1];
}

function lfilter(b: number[], a: number[], x: Float64Array, zi: [number, number]): Float64Array {
  const y = new Float64Array(x.length);
  let z0 = zi[0];
  let z1 = zi[1];
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = b[0] * xi + z0;
    z0 = b[1] * xi - a[1] * yi + z1;
    z1 = b[2] * xi - a[2] * yi;
    y[i] = yi;
  }
  return y;
}

/** scipy.signal.filtfilt(b, a, x) with default padtype='odd', padlen=3*max(len(a),len(b)). */
export function filtfilt(b: number[], a: number[], x: Float64Array): Float64Array {
  const n = x.length;
  const padlen = 3 * Math.max(a.length, b.length);
  if (n <= padlen) throw new RangeError('signal too short for filtfilt');
  // odd extension
  const ext = new Float64Array(n + 2 * padlen);
  for (let i = 0; i < padlen; i++) ext[i] = 2 * x[0] - x[padlen - i];
  ext.set(x, padlen);
  for (let i = 0; i < padlen; i++) ext[padlen + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  const zi = lfilterZi(b, a);
  const fwd = lfilter(b, a, ext, [zi[0] * ext[0], zi[1] * ext[0]]);
  fwd.reverse();
  const bwd = lfilter(b, a, fwd, [zi[0] * fwd[0], zi[1] * fwd[0]]);
  bwd.reverse();
  return bwd.slice(padlen, padlen + n);
}

/** Python `lowpass(x, fc, fs)`: identity when too short or fc >= Nyquist. */
export function lowpass(x: Float64Array, fc: number, fs: number): Float64Array {
  if (x.length < 7 || fc >= fs / 2) return Float64Array.from(x);
  const { b, a } = butter2(fc, fs);
  return filtfilt(b, a, x);
}

// ---------------------------------------------------------------- numpy helpers

/** numpy.gradient(y, t) — second-order central differences for non-uniform spacing, first-order edges. */
export function gradient(y: Float64Array, t: Float64Array): Float64Array {
  const n = y.length;
  const g = new Float64Array(n);
  if (n < 2) return g;
  for (let i = 1; i < n - 1; i++) {
    const hs = t[i] - t[i - 1];
    const hd = t[i + 1] - t[i];
    g[i] =
      (hs * hs * y[i + 1] + (hd * hd - hs * hs) * y[i] - hd * hd * y[i - 1]) /
      (hs * hd * (hd + hs));
  }
  g[0] = (y[1] - y[0]) / (t[1] - t[0]);
  g[n - 1] = (y[n - 1] - y[n - 2]) / (t[n - 1] - t[n - 2]);
  return g;
}

/** numpy.unwrap (period 2π). */
export function unwrap(p: Float64Array): Float64Array {
  const out = Float64Array.from(p);
  let offset = 0;
  for (let i = 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    if (d > Math.PI) offset -= 2 * Math.PI;
    else if (d < -Math.PI) offset += 2 * Math.PI;
    out[i] = p[i] + offset;
  }
  return out;
}

export function median(values: ArrayLike<number>): number {
  const arr = Array.from(values)
    .filter((v) => !Number.isNaN(v))
    .sort((x, y) => x - y);
  const n = arr.length;
  if (!n) return NaN;
  return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

// ---------------------------------------------------------------- derivation

/** Flip quaternion signs for continuity; fill missing rows with the first valid one. */
export function makeContinuous(f: FrameMeta): Float64Array[] {
  const n = f.t.length;
  const q = [
    Float64Array.from(f.qw),
    Float64Array.from(f.qx),
    Float64Array.from(f.qy),
    Float64Array.from(f.qz),
  ];
  let first = -1;
  for (let i = 0; i < n; i++)
    if (!Number.isNaN(q[0][i])) {
      first = i;
      break;
    }
  for (let i = 0; i < n; i++) {
    if (
      Number.isNaN(q[0][i]) ||
      Number.isNaN(q[1][i]) ||
      Number.isNaN(q[2][i]) ||
      Number.isNaN(q[3][i])
    ) {
      for (let k = 0; k < 4; k++) q[k][i] = first >= 0 ? q[k][first] : k === 0 ? 1 : 0;
    }
  }
  for (let i = 1; i < n; i++) {
    const dot =
      q[0][i] * q[0][i - 1] + q[1][i] * q[1][i - 1] + q[2][i] * q[2][i - 1] + q[3][i] * q[3][i - 1];
    if (dot < 0) for (let k = 0; k < 4; k++) q[k][i] = -q[k][i];
  }
  return q;
}

/** Linear interpolation over NaNs (pandas interpolate + bfill + ffill). */
function fillNaN(x: Float64Array): Float64Array {
  const out = Float64Array.from(x);
  const n = out.length;
  let lastValid = -1;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(out[i])) {
      if (lastValid >= 0 && lastValid < i - 1) {
        for (let k = lastValid + 1; k < i; k++)
          out[k] = out[lastValid] + ((out[i] - out[lastValid]) * (k - lastValid)) / (i - lastValid);
      } else if (lastValid < 0) {
        for (let k = 0; k < i; k++) out[k] = out[i];
      }
      lastValid = i;
    }
  }
  if (lastValid >= 0) for (let k = lastValid + 1; k < n; k++) out[k] = out[lastValid];
  return out;
}

export function derive(f: FrameMeta): ImuSignals {
  const n = f.t.length;
  const t = f.t;
  const dt = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) dt[i] = t[i + 1] - t[i];
  const fs = 1 / median(dt);

  const [w, x, y, z] = makeContinuous(f);
  const roll = new Float64Array(n);
  const pitch = new Float64Array(n);
  const yawRaw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    roll[i] = Math.atan2(2 * (w[i] * x[i] + y[i] * z[i]), 1 - 2 * (x[i] * x[i] + y[i] * y[i]));
    pitch[i] = Math.asin(Math.max(-1, Math.min(1, 2 * (w[i] * y[i] - z[i] * x[i]))));
    yawRaw[i] = Math.atan2(2 * (w[i] * z[i] + x[i] * y[i]), 1 - 2 * (y[i] * y[i] + z[i] * z[i]));
  }
  const yaw = unwrap(yawRaw);
  const ax = fillNaN(f.ax);
  const ay = fillNaN(f.ay);
  const az = fillNaN(f.az);

  const yawRate = gradient(yaw, t);
  const aLon = new Float64Array(n);
  const aLat = new Float64Array(n);
  const aVert = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    aLon[i] = ax[i] - Math.sin(pitch[i]);
    aLat[i] = ay[i] + Math.sin(roll[i]) * Math.cos(pitch[i]);
    aVert[i] = az[i] + Math.cos(roll[i]) * Math.cos(pitch[i]);
  }
  const deg = (arr: Float64Array): Float64Array => arr.map((v) => (v * 180) / Math.PI);
  const aLatLp = lowpass(aLat, 1.5, fs);
  return {
    t: Float64Array.from(t),
    rollDeg: deg(roll),
    pitchDeg: deg(pitch),
    yawDeg: deg(yaw),
    yawRateDps: deg(yawRate),
    yawRateLpDps: deg(lowpass(yawRate, 1.0, fs)),
    aLonG: lowpass(aLon, 1.5, fs),
    aLatG: aLatLp,
    aVertG: lowpass(aVert, 3.0, fs),
    leanDeg: aLatLp.map((v) => (Math.atan(v) * 180) / Math.PI),
    fs,
  };
}
