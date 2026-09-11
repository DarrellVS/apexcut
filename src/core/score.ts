/**
 * Turns IMU signals into a per-time "fun score" and highlight segments.
 *
 * Port of the Python oracle (dji_highlights/score.py). Rolling statistics reproduce pandas
 * `rolling(window, center=True, min_periods=1)`; percentiles reproduce numpy's linear interpolation.
 * See docs/scoring.md for the rules and why they exist.
 */
import type { ImuSignals } from './imu';
import type { Segment, ScoreConfig, Reason } from './types';

export const DEFAULT_CONFIG: ScoreConfig = {
  fs: 10,
  window_s: 2.0,
  weights: { lean: 0.5, yaw: 0.2, accel: 0.3, rpm: 0.0 },
  yaw_gate_lean_deg: 6.0,
  yaw_sustain_s: 1.2,
  speed_window_s: 4.0,
  speed_min_yaw_dps: 3.0,
  speed_gate_lo_mps: 3.0,
  speed_gate_hi_mps: 6.0,
  lean_yaw_lo_dps: 2.0,
  lean_yaw_hi_dps: 6.0,
  accel_near_lean_s: 6.0,
  accel_lean_lo_deg: 8.0,
  accel_lean_hi_deg: 15.0,
  pulls: false,
  pull_min_g: 0.12,
  pull_min_s: 2.5,
  pull_min_dv_mps: 6.0,
  smooth_s: 4.0,
  threshold_pct: 75,
  threshold_abs: null,
  merge_gap_s: 3.0,
  min_dur_s: 5.0,
  pad_s: 1.5,
  norm_clip: 4.0,
};

export function mergeConfig(overrides?: Partial<ScoreConfig> | null): ScoreConfig {
  const cfg: ScoreConfig = { ...DEFAULT_CONFIG, weights: { ...DEFAULT_CONFIG.weights } };
  if (!overrides) return cfg;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) continue;
    if (k === 'weights') Object.assign(cfg.weights, v as Partial<ScoreConfig['weights']>);
    else (cfg as unknown as Record<string, unknown>)[k] = v;
  }
  return cfg;
}

// ---------------------------------------------------------------- numpy / pandas helpers

/** numpy.interp with edge clamping; NaN samples are skipped. */
export function interp(tGrid: Float64Array, t: Float64Array, y: Float64Array): Float64Array {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < t.length; i++)
    if (!Number.isNaN(y[i])) {
      xs.push(t[i]);
      ys.push(y[i]);
    }
  const out = new Float64Array(tGrid.length);
  if (xs.length < 2) return out.fill(NaN);
  let j = 0;
  for (let i = 0; i < tGrid.length; i++) {
    const x = tGrid[i];
    if (x <= xs[0]) {
      out[i] = ys[0];
      continue;
    }
    if (x >= xs[xs.length - 1]) {
      out[i] = ys[ys.length - 1];
      continue;
    }
    while (xs[j + 1] < x) j++;
    const f = (x - xs[j]) / (xs[j + 1] - xs[j]);
    out[i] = ys[j] + f * (ys[j + 1] - ys[j]);
  }
  return out;
}

type RollFn = 'mean' | 'median' | 'max' | 'sum';

/** pandas Series.rolling(window=n, center=True, min_periods=1).<fn>() */
export function roll(s: Float64Array, window: number, fn: RollFn = 'mean'): Float64Array {
  const n = Math.max(1, Math.trunc(window));
  const len = s.length;
  const out = new Float64Array(len);
  const offset = Math.trunc((n - 1) / 2);
  const buf: number[] = [];
  for (let i = 0; i < len; i++) {
    const end = Math.min(len - 1, i + offset);
    const start = Math.max(0, i + offset - n + 1);
    if (fn === 'median') {
      buf.length = 0;
      for (let k = start; k <= end; k++) if (!Number.isNaN(s[k])) buf.push(s[k]);
      buf.sort((a, b) => a - b);
      const m = buf.length;
      out[i] = !m ? NaN : m % 2 ? buf[(m - 1) / 2] : (buf[m / 2 - 1] + buf[m / 2]) / 2;
    } else {
      let acc = fn === 'max' ? -Infinity : 0;
      let cnt = 0;
      for (let k = start; k <= end; k++) {
        const v = s[k];
        if (Number.isNaN(v)) continue;
        cnt++;
        if (fn === 'max') acc = Math.max(acc, v);
        else acc += v;
      }
      out[i] = !cnt ? NaN : fn === 'mean' ? acc / cnt : acc;
    }
  }
  return out;
}

/** numpy.nanpercentile(x, q) with linear interpolation. */
export function nanpercentile(x: ArrayLike<number>, q: number): number {
  const arr = Array.from(x)
    .filter((v) => !Number.isNaN(v))
    .sort((a, b) => a - b);
  if (!arr.length) return NaN;
  const idx = ((arr.length - 1) * q) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

export function nanmedian(x: ArrayLike<number>): number {
  return nanpercentile(x, 50);
}

/**
 * Positive robust z-score: (x - median) / scale, scale = max(1.4826·MAD, (p90 - median)/1.2816).
 * The p90 fallback keeps sparse features (mostly zero) from exploding when MAD ≈ 0. Clipped to [0, clip].
 */
export function robustPos(x: Float64Array, clip: number): Float64Array {
  const { med, scale } = robustScale(x);
  return x.map((v) => Math.min(clip, Math.max(0, (v - med) / scale)));
}
/** the median and scale `robustPos` divides by, so an extra term can be scaled the same way */
export function robustScale(x: Float64Array): { med: number; scale: number } {
  const med = nanmedian(x);
  const absDev = x.map((v) => Math.abs(v - med));
  const mad = nanmedian(absDev) * 1.4826;
  const p90 = (nanpercentile(x, 90) - med) / 1.2816;
  return { med, scale: Math.max(mad, p90, 1e-9) };
}

const clip01 = (v: number): number => Math.min(1, Math.max(0, v));
const abs = (a: Float64Array): Float64Array => a.map(Math.abs);
const mul = (a: Float64Array, b: Float64Array): Float64Array => a.map((v, i) => v * b[i]);

// ---------------------------------------------------------------- compute

export interface ScoreSignals {
  t: Float64Array;
  leanDeg: Float64Array;
  yawRateLpDps: Float64Array;
  aLonG: Float64Array;
  aLatG: Float64Array;
  rollDeg: Float64Array;
  speedWinMps: Float64Array;
  speedGate: Float64Array;
  leanYawGate: Float64Array;
  accelGate: Float64Array;
  /** 1 inside a straight-line pull (only when `pulls` is on) */
  pullGate: Float64Array;
  fLean: Float64Array;
  fYaw: Float64Array;
  fAccel: Float64Array;
  nLean: Float64Array;
  nYaw: Float64Array;
  nAccel: Float64Array;
  scoreRaw: Float64Array;
  score: Float64Array;
  cornerPart: Float64Array;
  accelPart: Float64Array;
}

export interface ScoreResult {
  signals: ScoreSignals;
  segments: Segment[];
  threshold: number;
  config: ScoreConfig;
}

export function compute(imu: ImuSignals, overrides?: Partial<ScoreConfig> | null): ScoreResult {
  const cfg = mergeConfig(overrides);
  const fs = cfg.fs;
  const tEnd = imu.t[imu.t.length - 1];
  const nGrid = Math.ceil(tEnd * fs - 1e-9); // numpy.arange(0, tEnd, 1/fs)
  const t = new Float64Array(nGrid);
  for (let i = 0; i < nGrid; i++) t[i] = i / fs;

  const rs = (y: Float64Array): Float64Array => interp(t, imu.t, y);
  const leanDeg = rs(imu.leanDeg);
  const yawRateLp = rs(imu.yawRateLpDps);
  const aLon = rs(imu.aLonG);
  const aLat = rs(imu.aLatG);
  const rollDeg = rs(imu.rollDeg);

  const win = Math.trunc(cfg.window_s * fs);

  // speed gate: v ≈ Σ|a_lat|·g / Σ|yaw| over a window. Junction turns (huge yaw, little g) → small.
  const swin = Math.trunc(cfg.speed_window_s * fs);
  const alatSum = roll(abs(aLat), swin, 'sum');
  const yawSum = roll(
    yawRateLp.map((v) => Math.abs((v * Math.PI) / 180)),
    swin,
    'sum',
  );
  const weakThr = ((cfg.speed_min_yaw_dps * Math.PI) / 180) * swin;
  const speedWin = new Float64Array(nGrid);
  const speedGate = new Float64Array(nGrid);
  for (let i = 0; i < nGrid; i++) {
    const weak = yawSum[i] < weakThr;
    speedWin[i] = weak ? NaN : (alatSum[i] * 9.81) / yawSum[i];
    speedGate[i] = weak
      ? 1
      : clip01(
          (speedWin[i] - cfg.speed_gate_lo_mps) / (cfg.speed_gate_hi_mps - cfg.speed_gate_lo_mps),
        );
  }

  // a real corner = lean AND sustained heading change
  const yawAbs = abs(yawRateLp);
  const yawSust = roll(yawAbs, Math.trunc(cfg.yaw_sustain_s * fs), 'median');
  const yawSustMax = roll(yawSust, win, 'max');
  const leanYawGate = yawSustMax.map((v) =>
    clip01((v - cfg.lean_yaw_lo_dps) / (cfg.lean_yaw_hi_dps - cfg.lean_yaw_lo_dps)),
  );
  const lean = leanDeg.map((v, i) => Math.abs(v) * speedGate[i] * leanYawGate[i]);
  const fLean = roll(lean, win, 'mean');

  const gate = fLean.map((v) => clip01(v / cfg.yaw_gate_lean_deg));
  const fYaw = roll(mul(mul(yawSust, gate), speedGate), win, 'mean');

  // braking/acceleration only counts near a real corner ...
  const near = roll(lean, Math.trunc(2 * cfg.accel_near_lean_s * fs), 'max');
  const nearGate = near.map((v) =>
    clip01((v - cfg.accel_lean_lo_deg) / (cfg.accel_lean_hi_deg - cfg.accel_lean_lo_deg)),
  );
  const fAccelBase = roll(mul(abs(aLon), nearGate), win, 'mean');

  const w = cfg.weights;
  const totalW =
    [w.lean, w.yaw, w.accel, w.rpm ?? 0].filter((v) => v > 0).reduce((a, b) => a + b, 0) || 1;
  const nLean = robustPos(fLean, cfg.norm_clip);
  const nYaw = robustPos(fYaw, cfg.norm_clip);
  const nAccelBase = robustPos(fAccelBase, cfg.norm_clip);
  const smooth = Math.trunc(cfg.smooth_s * fs);
  const scoreOf = (nAcc: Float64Array): Float64Array =>
    roll(
      nLean.map((v, i) => (w.lean * v + w.yaw * nYaw[i] + w.accel * nAcc[i]) / totalW),
      smooth,
      'mean',
    );
  const scoreBase = scoreOf(nAccelBase);

  // ... unless the rider asked for straight-line pulls as well. Pulls are purely additive: their
  // term is scaled like the base acceleration and added on top, and the threshold below is taken
  // from the score *without* them — switching pulls on can only add parts, never lose one.
  const pullGate = cfg.pulls ? detectPulls(aLon, fs, cfg) : new Float64Array(nGrid);
  const accelGate = nearGate.map((v, i) => Math.max(v, pullGate[i]));
  const pullOnly = pullGate.map((v, i) => Math.max(0, v - nearGate[i]));
  const fAccelPull = roll(mul(abs(aLon), pullOnly), win, 'mean');
  const fAccel = fAccelBase.map((v, i) => v + fAccelPull[i]);
  const { scale } = robustScale(fAccelBase);
  const nAccel = nAccelBase.map((v, i) =>
    Math.min(cfg.norm_clip, v + Math.max(0, fAccelPull[i] / scale)),
  );
  const scoreRaw = nLean.map(
    (v, i) => (w.lean * v + w.yaw * nYaw[i] + w.accel * nAccel[i]) / totalW,
  );
  const score = cfg.pulls ? scoreOf(nAccel) : scoreBase;
  const cornerPart = roll(
    nLean.map((v, i) => (w.lean * v + w.yaw * nYaw[i]) / totalW),
    smooth,
    'mean',
  );
  const accelPart = roll(
    nAccel.map((v) => (w.accel * v) / totalW),
    smooth,
    'mean',
  );

  const threshold = cfg.threshold_abs ?? nanpercentile(scoreBase, cfg.threshold_pct);
  const signals: ScoreSignals = {
    t,
    leanDeg,
    yawRateLpDps: yawRateLp,
    aLonG: aLon,
    aLatG: aLat,
    rollDeg,
    speedWinMps: speedWin,
    speedGate,
    leanYawGate,
    accelGate,
    pullGate,
    fLean,
    fYaw,
    fAccel,
    nLean,
    nYaw,
    nAccel,
    scoreRaw,
    score,
    cornerPart,
    accelPart,
  };
  return { signals, segments: buildSegments(signals, threshold, cfg), threshold, config: cfg };
}

/**
 * Straight-line pulls: forward acceleration stays above `pull_min_g` for at least `pull_min_s`
 * and the run adds up to a real speed gain (∫a·dt ≥ `pull_min_dv_mps`). Returns a 0/1 mask.
 * Braking is not included on purpose: a hard stop on a straight is usually traffic.
 */
export function detectPulls(aLon: Float64Array, fs: number, cfg: ScoreConfig): Float64Array {
  const n = aLon.length;
  const mask = new Float64Array(n);
  const minLen = Math.max(1, Math.round(cfg.pull_min_s * fs));
  let i = 0;
  while (i < n) {
    if (!(aLon[i] > cfg.pull_min_g)) {
      i++;
      continue;
    }
    let j = i;
    let dv = 0;
    while (j < n && aLon[j] > cfg.pull_min_g) dv += (aLon[j++] * 9.81) / fs;
    if (j - i >= minLen && dv >= cfg.pull_min_dv_mps) mask.fill(1, i, j);
    i = j;
  }
  return mask;
}

export function buildSegments(s: ScoreSignals, thr: number, cfg: ScoreConfig): Segment[] {
  const t = s.t;
  const n = t.length;
  const raw: [number, number][] = [];
  for (let i = 0; i < n;) {
    if (s.score[i] > thr) {
      let j = i;
      while (j < n && s.score[j] > thr) j++;
      raw.push([t[i], t[Math.min(j, n - 1)]]);
      i = j;
    } else i++;
  }
  const merged: [number, number][] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg[0] - last[1] < cfg.merge_gap_s) last[1] = seg[1];
    else merged.push([seg[0], seg[1]]);
  }
  const out: Segment[] = [];
  const tEnd = t[n - 1];
  for (const [s0, s1] of merged) {
    if (s1 - s0 < cfg.min_dur_s) continue;
    let corner = 0,
      accel = 0,
      sum = 0,
      peak = -Infinity,
      maxLean = 0,
      minLon = Infinity,
      maxLon = -Infinity,
      cnt = 0;
    for (let i = 0; i < n; i++) {
      if (t[i] < s0 || t[i] > s1) continue;
      cnt++;
      corner += s.cornerPart[i];
      accel += s.accelPart[i];
      sum += s.score[i];
      peak = Math.max(peak, s.score[i]);
      maxLean = Math.max(maxLean, Math.abs(s.leanDeg[i]));
      minLon = Math.min(minLon, s.aLonG[i]);
      maxLon = Math.max(maxLon, s.aLonG[i]);
    }
    corner /= cnt;
    accel /= cnt;
    const reden: Reason =
      corner > 2 * accel ? 'bochten' : accel > 2 * corner ? 'accel/rem' : 'beide';
    out.push({
      start_s: round2(Math.max(0, s0 - cfg.pad_s)),
      end_s: round2(Math.min(tEnd, s1 + cfg.pad_s)),
      core_start_s: round2(s0),
      core_end_s: round2(s1),
      score: round(sum / cnt, 3),
      peak: round(peak, 3),
      max_lean_deg: round(maxLean, 1),
      max_brake_g: round(-minLon, 2),
      max_accel_g: round(maxLon, 2),
      reden,
    });
  }
  return out;
}

const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;
const round2 = (v: number): number => round(v, 2);
