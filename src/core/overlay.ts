/**
 * Telemetry overlay: layout, drawing and the ffmpeg command stream for the lean gauge that goes into
 * the export and the live preview. Pure: drawing takes a minimal 2D-context interface (canvas in the
 * renderer, a mock in tests); the export composes three sprites drawn by that same code (bike, dial,
 * needle) with ffmpeg `rotate`/`drawtext`/`drawbox` driven per frame by `sendcmd` (main/actions/overlay.ts).
 */

export const OVERLAY_STYLES = ['minimal', 'dashboard'] as const;
export type OverlayStyle = (typeof OVERLAY_STYLES)[number];
export const OVERLAY_CORNERS = ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const;
export type OverlayCorner = (typeof OVERLAY_CORNERS)[number];
export const OVERLAY_SIZES = ['S', 'M', 'L'] as const;
export type OverlaySize = (typeof OVERLAY_SIZES)[number];

export interface OverlaySpec {
  style: OverlayStyle;
  corner: OverlayCorner;
  size: OverlaySize;
}

/** one moment of riding data */
export interface Sample {
  /** lean angle, degrees, negative = left */
  leanDeg: number;
  /** longitudinal acceleration in g, negative = braking */
  aLonG: number;
}

/** Where the gauge sits in a frame of `w`×`h`; everything in pixels. */
export interface OverlayLayout {
  /** square box of the gauge */
  x: number;
  y: number;
  box: number;
  /** centre of the dial / bike pivot */
  cx: number;
  cy: number;
  /** dial radius */
  r: number;
  /** side of the (square, padded) rotating sprite */
  sprite: number;
  numPx: number;
  /** baseline y of the number */
  numY: number;
  /** braking/acceleration bar (dashboard) */
  bar: { x: number; y: number; w: number; h: number } | null;
}

const SIZE_FRAC: Record<OverlaySize, number> = { S: 0.16, M: 0.22, L: 0.28 };
export const OVERLAY_MAX_LEAN = 60;
export const OVERLAY_MAX_G = 0.8;

export function overlayLayout(spec: OverlaySpec, w: number, h: number): OverlayLayout {
  const box = Math.round(Math.min(w, h) * SIZE_FRAC[spec.size]);
  const margin = Math.round(Math.min(w, h) * 0.035);
  const left = spec.corner.endsWith('left');
  const top = spec.corner.startsWith('top');
  const dash = spec.style === 'dashboard';
  const barW = dash ? Math.round(box * 0.12) : 0;
  const gap = dash ? Math.round(box * 0.08) : 0;
  const total = box + barW + gap;
  const x = left ? margin : w - margin - total;
  const y = top ? margin : h - margin - box;
  const cx = x + box / 2;
  const cy = y + box * 0.5;
  return {
    x,
    y,
    box,
    cx,
    cy,
    r: box * 0.42,
    sprite: Math.round(box * (dash ? 0.6 : 0.7)),
    numPx: Math.round(box * 0.24),
    numY: Math.round(y + box * 0.93),
    bar: dash ? { x: x + box + gap, y: y + box * 0.12, w: barW, h: Math.round(box * 0.76) } : null,
  };
}

/** The subset of CanvasRenderingContext2D the drawing needs (DOM-free for tests and core purity). */
export interface Ctx2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  lineWidth: number;
  lineCap: string;
  strokeStyle: string;
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
}

/** colours as plain strings: this runs outside the CSS token system (canvas, ffmpeg) */
export const OVERLAY_COLORS = {
  white: 'rgba(255,255,255,0.92)',
  dim: 'rgba(255,255,255,0.30)',
  accent: '#ff7a3d',
  brake: '#4dd0d0',
  /** the same for ffmpeg drawbox */
  accentFf: '0xff7a3d@0.9',
  brakeFf: '0x4dd0d0@0.9',
  dimFf: '0xffffff@0.3',
};
const FONT = 'Inter, "Segoe UI", sans-serif';

/** Bike silhouette seen from behind, upright, centred at (0,0), fitting a box of `s` pixels. */
export function drawBike(ctx: Ctx2D, s: number, color = OVERLAY_COLORS.white): void {
  const w = s * 0.5;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.06);
  // rear tyre
  ctx.beginPath();
  ctx.moveTo(-w * 0.16, s * 0.05);
  ctx.lineTo(w * 0.16, s * 0.05);
  ctx.lineTo(w * 0.16, s * 0.42);
  ctx.lineTo(-w * 0.16, s * 0.42);
  ctx.closePath();
  ctx.fill();
  // body / tank
  ctx.beginPath();
  ctx.moveTo(-w * 0.26, s * 0.06);
  ctx.lineTo(-w * 0.34, -s * 0.16);
  ctx.lineTo(0, -s * 0.28);
  ctx.lineTo(w * 0.34, -s * 0.16);
  ctx.lineTo(w * 0.26, s * 0.06);
  ctx.closePath();
  ctx.fill();
  // handlebar
  ctx.beginPath();
  ctx.moveTo(-w * 0.6, -s * 0.2);
  ctx.lineTo(w * 0.6, -s * 0.2);
  ctx.stroke();
  // helmet
  ctx.beginPath();
  ctx.arc(0, -s * 0.4, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

/** Static dial: faint arc with ticks every 15°, centred at (0,0), radius `r`. */
export function drawDial(ctx: Ctx2D, r: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OVERLAY_COLORS.dim;
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  for (let deg = -OVERLAY_MAX_LEAN; deg <= OVERLAY_MAX_LEAN; deg += 15) {
    const a = Math.PI * 1.5 + (deg / OVERLAY_MAX_LEAN) * Math.PI * 0.35;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
    ctx.lineTo(Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0);
    ctx.stroke();
  }
}

/** Needle pointing up from (0,0): rotates with the lean over the dial. */
export function drawNeedle(ctx: Ctx2D, r: number): void {
  ctx.strokeStyle = OVERLAY_COLORS.accent;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.55);
  ctx.lineTo(0, -r * 0.98);
  ctx.stroke();
}

/** lean angle → needle/bike rotation in radians (dashboard maps ±60° onto the dial's ±63°) */
export function leanToRad(leanDeg: number, style: OverlayStyle): number {
  const lean = Math.max(-OVERLAY_MAX_LEAN, Math.min(OVERLAY_MAX_LEAN, leanDeg));
  return style === 'dashboard'
    ? (lean / OVERLAY_MAX_LEAN) * Math.PI * 0.35
    : (lean * Math.PI) / 180;
}

/** One frame of the whole overlay (preview). `sample` may be null (no data → 0). */
export function drawOverlayFrame(
  ctx: Ctx2D,
  spec: OverlaySpec,
  layout: OverlayLayout,
  sample: Sample | null,
): void {
  const lean = sample?.leanDeg ?? 0;
  const aLon = sample?.aLonG ?? 0;
  const L = layout;
  ctx.save();
  if (spec.style === 'dashboard') {
    ctx.save();
    ctx.translate(L.cx, L.cy);
    drawDial(ctx, L.r);
    ctx.rotate(leanToRad(lean, spec.style));
    drawNeedle(ctx, L.r);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(L.cx, L.cy);
  ctx.rotate(leanToRad(lean, 'minimal'));
  drawBike(ctx, L.sprite * (spec.style === 'dashboard' ? 0.72 : 0.72));
  ctx.restore();
  ctx.fillStyle = OVERLAY_COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${L.numPx}px ${FONT}`;
  ctx.fillText(`${Math.round(Math.abs(lean))}°`, L.cx, L.numY);
  if (L.bar) {
    const b = L.bar;
    ctx.fillStyle = OVERLAY_COLORS.dim;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const f = barFill(aLon, b);
    ctx.fillStyle = f.brake ? OVERLAY_COLORS.brake : OVERLAY_COLORS.accent;
    ctx.fillRect(b.x, f.y, b.w, f.h);
    ctx.fillStyle = OVERLAY_COLORS.white;
    ctx.fillRect(b.x - b.w * 0.2, b.y + b.h / 2 - 1, b.w * 1.4, 2);
  }
  ctx.restore();
}

/** The dynamic fill of the g bar: from the middle up for acceleration, down for braking. */
export function barFill(
  aLonG: number,
  bar: { y: number; h: number },
): { y: number; h: number; brake: boolean } {
  const mid = bar.y + bar.h / 2;
  const frac = Math.max(-1, Math.min(1, aLonG / OVERLAY_MAX_G));
  const len = Math.max(1, Math.round(Math.abs(frac) * (bar.h / 2)));
  return { y: Math.round(frac < 0 ? mid : mid - len), h: len, brake: frac < 0 };
}

/**
 * Samples for a part at the export frame rate: nearest 30 Hz value per frame, from the stored
 * signals (`t` seconds from the start of the video).
 */
export function resample(
  imuT: ArrayLike<number>,
  lean: ArrayLike<number>,
  aLon: ArrayLike<number>,
  startS: number,
  endS: number,
  fps: number,
): Sample[] {
  const out: Sample[] = [];
  const n = Math.max(1, Math.round((endS - startS) * fps));
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = startS + k / fps;
    while (j + 1 < imuT.length && imuT[j + 1] <= t) j++;
    out.push({ leanDeg: lean[j] ?? 0, aLonG: aLon[j] ?? 0 });
  }
  return out;
}

/**
 * The ffmpeg `sendcmd` file for one part: per frame the bike/needle angle, the number text and the
 * g-bar geometry. Filter instances are addressed by name: rotate@bike, rotate@needle, drawtext@num,
 * drawbox@bar. Only emits a line when a value changed, so still moments cost nothing.
 */
export function overlayCommands(
  samples: Sample[],
  fps: number,
  spec: OverlaySpec,
  layout: OverlayLayout,
): string {
  const lines: string[] = [];
  let lastBike = NaN;
  let lastNeedle = NaN;
  let lastNum = '';
  let lastBar = '';
  samples.forEach((s, k) => {
    const t = (k / fps).toFixed(4);
    const bike = Math.round(leanToRad(s.leanDeg, 'minimal') * 1000) / 1000;
    if (bike !== lastBike) {
      lines.push(`${t} rotate@bike a ${bike};`);
      lastBike = bike;
    }
    if (spec.style === 'dashboard') {
      const needle = Math.round(leanToRad(s.leanDeg, 'dashboard') * 1000) / 1000;
      if (needle !== lastNeedle) {
        lines.push(`${t} rotate@needle a ${needle};`);
        lastNeedle = needle;
      }
    }
    const num = `${Math.round(Math.abs(s.leanDeg))}°`;
    if (num !== lastNum) {
      lines.push(`${t} drawtext@num reinit text=${num};`);
      lastNum = num;
    }
    if (layout.bar) {
      const f = barFill(s.aLonG, layout.bar);
      const bar = `${f.y}:${f.h}:${f.brake ? 1 : 0}`;
      if (bar !== lastBar) {
        lines.push(
          `${t} drawbox@bar y ${f.y}, drawbox@bar h ${f.h}, drawbox@bar color ${f.brake ? OVERLAY_COLORS.brakeFf : OVERLAY_COLORS.accentFf};`,
        );
        lastBar = bar;
      }
    }
  });
  return lines.join('\n') + '\n';
}
