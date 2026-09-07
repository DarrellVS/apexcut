/**
 * The ride card: a shareable PNG with the numbers of a project, drawn on a canvas in the brand style.
 * Two sizes: portrait 1080×1350 (Instagram) and landscape 1200×630 (link previews, WhatsApp).
 */
import type { RideStats } from '@shared/ipc';
import { fmtDuration, fmtTime } from './format';

export type CardVariant = 'portrait' | 'landscape';
export const CARD_SIZE: Record<CardVariant, { w: number; h: number }> = {
  portrait: { w: 1080, h: 1350 },
  landscape: { w: 1200, h: 630 },
};

const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** cover-fit an image into a rounded rectangle */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function dayLabel(day: string | null): string {
  if (!day) return '';
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function renderRideCard(
  stats: RideStats,
  thumbs: string[],
  variant: CardVariant,
  dark = true,
): Promise<string> {
  const { w, h } = CARD_SIZE[variant];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const portrait = variant === 'portrait';
  const pad = Math.round(Math.min(w, h) * (portrait ? 0.06 : 0.07));
  const gap = Math.round(w * 0.02);

  // background: dark or light ground with the brand gradient glowing from a corner
  ctx.fillStyle = dark ? '#0d0d14' : '#f4f2fa';
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(
    w * 0.85,
    h * 0.1,
    0,
    w * 0.85,
    h * 0.1,
    Math.max(w, h) * 0.9,
  );
  glow.addColorStop(0, dark ? 'rgba(255,61,129,0.55)' : 'rgba(255,61,129,0.35)');
  glow.addColorStop(0.5, dark ? 'rgba(255,122,61,0.18)' : 'rgba(255,122,61,0.15)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const fg = dark ? '#eeeef3' : '#15161c';
  const muted = dark ? 'rgba(238,238,243,0.62)' : 'rgba(21,22,28,0.6)';

  // header: mark + name + date
  const mark = Math.round(portrait ? w * 0.055 : h * 0.07);
  const g = ctx.createLinearGradient(pad, pad, pad + mark, pad + mark);
  g.addColorStop(0, '#ff7a3d');
  g.addColorStop(1, '#ff3d81');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(pad, pad, mark, mark, mark * 0.3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(mark * 0.6)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', pad + mark / 2, pad + mark / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fg;
  const titlePx = Math.round(portrait ? w * 0.075 : h * 0.085);
  ctx.font = `800 ${titlePx}px ${FONT}`;
  let name = stats.name;
  while (ctx.measureText(name).width > w - 2 * pad && name.length > 4) {
    name = `${name.slice(0, -2)}…`;
  }
  const titleY = pad + mark + Math.round(titlePx * 1.1);
  ctx.fillText(name, pad, titleY);
  const subPx = Math.round(titlePx * 0.4);
  ctx.fillStyle = muted;
  ctx.font = `500 ${subPx}px ${FONT}`;
  const sub = [dayLabel(stats.day), `${stats.nVideos} video${stats.nVideos === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' · ');
  const subY = titleY + Math.round(subPx * 1.35);
  ctx.fillText(sub, pad, subY);

  // vertical budget: header ─ thumbnails ─ tiles ─ footer, everything inside the padding
  const footPx = Math.round(portrait ? w * 0.022 : h * 0.036);
  const footerY = h - pad;
  const tilesBottom = footerY - footPx - gap * 1.5;
  const imgs = (await Promise.all(thumbs.map(loadImage))).filter((i): i is HTMLImageElement => !!i);
  const thumbTop = subY + gap * 1.5;
  const cols = Math.max(1, imgs.length);
  const tw = (w - 2 * pad - gap * (cols - 1)) / cols;
  // tiles have a comfortable height; whatever is left goes to the thumbnails (they are the eye-catcher)
  const tcols = portrait ? 2 : 4;
  const rows = 4 / tcols;
  const tileCap = Math.round(portrait ? h * 0.17 : h * 0.22);
  const tilesSpace = rows * tileCap + gap * (rows - 1);
  const thumbH = imgs.length
    ? Math.round(
        Math.min(portrait ? tw * 0.95 : h * 0.3, tilesBottom - thumbTop - gap * 1.5 - tilesSpace),
      )
    : 0;
  imgs.forEach((img, i) => drawCover(ctx, img, pad + i * (tw + gap), thumbTop, tw, thumbH, 22));
  const statsTop = thumbTop + thumbH + (imgs.length ? gap * 1.5 : 0);

  // stat tiles: 2×2 (portrait) or 4×1 (landscape), filling the space that is left
  const tiles: [string, string][] = [
    [`${stats.maxLeanDeg}°`, 'sharpest lean'],
    [`${stats.maxBrakeG.toFixed(2)} g`, 'hardest braking'],
    [`${stats.nCorners}`, `corner${stats.nCorners === 1 ? '' : 's'}`],
    [fmtDuration(stats.movieS), 'of pure riding'],
  ];
  const tileW = (w - 2 * pad - gap * (tcols - 1)) / tcols;
  const tileH = Math.floor((tilesBottom - statsTop - gap * (rows - 1)) / rows);
  const inset = Math.round(tileW * 0.09);
  // one font size for all big numbers: the largest that fits the widest one and the tile height
  let bigPx = Math.round(Math.min(tileH * 0.4, tileW * 0.3));
  ctx.font = `800 ${bigPx}px ${FONT}`;
  const widest = Math.max(...tiles.map(([big]) => ctx.measureText(big).width));
  if (widest > tileW - 2 * inset) bigPx = Math.floor((bigPx * (tileW - 2 * inset)) / widest);
  const smallPx = Math.round(Math.max(14, Math.min(bigPx * 0.42, tileW * 0.09)));
  tiles.forEach(([big, small], i) => {
    const x = pad + (i % tcols) * (tileW + gap);
    const y = statsTop + Math.floor(i / tcols) * (tileH + gap);
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    ctx.roundRect(x, y, tileW, tileH, Math.min(22, tileH * 0.16));
    ctx.fill();
    // number + label as one block, centred vertically in the tile
    const blockH = bigPx + smallPx * 1.6;
    const top = y + (tileH - blockH) / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = fg;
    ctx.font = `800 ${bigPx}px ${FONT}`;
    ctx.fillText(big, x + inset, top + bigPx * 0.82);
    ctx.fillStyle = muted;
    ctx.font = `500 ${smallPx}px ${FONT}`;
    ctx.fillText(small, x + inset, top + bigPx + smallPx * 1.25);
  });

  // footer line: twistiest minute + made with
  ctx.fillStyle = muted;
  ctx.font = `500 ${footPx}px ${FONT}`;
  ctx.textAlign = 'left';
  if (stats.twistyStem && stats.twistyPct) {
    ctx.fillText(
      `Twistiest minute at ${fmtTime(stats.twistyT)} · leaning ${stats.twistyPct}% of the time`,
      pad,
      footerY,
    );
  }
  ctx.textAlign = 'right';
  ctx.fillText('Made with ApexCut', w - pad, footerY);
  return c.toDataURL('image/png');
}
