/**
 * The maths of a grade, used by both sides so a preview cannot drift from the export: gains and
 * saturation as one colour matrix, contrast and the shadows/highlights curve as one tone table, and
 * the ffmpeg filter chain built from exactly those numbers.
 *
 * ffmpeg notes worth keeping: `eq`, `colorlevels` and `vignette` drop a 10-bit picture to 8-bit
 * (`colorlevels` even blacks out gbrp10), so contrast rides along in the `curves` table and the dark
 * edges are a PNG mask overlaid later (see main/actions/vignette.ts).
 */
import type { Grade } from './looks';
import { isNeutral } from './looks';

/** per-channel gains from exposure, warmth and tint (applied before contrast) */
export function channelGains(g: Grade): { r: number; g: number; b: number } {
  const gain = Math.pow(2, g.exposure);
  const w = g.warmth / 100;
  const t = g.tint / 100;
  return {
    r: gain * (1 + 0.16 * w),
    g: gain * (1 - 0.1 * t),
    b: gain * (1 - 0.16 * w),
  };
}
/** contrast multiplier around mid grey */
export const contrastFactor = (g: Grade): number => 1 + g.contrast / 100;
/** saturation multiplier, 0 = grey */
export const saturationFactor = (g: Grade): number => Math.max(0, 1 + g.saturation / 100);

/**
 * Tone curve control points (x, y in 0…1) for shadows and highlights: the quarter points move,
 * the ends stay put. Both sides interpolate through these.
 */
export function curvePoints(g: Grade): [number, number][] {
  const s = g.shadows / 100;
  const h = g.highlights / 100;
  return [
    [0, 0],
    [0.25, clamp01(0.25 + 0.14 * s)],
    [0.75, clamp01(0.75 + 0.14 * h)],
    [1, 1],
  ];
}
/** the curve sampled at n evenly spaced inputs (monotone cubic through the control points) */
export function sampleCurve(g: Grade, n = 33): number[] {
  const pts = curvePoints(g);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  // Fritsch–Carlson monotone cubic slopes
  const m: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < 3; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m.push(d[0]);
  for (let i = 1; i < 3; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[2]);
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1);
    let i = 0;
    while (i < 2 && x > xs[i + 1]) i++;
    const hx = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / hx;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    const h11 = t ** 3 - t ** 2;
    out.push(clamp01(h00 * ys[i] + h10 * hx * m[i] + h01 * ys[i + 1] + h11 * hx * m[i + 1]));
  }
  return out;
}
/** ffmpeg `unsharp` amount */
export const sharpenAmount = (g: Grade): number => (g.sharpen / 100) * 1.5;
/** how dark the corners get, 0…1 (the same number drives the preview overlay and the export mask) */
export const vignetteStrength = (g: Grade): number => (g.vignette / 100) * 0.85;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const f3 = (v: number): string => v.toFixed(3);
const f4 = (v: number): string => v.toFixed(4);

/** Rec. 709 luma weights, the same the SVG `saturate` matrix uses */
const LUMA = [0.2126, 0.7152, 0.0722];

/**
 * One 3×3 RGB matrix for gains and saturation: M = S(s) · diag(gains). Row-major
 * [[rr, rg, rb], [gr, gg, gb], [br, bg, bb]] in ffmpeg's naming (output row, input column).
 */
export function colorMatrix(g: Grade): number[][] {
  const k = channelGains(g);
  const s = saturationFactor(g);
  const gains = [k.r, k.g, k.b];
  const m: number[][] = [];
  for (let o = 0; o < 3; o++) {
    const row: number[] = [];
    for (let i = 0; i < 3; i++) {
      const sat = (1 - s) * LUMA[i] + (o === i ? s : 0);
      row.push(sat * gains[i]);
    }
    m.push(row);
  }
  return m;
}

/**
 * The tone table both sides use: contrast around mid grey, then the shadows / highlights curve,
 * sampled at n evenly spaced inputs. Contrast and saturation commute (both linear, saturation's
 * rows sum to 1), so contrast can live here instead of in a matrix.
 */
export function toneTable(g: Grade, n = 33): number[] {
  const c = contrastFactor(g);
  const curve = sampleCurve(g, n);
  const at = (x: number): number => {
    const i = x * (n - 1);
    const lo = Math.floor(i);
    const hi = Math.min(n - 1, lo + 1);
    return curve[lo] + (curve[hi] - curve[lo]) * (i - lo);
  };
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(clamp01(at(clamp01((k / (n - 1) - 0.5) * c + 0.5))));
  return out;
}
/** whether the tone table does anything */
export const hasTone = (g: Grade): boolean => !!(g.contrast || g.shadows || g.highlights);

/**
 * The export side: ffmpeg video filters for a grade, in order, all of them fine with 10-bit RGB
 * (`eq`, `colorlevels`, `vignette` and 8-bit paths are avoided on purpose). Empty for a neutral
 * grade. Dark edges are not a filter: see `vignetteStrength`, the caller overlays a mask.
 */
export function ffmpegGrade(g: Grade | null | undefined): string[] {
  if (!g || isNeutral(g)) return [];
  const out: string[] = [];
  const m = colorMatrix(g);
  const identity = m.every((row, o) => row.every((v, i) => Math.abs(v - (o === i ? 1 : 0)) < 1e-6));
  if (!identity) {
    const n = ['r', 'g', 'b'];
    const opts: string[] = [];
    for (let o = 0; o < 3; o++)
      for (let i = 0; i < 3; i++) opts.push(`${n[o]}${n[i]}=${f4(m[o][i])}`);
    out.push(`colorchannelmixer=${opts.join(':')}`);
  }
  if (hasTone(g)) {
    const pts = toneTable(g)
      .map((y, i) => `${f4(i / 32)}/${f4(y)}`)
      .join(' ');
    out.push(`curves=all='${pts}'`);
  }
  if (g.sharpen) out.push(`unsharp=5:5:${f3(sharpenAmount(g))}`);
  return out;
}
