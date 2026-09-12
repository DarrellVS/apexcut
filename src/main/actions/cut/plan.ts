/**
 * Every ffmpeg argument for one part of the movie, as pure functions.
 *
 * The square format without fades, colours or an overlay is a stream copy (lossless; the cut snaps
 * to the keyframe before the start). Everything else is re-encoded at full resolution under the
 * rules in `quality.ts`. Keeping this side free of ffmpeg and the file system means the whole
 * argument list can be tested without touching a video (tests/main/cutPlan.test.ts).
 */
import { ffmpegGrade, isNeutral, type Grade } from '@core/grade';
import type { ProbeResult } from '../../services/media';
import { cropFilter } from './quality';
import type { CutInput } from './types';

/** the filter-graph pieces of a telemetry overlay, already written to disk */
export interface OverlayGraph {
  inputs: string[];
  graph: string;
}

export interface SegmentPlan {
  args: string[];
  /** a stream copy: no encoder involved, nothing to fall back from */
  copy: boolean;
  durationS: number;
}

/** the colours of this cut, or null when it is “as recorded” */
export const gradeOf = (input: Pick<CutInput, 'grade'>): Grade | null =>
  input.grade && !isNeutral(input.grade) ? input.grade : null;

/** Does this cut have to be re-encoded, or can the stream be copied as it is? */
export const needsEncode = (input: CutInput): boolean =>
  input.format !== 'original' || !!input.encode || !!input.overlay || !!gradeOf(input);

const durationOf = (input: CutInput): number => Math.max(0.1, input.endS - input.startS);
const windowArgs = (input: CutInput): string[] => [
  '-ss',
  input.startS.toFixed(3),
  '-to',
  input.endS.toFixed(3),
  '-i',
  input.src,
];

/** The square format without fades, colours or an overlay: copy the streams, touch no pixel. */
export function planCopy(input: CutInput): SegmentPlan {
  return {
    copy: true,
    durationS: durationOf(input),
    args: [
      ...windowArgs(input),
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      input.dst,
    ],
  };
}

/**
 * Every ffmpeg argument for a cut that is re-encoded. Pure: the caller has already probed the
 * source, chosen the encoder arguments, drawn the dark-edges mask and written the overlay's
 * command file.
 */
export function planEncode(
  input: CutInput,
  info: ProbeResult,
  encArgs: string[],
  extras: { mask?: string | null; overlay?: OverlayGraph | null } = {},
): SegmentPlan {
  const durationS = durationOf(input);
  const window = windowArgs(input);
  const common = [...window, '-map', '0:v:0', '-map', '0:a:0?'];
  const grade = gradeOf(input);
  const vf: string[] = [];
  const crop = cropFilter(input.format, info.width, info.height, input.framePos);
  if (crop) vf.push(crop);
  // colours before the fade, so the fade still ends in real black
  if (grade) vf.push(...ffmpegGrade(grade));
  const fading = input.fade > 0 && durationS > 2 * input.fade;
  const fade = input.fade.toFixed(2);
  const fadeOutAt = (durationS - input.fade).toFixed(2);
  if (fading) vf.push(`fade=t=in:st=0:d=${fade},fade=t=out:st=${fadeOutAt}:d=${fade}`);

  const mask = extras.mask ?? null;
  const overlay = extras.overlay ?? null;
  let args: string[];
  if (overlay || mask) {
    // the crop/grade/fade chain ends in [pre]; the mask (if any) and the telemetry overlay
    // continue from there to [v]
    const extraInputs: string[] = [];
    const steps: string[] = [];
    let nextInput = 1;
    let cur = 'pre';
    if (mask) {
      extraInputs.push('-loop', '1', '-i', mask);
      const out = overlay ? 'base' : 'v';
      // format=yuv420p10: keeps the picture 10-bit (auto would go through 8-bit yuva444p)
      steps.push(`[${cur}][${nextInput}:v]overlay=format=yuv420p10:shortest=1[${out}]`);
      cur = out;
      nextInput++;
    }
    if (overlay) {
      if (cur !== 'base') steps.push(`[${cur}]null[base]`);
      extraInputs.push(...overlay.inputs);
      steps.push(overlay.graph);
    }
    const pre = vf.length ? `[0:v]${vf.join(',')}[pre]` : `[0:v]null[pre]`;
    args = [
      ...window,
      ...extraInputs,
      '-filter_complex',
      [pre, ...steps].join(';'),
      '-map',
      '[v]',
      '-map',
      '0:a:0?',
    ];
  } else {
    args = [...common];
    if (vf.length) args.push('-vf', vf.join(','));
  }
  if (fading) {
    args.push('-af', `afade=t=in:st=0:d=${fade},afade=t=out:st=${fadeOutAt}:d=${fade}`);
  }
  if (input.keyframesAt?.length) {
    args.push('-force_key_frames', input.keyframesAt.map((t) => t.toFixed(3)).join(','));
  }
  args.push(...encArgs, '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', input.dst);
  return { args, copy: false, durationS };
}

/** Whichever of the two plans this cut needs. */
export function planSegment(
  input: CutInput,
  info: ProbeResult,
  encArgs: string[],
  extras: { mask?: string | null; overlay?: OverlayGraph | null } = {},
): SegmentPlan {
  return needsEncode(input) ? planEncode(input, info, encArgs, extras) : planCopy(input);
}
