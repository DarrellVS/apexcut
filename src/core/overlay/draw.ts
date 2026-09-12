/**
 * Drawing the overlay. The canvas calls are a small subset (`Ctx2D`) so the same code draws the
 * live preview in the renderer and the sprites the export hands to ffmpeg. Colours are fixed here
 * rather than taken from the theme: this lands on the video, not on the interface.
 */
import {
  OVERLAY_MAX_G,
  OVERLAY_MAX_LEAN,
  type OverlayLayout,
  type OverlaySpec,
  type OverlayStyle,
  type Sample,
} from './spec';

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
