/**
 * Telemetry overlay in the export: the gauge is composed by ffmpeg from three sprites the renderer
 * drew (bike, dial, needle — PNG with alpha) plus drawtext/drawbox, all driven per frame by a
 * `sendcmd` file that core/overlay.ts generates from the 30 Hz signals. Runs inside the encode of
 * each part, so it costs no extra pass.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  overlayCommands,
  overlayLayout,
  type OverlayLayout,
  type OverlaySpec,
  type Sample,
} from '@core/overlay';
import { cardFont } from './fonts';

export interface OverlaySprites {
  bike: string;
  dial: string;
  needle: string;
}

export interface OverlayJob {
  spec: OverlaySpec;
  /** PNG files on disk (written once per export from the renderer's data URLs) */
  sprites: OverlaySprites;
  /** per-frame data of this part at the export fps */
  samples: Sample[];
  fps: number;
}

const optPath = (p: string): string => p.replace(/\\/g, '/').replace(/:/g, '\\:');

/**
 * Filter-graph pieces for one part. `base` is the label of the cropped video ("[base]"); the
 * result is written to "[v]". Extra inputs must be appended to the ffmpeg command in this order.
 */
export function overlayGraph(
  job: OverlayJob,
  width: number,
  height: number,
  firstInputIndex: number,
  tmp: string,
  partName: string,
): { inputs: string[]; graph: string; layout: OverlayLayout } {
  const L = overlayLayout(job.spec, width, height);
  const cmdFile = join(tmp, `${partName}.cmd`);
  writeFileSync(cmdFile, overlayCommands(job.samples, job.fps, job.spec, L), 'utf8');
  const font = cardFont();
  const fontOpt = font ? `fontfile='${optPath(font)}':` : '';
  const i = firstInputIndex;
  const dash = job.spec.style === 'dashboard';
  const inputs = ['-loop', '1', '-i', job.sprites.bike];
  if (dash)
    inputs.push('-loop', '1', '-i', job.sprites.dial, '-loop', '1', '-i', job.sprites.needle);
  const s = L.sprite;
  const half = Math.round(s / 2);
  const steps: string[] = [];
  // the command stream is attached to the video before anything it drives
  steps.push(`[base]sendcmd=f='${optPath(cmdFile)}'[b0]`);
  let cur = 'b0';
  let n = 1;
  const over = (sprite: string, x: number, y: number): void => {
    const out = `b${n++}`;
    // shortest=1: the looped sprite never decides the length, the video does
    steps.push(`[${cur}][${sprite}]overlay=x=${x}:y=${y}:format=auto:shortest=1[${out}]`);
    cur = out;
  };
  if (dash) {
    const d = Math.round(L.r * 2.4);
    steps.push(`[${i + 1}:v]scale=${d}:${d}[dial]`);
    over('dial', Math.round(L.cx - d / 2), Math.round(L.cy - d / 2));
  }
  steps.push(`[${i}:v]scale=${s}:${s},rotate@bike=a=0:c=none:ow=${s}:oh=${s}[bike]`);
  over('bike', Math.round(L.cx - half), Math.round(L.cy - half));
  if (dash) {
    const d = Math.round(L.r * 2.4);
    steps.push(`[${i + 2}:v]scale=${d}:${d},rotate@needle=a=0:c=none:ow=${d}:oh=${d}[needle]`);
    over('needle', Math.round(L.cx - d / 2), Math.round(L.cy - d / 2));
  }
  const text = (name: string, t: string, size: number, y: number, alpha: number): void => {
    const out = `b${n++}`;
    steps.push(
      `[${cur}]drawtext@${name}=${fontOpt}text='${t}':fontsize=${size}:fontcolor=white@${alpha}:x=${Math.round(L.cx)}-text_w/2:y=${y}-text_h[${out}]`,
    );
    cur = out;
  };
  text('num', '0°', L.numPx, L.numY, 0.92);
  if (L.bar) {
    const b = L.bar;
    const box = (name: string, x: number, y: number, w: number, h: number, color: string): void => {
      const out = `b${n++}`;
      steps.push(
        `[${cur}]drawbox@${name}=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=fill[${out}]`,
      );
      cur = out;
    };
    box('track', b.x, b.y, b.w, b.h, '0xffffff@0.3');
    box('bar', b.x, Math.round(b.y + b.h / 2), b.w, 1, '0xff7a3d@0.9');
    box(
      'mid',
      Math.round(b.x - b.w * 0.2),
      Math.round(b.y + b.h / 2) - 1,
      Math.round(b.w * 1.4),
      2,
      'white@0.9',
    );
  }
  steps.push(`[${cur}]null[v]`);
  return { inputs, graph: steps.join(';'), layout: L };
}
