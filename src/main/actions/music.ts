/**
 * Music under the movie: songs back to back (each trimmed, with its own gain and fades), cut at the
 * movie's end with a short fade, laid over the original audio at a lower level. One ffmpeg pass on
 * the finished movie: video is copied, only the audio is re-mixed.
 */
import { existsSync } from 'node:fs';
import type { MusicSettings } from '@shared/ipc';
import { probe, runFfmpeg } from '../services/media';
import type { JobContext } from '../services/jobs';

const END_FADE_S = 1.5;

export class MusicMixAction {
  /** Returns the paths of songs that were skipped because their file is gone. */
  async execute(
    movie: string,
    music: MusicSettings,
    dst: string,
    ctx: JobContext,
  ): Promise<{ skipped: string[] }> {
    const tracks = music.tracks.filter((t) => t.outS > t.inS);
    const present = tracks.filter((t) => existsSync(t.path));
    const skipped = tracks.filter((t) => !existsSync(t.path)).map((t) => t.path);
    if (!present.length) throw new Error('no music files');
    const info = await probe(movie);
    const movieLen = info.duration;
    const args: string[] = ['-i', movie];
    for (const t of present) args.push('-i', t.path);
    const parts: string[] = [];
    const labels: string[] = [];
    present.forEach((t, k) => {
      const dur = t.outS - t.inS;
      const fin = Math.min(t.fadeInS, dur / 2);
      const fout = Math.min(t.fadeOutS, dur / 2);
      parts.push(
        `[${k + 1}:a]atrim=start=${t.inS.toFixed(3)}:end=${t.outS.toFixed(3)},asetpts=PTS-STARTPTS,` +
          `aformat=sample_rates=48000:channel_layouts=stereo,volume=${t.gain.toFixed(3)}` +
          (fin > 0 ? `,afade=t=in:st=0:d=${fin.toFixed(2)}` : '') +
          (fout > 0 ? `,afade=t=out:st=${(dur - fout).toFixed(3)}:d=${fout.toFixed(2)}` : '') +
          `[m${k}]`,
      );
      labels.push(`[m${k}]`);
    });
    const joined =
      present.length > 1
        ? `${labels.join('')}concat=n=${present.length}:v=0:a=1[mus]`
        : `${labels[0]}anull[mus]`;
    const endFade = Math.max(0, movieLen - END_FADE_S);
    const graph = [
      ...parts,
      joined,
      // never longer than the movie, and out gently at the end
      `[mus]atrim=0:${movieLen.toFixed(3)},afade=t=out:st=${endFade.toFixed(3)}:d=${END_FADE_S},volume=${music.musicGain.toFixed(3)}[musx]`,
      `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${music.originalGain.toFixed(3)}[orig]`,
      `[orig][musx]amix=inputs=2:duration=first:normalize=0[a]`,
    ].join(';');
    args.push(
      '-filter_complex',
      graph,
      '-map',
      '0:v:0',
      '-map',
      '[a]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-movflags',
      '+faststart',
      dst,
    );
    await runFfmpeg(args, { signal: ctx.signal, durationS: movieLen });
    return { skipped };
  }
}
