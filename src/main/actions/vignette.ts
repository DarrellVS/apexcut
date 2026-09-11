/**
 * Dark edges for the export: ffmpeg's `vignette` filter is 8-bit only, so the edges are a PNG mask
 * (transparent centre, black corners) drawn once per size and strength and overlaid on the 10-bit
 * picture. The gradient is the same as the preview's CSS `radial-gradient` (clear to 45 % of the
 * corner distance, then darkening to `strength` at the corners).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runFfmpeg } from '../services/media';

const pending = new Map<string, Promise<string>>();

export class VignetteMaskAction {
  /** path of the mask PNG for this size and strength (0…1), made on first use */
  execute(width: number, height: number, strength: number, tmp: string): Promise<string> {
    const s = Math.round(strength * 1000) / 1000;
    const dst = join(tmp, `vignette_${width}x${height}_${s}.png`);
    const hit = pending.get(dst);
    if (hit) return hit;
    const p = (async (): Promise<string> => {
      if (existsSync(dst)) return dst;
      mkdirSync(dirname(dst), { recursive: true });
      // alpha = strength · clip((r − 0.45) / 0.55) with r the distance to the centre, 1 at the corners
      const r = `hypot((X-W/2)/(W/2),(Y-H/2)/(H/2))/sqrt(2)`;
      const a = `255*${s}*clip((${r}-0.45)/0.55,0,1)`;
      await runFfmpeg(
        [
          '-f',
          'lavfi',
          '-i',
          `color=c=black:s=${width}x${height}:r=1,format=rgba`,
          '-vf',
          `geq=r=0:g=0:b=0:a='${a}'`,
          '-frames:v',
          '1',
          dst,
        ],
        {},
      );
      return dst;
    })();
    pending.set(dst, p);
    p.catch(() => pending.delete(dst));
    return p;
  }
}
