/**
 * The three overlay sprites (bike, dial, needle) as PNG data URLs, drawn with the same core code the
 * preview uses, at the size the export needs. ffmpeg rotates and composes them (main/actions/overlay.ts).
 */
import {
  drawBike,
  drawDial,
  drawNeedle,
  overlayLayout,
  type Ctx2D,
  type OverlaySpec,
} from '@core/overlay';

function sprite(side: number, draw: (ctx: Ctx2D) => void): string {
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.translate(side / 2, side / 2);
  draw(ctx as unknown as Ctx2D);
  return c.toDataURL('image/png');
}

export function renderOverlaySprites(
  spec: OverlaySpec,
  width: number,
  height: number,
): { bike: string; dial: string; needle: string } {
  const L = overlayLayout(spec, width, height);
  const dialSide = Math.round(L.r * 2.4);
  return {
    bike: sprite(L.sprite, (ctx) => drawBike(ctx, L.sprite * 0.72)),
    dial: sprite(dialSide, (ctx) => drawDial(ctx, L.r)),
    needle: sprite(dialSide, (ctx) => drawNeedle(ctx, L.r)),
  };
}
