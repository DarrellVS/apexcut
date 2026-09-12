/**
 * What the quality rules need from the file itself: one ffprobe per source (cached, a movie cuts a
 * dozen parts out of the same file) and the encoder the machine actually has.
 */
import type { ExportFormat } from '@shared/ipc';
import { encoders, probe, type ProbeResult } from '../../services/media';
import { encoderArgs, targetKbps } from './quality';

const probeCache = new Map<string, Promise<ProbeResult>>();
export function probeCached(src: string): Promise<ProbeResult> {
  let p = probeCache.get(src);
  if (!p) {
    p = probe(src);
    probeCache.set(src, p);
  }
  return p;
}

/** Encoder settings for a source: same rules everywhere so clips from one source concatenate cleanly. */
export async function videoArgsFor(
  src: string,
  format: ExportFormat,
  quality: number,
): Promise<{ args: string[]; enc: string; info: ProbeResult }> {
  const info = await probeCached(src);
  const enc = (await encoders()).hevcEncoder;
  return { args: encoderArgs(enc, quality, info.tenBit, targetKbps(info, format)), enc, info };
}
