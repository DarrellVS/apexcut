/**
 * What a telemetry overlay is: the styles, corners and sizes a rider can pick, the samples it is
 * driven by, and where every piece of it lands in a frame of a given size.
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
