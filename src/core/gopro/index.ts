/**
 * GoPro recordings: the `gpmd` track parsed (`gpmf.ts`) and fused into the frames the rest of the
 * app works with (`attitude.ts`). The entry point mirrors `core/dji`: raw track in, header and
 * frames out.
 */
import type { FrameMeta } from '../frames';
import { goproFrames, NoMotionData } from './attitude';
import { parseGpmf } from './gpmf';

export * from './gpmf';
export * from './attitude';

export interface GoproHeader {
  /** the camera as it names itself, e.g. "Hero8 Black" */
  model: string;
  /** how many payloads the track holds (one per second of recording, give or take) */
  payloads: number;
}

export interface GoproResult {
  header: GoproHeader;
  frames: FrameMeta;
}

/** Does this look like a GoPro metadata track? */
export function isGpmf(raw: Uint8Array): boolean {
  return (
    raw.length > 8 && String.fromCharCode(raw[0], raw[1], raw[2], raw[3]) === 'DEVC' && raw[4] === 0
  );
}

export function parseGopro(raw: Uint8Array, durationS: number): GoproResult {
  const payloads = parseGpmf(raw);
  if (!payloads.length) throw new NoMotionData('This video has no GoPro metadata track.');
  const model = payloads.find((p) => p.device)?.device ?? 'GoPro';
  return {
    header: { model, payloads: payloads.length },
    frames: goproFrames(payloads, durationS),
  };
}
