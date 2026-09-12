/**
 * One loudness for every movie. Riders watch one clip after another, and a quiet ride followed by a
 * loud one is the first thing anyone complains about; platforms turn the volume down on what is too
 * loud anyway. `loudnorm` at −14 LUFS (the level YouTube, Instagram and Spotify settle on) with a
 * −1.5 dBTP ceiling evens the whole movie out in one pass: the picture is copied, only the sound is
 * written again. Off unless the rider asks for it.
 */
import { probe, runFfmpeg } from '../services/media';
import type { JobContext } from '../services/jobs';

export const LOUDNESS_TARGET = { i: -14, tp: -1.5, lra: 11 };

export class LoudnessAction {
  /**
   * Writes an evened-out copy of `src` to `dst` and returns it. A movie without sound is handed
   * back untouched (there is nothing to even out).
   */
  async execute(src: string, dst: string, ctx: JobContext): Promise<string> {
    const info = await probe(src);
    if (!info.streams.some((s) => s.codec_type === 'audio')) return src;
    const { i, tp, lra } = LOUDNESS_TARGET;
    await runFfmpeg(
      [
        '-i',
        src,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-c:v',
        'copy',
        '-af',
        `loudnorm=I=${i}:TP=${tp}:LRA=${lra}`,
        '-c:a',
        'aac',
        '-b:a',
        '256k',
        '-movflags',
        '+faststart',
        dst,
      ],
      { signal: ctx.signal, durationS: info.duration },
    );
    return dst;
  }
}
