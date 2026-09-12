/**
 * Cutting and joining video with ffmpeg.
 *
 *   types.ts    what a cut is, and the two transition lengths
 *   quality.ts  the quality rules as pure functions: crop, output size, encoder arguments, bitrate
 *   encode.ts   what those rules need from the file: the cached ffprobe and the machine's encoder
 *   plan.ts     every ffmpeg argument for one part (pure, unit-tested)
 *   segment.ts  the action that runs that plan, with the mask and overlay it needs
 *   join.ts     concat, lossless trim, crossfade clip, crossfaded audio
 *   batch.ts    a list of parts: what a transition asks of each, and running them
 *   compile.ts  the finished movie, with the music on top
 *
 * See docs/architecture.md → Export for why each transition works the way it does.
 */
export { cropFilter, encoderArgs, outputSize, targetKbps } from './quality';
export { probeCached, videoArgsFor } from './encode';
export {
  gradeOf,
  needsEncode,
  planCopy,
  planEncode,
  planSegment,
  type OverlayGraph,
  type SegmentPlan,
} from './plan';
export { CutSegmentAction } from './segment';
export { AudioCrossfadeAction, ConcatAction, TrimCopyAction, XfadeAction } from './join';
export { cutAll, prepareItems } from './batch';
export { compileMovie, fileSizeMb } from './compile';
export { DIP_S, PARALLEL_CUTS, XFADE_S, type CutInput, type CutItem } from './types';
