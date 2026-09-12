/**
 * Putting cut parts back together: concatenating them, trimming an encoded part losslessly between
 * its forced keyframes, blending two neighbours into a crossfade clip, and building one audio track
 * that crossfades at every boundary.
 */
import { rmSync, writeFileSync } from 'node:fs';
import { runFfmpeg } from '../../services/media';
import type { JobContext } from '../../services/jobs';
import type { CutItem } from './types';

/** the concat demuxer wants forward slashes and escaped quotes */
const listLine = (p: string): string => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;

export class ConcatAction {
  async execute(
    parts: string[],
    dst: string,
    ctx: JobContext,
    opts: { video?: boolean } = {},
  ): Promise<string> {
    const list = `${dst}.txt`;
    writeFileSync(list, parts.map(listLine).join('\n'), 'utf8');
    try {
      await runFfmpeg(
        [
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          list,
          ...(opts.video ? ['-map', '0:v:0'] : []),
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          dst,
        ],
        { signal: ctx.signal },
      );
    } finally {
      rmSync(list, { force: true });
    }
    return dst;
  }
}

/** The last `d` seconds of `a` blended into the first `d` seconds of `b`, encoded like the parts. */
export class XfadeAction {
  async execute(
    a: string,
    b: string,
    d: number,
    dst: string,
    encArgs: string[],
    ctx: JobContext,
  ): Promise<string> {
    await runFfmpeg(
      [
        '-sseof',
        (-d).toFixed(3),
        '-i',
        a,
        '-t',
        d.toFixed(3),
        '-i',
        b,
        '-filter_complex',
        `[0:v]settb=AVTB,setpts=PTS-STARTPTS[va];[1:v]settb=AVTB,setpts=PTS-STARTPTS[vb];[va][vb]xfade=transition=fade:duration=${d.toFixed(3)}:offset=0[v]`,
        '-map',
        '[v]',
        '-an',
        ...encArgs,
        '-movflags',
        '+faststart',
        dst,
      ],
      { signal: ctx.signal },
    );
    return dst;
  }
}

/** Lossless cut of an encoded part between its forced keyframes. */
export class TrimCopyAction {
  async execute(
    src: string,
    fromS: number | null,
    toS: number | null,
    dst: string,
    ctx: JobContext,
  ): Promise<string> {
    const args: string[] = [];
    if (fromS !== null) args.push('-ss', fromS.toFixed(3));
    if (toS !== null) args.push('-to', toS.toFixed(3));
    args.push(
      '-i',
      src,
      '-map',
      '0:v:0',
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      dst,
    );
    await runFfmpeg(args, { signal: ctx.signal });
    return dst;
  }
}

/** One audio track for the whole movie: the parts' audio, crossfaded at every boundary. */
export class AudioCrossfadeAction {
  async execute(items: CutItem[], d: number, dst: string, ctx: JobContext): Promise<string> {
    const args: string[] = [];
    items.forEach((it) =>
      args.push('-ss', it.startS.toFixed(3), '-to', it.endS.toFixed(3), '-i', it.src),
    );
    let graph = '';
    let last = '[0:a]';
    for (let k = 1; k < items.length; k++) {
      const out = k === items.length - 1 ? '[a]' : `[a${k}]`;
      graph += `${last}[${k}:a]acrossfade=d=${d.toFixed(3)}:c1=tri:c2=tri${out};`;
      last = out;
    }
    args.push(
      '-filter_complex',
      graph.slice(0, -1),
      '-map',
      '[a]',
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      dst,
    );
    await runFfmpeg(args, { signal: ctx.signal });
    return dst;
  }
}
