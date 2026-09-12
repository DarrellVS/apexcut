/**
 * The numeric toolbox the scoring is built on: the numpy and pandas behaviour the Python oracle
 * relies on, reproduced exactly (rolling windows centred with `min_periods=1`, percentiles with
 * linear interpolation, a robust z-score with a p90 fallback). Nothing here knows about riding —
 * see score.ts for what it is used for, and docs/scoring.md for why.
 */

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

/** clamp to 0..1 */
export const clip01 = (v: number): number => Math.min(1, Math.max(0, v));
export const abs = (a: Float64Array): Float64Array => a.map(Math.abs);
export const mul = (a: Float64Array, b: Float64Array): Float64Array => a.map((v, i) => v * b[i]);

/** round to `d` decimals (the oracle rounds what it writes, so parity needs the same) */
export const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;

/** the plain median of what is not NaN */
export function median(values: ArrayLike<number>): number {
  const arr = Array.from(values)
    .filter((v) => !Number.isNaN(v))
    .sort((x, y) => x - y);
  const n = arr.length;
  if (!n) return NaN;
  return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
}
