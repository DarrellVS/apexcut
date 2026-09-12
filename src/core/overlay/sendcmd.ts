/**
 * The overlay in the export: the 30 Hz signals resampled to the video's frame rate, and the
 * `sendcmd` stream that drives ffmpeg's rotate/drawtext/drawbox filters frame by frame — the same
 * numbers the preview draws with.
 */
import type { OverlayLayout, OverlaySpec, Sample } from './spec';
import { barFill, leanToRad, OVERLAY_COLORS } from './draw';

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
