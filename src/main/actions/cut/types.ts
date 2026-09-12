/**
 * What one cut is: a window of a source file, how it should be framed, coloured and faded, and what
 * it is called. `CutInput` is one cut with its destination; `CutItem` is the same thing before the
 * output folder is known.
 */
import { DIP_S, XFADE_S, type ExportFormat } from '@shared/ipc';
import type { Grade } from '@core/grade';
import type { OverlayJob } from '../overlay';

// the lengths live in the IPC contract: the Movie panel predicts the movie's length with them
export { DIP_S, XFADE_S };
/** how many re-encodes run at once; each 4K HEVC decode holds ~4 GB RAM */
export const PARALLEL_CUTS = 2;

export interface CutInput {
  src: string;
  startS: number;
  endS: number;
  dst: string;
  format: ExportFormat;
  framePos: number;
  fade: number;
  quality?: number;
  /** re-encode even for the square format (needed for dip and crossfade) */
  encode?: boolean;
  /** force keyframes at these times (seconds from the part start) so the part can be cut losslessly there */
  keyframesAt?: number[];
  /** telemetry overlay for this part (forces an encode) */
  overlay?: OverlayJob;
  /** colours for this part (forces an encode); neutral or missing = as recorded */
  grade?: Grade;
  /** vertical only: where the crop window sits per frame (0..1), and at which frame rate */
  follow?: { pos: number[]; fps: number };
}

export interface CutItem extends Omit<CutInput, 'dst'> {
  name: string;
}
