/**
 * One movie out of the cut parts.
 *
 * cut        the parts as they are (square stays a lossless copy)
 * dip        every part fades in and out over 0.4 s (square is re-encoded for that)
 * crossfade  the parts are encoded with forced keyframes 0.5 s from each end; the tail of one part
 *            and the head of the next are blended with `xfade` into a short clip; the middles are
 *            cut out losslessly at those keyframes; one audio track is built with `acrossfade`;
 *            middles + transitions are concatenated and muxed with that audio.
 *
 * The music mix (if any) goes on top of the finished picture, audio only.
 */
import { mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { MusicSettings, Transition } from '@shared/ipc';
import { runFfmpeg } from '../../services/media';
import type { JobContext } from '../../services/jobs';
import { MusicMixAction } from '../music';
import { cutAll, prepareItems } from './batch';
import { videoArgsFor } from './encode';
import { AudioCrossfadeAction, ConcatAction, TrimCopyAction, XfadeAction } from './join';
import { XFADE_S, type CutItem } from './types';

const numbered = (dir: string, prefix: string, k: number): string =>
  join(dir, `${prefix}_${String(k).padStart(3, '0')}.mp4`);

export async function compileMovie(
  items: CutItem[],
  outPath: string,
  ctx: JobContext,
  transition: Transition = 'crossfade',
  music?: MusicSettings,
): Promise<string> {
  const tmp = mkdtempSync(join(outPath, '..', 'apexcut-'));
  const withMusic = !!music && music.tracks.some((t) => t.outS > t.inS);
  // encoder settings shared by the crossfade clips
  const { args: encArgs } = await videoArgsFor(
    items[0].src,
    items[0].format,
    items[0].quality ?? 18,
  );
  const finish = async (movie: string): Promise<string> => {
    const carded = withMusic ? join(tmp, 'carded.mp4') : outPath;
    renameSync(movie, carded);
    if (withMusic && music) {
      ctx.progress(0.99, 'Adding the music');
      try {
        const { skipped } = await new MusicMixAction().execute(carded, music, outPath, ctx);
        for (const p of skipped) ctx.log(`music file missing, skipped: ${p}`);
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        ctx.log(
          `music mix failed, movie kept without music: ${(e as Error).message.slice(0, 200)}`,
        );
        renameSync(carded, outPath);
      }
    }
    return outPath;
  };
  try {
    const prepared = prepareItems(items, transition).map((it, k) => ({
      ...it,
      name: `part_${String(k).padStart(3, '0')}.mp4`,
    }));
    const crossfading = transition === 'crossfade' && prepared.length > 1;
    const parts = await cutAll(prepared, tmp, ctx, crossfading ? [0, 0.8] : [0, 0.95]);
    if (parts.length === 1) return await finish(parts[0]);
    if (!crossfading) {
      ctx.progress(0.97, 'Joining everything');
      const joined = join(tmp, 'movie.mp4');
      await new ConcatAction().execute(parts, joined, ctx);
      return await finish(joined);
    }
    // crossfade: transition clips between neighbours, lossless middles, one crossfaded audio track
    const d = XFADE_S;
    const sequence: string[] = [];
    for (let k = 0; k < parts.length; k++) {
      if (ctx.signal.aborted) throw new Error('cancelled');
      ctx.progress(0.8 + (k / parts.length) * 0.12, `Blending part ${k + 1} of ${parts.length}`);
      const dur = prepared[k].endS - prepared[k].startS;
      const mid = numbered(tmp, 'mid', k);
      await new TrimCopyAction().execute(
        parts[k],
        k > 0 ? d : null,
        k < parts.length - 1 ? Math.max(d, dur - d) : null,
        mid,
        ctx,
      );
      sequence.push(mid);
      if (k < parts.length - 1) {
        const tr = numbered(tmp, 'xfade', k);
        await new XfadeAction().execute(parts[k], parts[k + 1], d, tr, encArgs, ctx);
        sequence.push(tr);
      }
    }
    ctx.progress(0.93, 'Mixing the sound');
    const video = join(tmp, 'video.mp4');
    await new ConcatAction().execute(sequence, video, ctx, { video: true });
    const audio = join(tmp, 'audio.m4a');
    let haveAudio = true;
    try {
      await new AudioCrossfadeAction().execute(prepared, d, audio, ctx);
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      ctx.log(
        `audio crossfade failed, movie will be silent: ${(e as Error).message.slice(0, 200)}`,
      );
      haveAudio = false;
    }
    ctx.progress(0.97, 'Joining everything');
    const muxed = join(tmp, 'movie.mp4');
    await runFfmpeg(
      [
        '-i',
        video,
        ...(haveAudio ? ['-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-shortest'] : []),
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        muxed,
      ],
      { signal: ctx.signal },
    );
    return await finish(muxed);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function fileSizeMb(file: string): number {
  return Math.round((statSync(file).size / 1e6) * 10) / 10;
}
