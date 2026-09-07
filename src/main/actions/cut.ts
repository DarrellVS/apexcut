/**
 * ffmpeg operations, one class per job step.
 *
 * Square output = stream copy (lossless, cuts snap to the keyframe before the start).
 * Cropped formats = re-encode at full resolution: 10-bit stays 10-bit, CQ 18, bitrate cap ≈ source
 * bitrate × kept pixels, GPU decode (NVDEC) when the encoder is NVENC with CPU fallback. Measured on
 * the prototype: p5 vs p7 differ by 0.1 dB PSNR at equal bitrate but p5 is 1.6× faster; two parallel
 * cuts give another 1.5×; GPU decode ~2.5×.
 *
 * Transitions between parts (docs/architecture.md → Export):
 *   cut        parts joined as they are (square stays a lossless copy)
 *   dip        every part fades in/out over 0.4 s (square is re-encoded for that, same quality rules)
 *   crossfade  parts are encoded with forced keyframes 0.5 s from each end; the tail of one part and
 *              the head of the next are blended with `xfade` into a short transition clip; the middles
 *              are cut out losslessly at those keyframes; one audio track is built with `acrossfade`;
 *              middles + transitions are concatenated and muxed with that audio.
 */
import { basename, join } from 'node:path';
import { mkdtempSync, rmSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { FORMAT_SPEC, type ExportFormat, type MusicSettings, type Transition } from '@shared/ipc';
import { encoders, probe, runFfmpeg, type ProbeResult } from '../services/media';
import type { JobContext } from '../services/jobs';
import { CardAction } from './cards';
import { MusicMixAction } from './music';

/** Title / end cards around the movie (see cards.ts). */
export interface Cards {
  title: { heading: string; subheading: string } | null;
  end: boolean;
}

/** crossfade length and dip-to-black fade length, seconds */
export const XFADE_S = 0.5;
export const DIP_S = 0.4;

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
}

export function cropFilter(format: ExportFormat, w: number, h: number, pos: number): string | null {
  const spec = FORMAT_SPEC[format];
  if (!spec) return null;
  let cw = Math.min(spec.w, w);
  let ch = Math.min(spec.h, h);
  if (cw !== spec.w || ch !== spec.h) {
    const ar = spec.w / spec.h;
    if (w / h > ar) {
      ch = h;
      cw = Math.floor((h * ar) / 2) * 2;
    } else {
      cw = w;
      ch = Math.floor(w / ar / 2) * 2;
    }
  }
  const p = Math.min(1, Math.max(0, pos));
  const x = Math.floor(((w - cw) * p) / 2) * 2;
  const y = Math.floor(((h - ch) * p) / 2) * 2;
  return `crop=${cw}:${ch}:${x}:${y}`;
}

export function encoderArgs(
  enc: string,
  quality: number,
  tenBit: boolean,
  targetKbps: number | null,
): string[] {
  const pix = ['-pix_fmt', tenBit ? 'p010le' : 'yuv420p'];
  const cap = targetKbps
    ? [
        '-maxrate',
        `${Math.round(targetKbps * 1.3)}k`,
        '-bufsize',
        `${Math.round(targetKbps * 2.6)}k`,
      ]
    : [];
  switch (enc) {
    case 'hevc_nvenc':
      return [
        '-c:v',
        enc,
        '-preset',
        'p5',
        '-tune',
        'hq',
        '-profile:v',
        tenBit ? 'main10' : 'main',
        '-rc',
        'vbr',
        '-cq',
        String(quality),
        '-b:v',
        '0',
        ...cap,
        '-spatial-aq',
        '1',
        '-temporal-aq',
        '1',
        '-aq-strength',
        '8',
        '-rc-lookahead',
        '32',
        '-bf',
        '3',
        '-b_ref_mode',
        'middle',
        '-tag:v',
        'hvc1',
        ...pix,
      ];
    case 'hevc_qsv':
      return [
        '-c:v',
        enc,
        '-preset',
        'veryslow',
        '-global_quality',
        String(quality),
        '-look_ahead',
        '1',
        ...cap,
        '-tag:v',
        'hvc1',
        ...pix,
      ];
    case 'hevc_amf':
      return [
        '-c:v',
        enc,
        '-quality',
        'quality',
        '-rc',
        'cqp',
        '-qp_i',
        String(quality),
        '-qp_p',
        String(quality),
        '-tag:v',
        'hvc1',
        ...pix,
      ];
    default:
      return [
        '-c:v',
        'libx265',
        '-preset',
        'medium',
        '-crf',
        String(quality),
        '-tag:v',
        'hvc1',
        '-pix_fmt',
        tenBit ? 'yuv420p10le' : 'yuv420p',
      ];
  }
}

const probeCache = new Map<string, Promise<ProbeResult>>();
function probeCached(src: string): Promise<ProbeResult> {
  let p = probeCache.get(src);
  if (!p) {
    p = probe(src);
    probeCache.set(src, p);
  }
  return p;
}

/** Encoder settings for a source: same rules everywhere so clips from one source concatenate cleanly. */
async function videoArgsFor(
  src: string,
  format: ExportFormat,
  quality: number,
): Promise<{ args: string[]; enc: string; info: ProbeResult }> {
  const info = await probeCached(src);
  const enc = (await encoders()).hevcEncoder;
  const spec = FORMAT_SPEC[format];
  const keptPixels = spec
    ? Math.min(spec.w, info.width) * Math.min(spec.h, info.height)
    : info.width * info.height;
  const target = info.kbps
    ? Math.round((info.kbps * keptPixels) / (info.width * info.height))
    : null;
  return { args: encoderArgs(enc, quality, info.tenBit, target), enc, info };
}

export class CutSegmentAction {
  async execute(
    input: CutInput,
    ctx: JobContext,
    onProgress: (f: number) => void,
  ): Promise<string> {
    const dur = Math.max(0.1, input.endS - input.startS);
    const common = [
      '-ss',
      input.startS.toFixed(3),
      '-to',
      input.endS.toFixed(3),
      '-i',
      input.src,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
    ];
    if (input.format === 'original' && !input.encode) {
      await runFfmpeg(
        [
          ...common,
          '-c',
          'copy',
          '-avoid_negative_ts',
          'make_zero',
          '-movflags',
          '+faststart',
          input.dst,
        ],
        { durationS: dur, onProgress, signal: ctx.signal },
      );
      return input.dst;
    }
    const {
      args: encArgs,
      enc,
      info,
    } = await videoArgsFor(input.src, input.format, input.quality ?? 18);
    const vf: string[] = [];
    const crop = cropFilter(input.format, info.width, info.height, input.framePos);
    if (crop) vf.push(crop);
    const fading = input.fade > 0 && dur > 2 * input.fade;
    if (fading) {
      vf.push(
        `fade=t=in:st=0:d=${input.fade.toFixed(2)},fade=t=out:st=${(dur - input.fade).toFixed(2)}:d=${input.fade.toFixed(2)}`,
      );
    }
    const args = [...common];
    if (vf.length) args.push('-vf', vf.join(','));
    if (fading) {
      args.push(
        '-af',
        `afade=t=in:st=0:d=${input.fade.toFixed(2)},afade=t=out:st=${(dur - input.fade).toFixed(2)}:d=${input.fade.toFixed(2)}`,
      );
    }
    if (input.keyframesAt?.length) {
      args.push('-force_key_frames', input.keyframesAt.map((t) => t.toFixed(3)).join(','));
    }
    args.push(...encArgs, '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', input.dst);
    if (enc === 'hevc_nvenc') {
      try {
        await runFfmpeg(['-hwaccel', 'cuda', ...args], {
          durationS: dur,
          onProgress,
          signal: ctx.signal,
        });
        return input.dst;
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        ctx.log(
          `GPU decode failed, falling back to CPU decode: ${(e as Error).message.slice(0, 200)}`,
        );
      }
    }
    await runFfmpeg(args, { durationS: dur, onProgress, signal: ctx.signal });
    return input.dst;
  }
}

export class ConcatAction {
  async execute(
    parts: string[],
    dst: string,
    ctx: JobContext,
    opts: { video?: boolean } = {},
  ): Promise<string> {
    const list = `${dst}.txt`;
    writeFileSync(
      list,
      parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'),
      'utf8',
    );
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

export const PARALLEL_CUTS = 2; // each 4K HEVC decode holds ~4 GB RAM

export interface CutItem extends Omit<CutInput, 'dst'> {
  name: string;
}

/** Cut all items (a few at once for re-encodes), aggregate progress, keep item order. */
export async function cutAll(
  items: CutItem[],
  outDir: string,
  ctx: JobContext,
  range: [number, number] = [0, 0.97],
): Promise<string[]> {
  const total = items.reduce((a, i) => a + (i.endS - i.startS), 0) || 1;
  const fracs = new Array<number>(items.length).fill(0);
  const report = (): void => {
    const done = fracs.reduce((a, f, k) => a + f * (items[k].endS - items[k].startS), 0);
    const finished = fracs.filter((f) => f >= 1).length;
    ctx.progress(
      range[0] + Math.min(1, done / total) * (range[1] - range[0]),
      `Cutting part ${Math.min(items.length, finished + 1)} of ${items.length}`,
    );
  };
  const workers = items.some((i) => i.format !== 'original' || i.encode) ? PARALLEL_CUTS : 1;
  const results = new Array<string>(items.length);
  let next = 0;
  const action = new CutSegmentAction();
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const k = next++;
      const it = items[k];
      if (ctx.signal.aborted) throw new Error('cancelled');
      ctx.log(
        `cut ${k + 1}/${items.length}: ${basename(it.src)} ${it.startS.toFixed(1)}-${it.endS.toFixed(1)}s`,
      );
      results[k] = await action.execute({ ...it, dst: join(outDir, it.name) }, ctx, (f) => {
        fracs[k] = f;
        report();
      });
      fracs[k] = 1;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, worker));
  return results;
}

/** Per-part settings a transition needs: fades for dip, re-encode + keyframes for crossfade. */
export function prepareItems(items: CutItem[], transition: Transition): CutItem[] {
  return items.map((it, k) => {
    const dur = it.endS - it.startS;
    if (transition === 'dip') return { ...it, fade: DIP_S, encode: true };
    if (transition === 'crossfade' && items.length > 1) {
      const kf: number[] = [];
      if (k > 0) kf.push(XFADE_S);
      if (k < items.length - 1) kf.push(Math.max(XFADE_S, dur - XFADE_S));
      return { ...it, fade: 0, encode: true, keyframesAt: kf };
    }
    return { ...it, fade: 0 };
  });
}

/** Title/end cards rendered like the movie itself, then joined around it losslessly. */
async function addCards(
  movie: string,
  outPath: string,
  cards: Cards,
  encArgs: string[],
  tmp: string,
  ctx: JobContext,
): Promise<void> {
  const info = await probe(movie);
  const spec = {
    width: info.width,
    height: info.height,
    fps: String(info.fps),
    tenBit: info.tenBit,
    encArgs,
    tmp,
    footer: 'Made with ApexCut',
  };
  const sequence: string[] = [];
  if (cards.title) {
    ctx.progress(0.985, 'Making the title card');
    sequence.push(
      await new CardAction().execute({ ...spec, ...cards.title, dst: join(tmp, 'title.mp4') }, ctx),
    );
  }
  sequence.push(movie);
  if (cards.end) {
    ctx.progress(0.99, 'Making the end card');
    sequence.push(
      await new CardAction().execute(
        {
          ...spec,
          heading: 'Made with ApexCut',
          subheading: '',
          footer: '',
          dst: join(tmp, 'end.mp4'),
        },
        ctx,
      ),
    );
  }
  ctx.progress(0.995, 'Joining everything');
  await new ConcatAction().execute(sequence, outPath, ctx);
}

export async function compileMovie(
  items: CutItem[],
  outPath: string,
  ctx: JobContext,
  transition: Transition = 'crossfade',
  cards: Cards = { title: null, end: false },
  music?: MusicSettings,
): Promise<string> {
  const tmp = mkdtempSync(join(outPath, '..', 'apexcut-'));
  const withCards = !!cards.title || cards.end;
  const withMusic = !!music && music.tracks.some((t) => t.outS > t.inS);
  // cards are encoded clips: the movie must be encoded too so the pieces concatenate cleanly
  const encodeAll = withCards && items.some((it) => it.format === 'original');
  const { args: encArgs } = await videoArgsFor(
    items[0].src,
    items[0].format,
    items[0].quality ?? 18,
  );
  const finish = async (movie: string): Promise<string> => {
    // cards first (video), then the music mix on top of the finished picture (audio only)
    const carded = withMusic ? join(tmp, 'carded.mp4') : outPath;
    if (withCards) await addCards(movie, carded, cards, encArgs, tmp, ctx);
    else renameSync(movie, carded);
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
      encode: it.encode || encodeAll,
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
      const mid = join(tmp, `mid_${String(k).padStart(3, '0')}.mp4`);
      await new TrimCopyAction().execute(
        parts[k],
        k > 0 ? d : null,
        k < parts.length - 1 ? Math.max(d, dur - d) : null,
        mid,
        ctx,
      );
      sequence.push(mid);
      if (k < parts.length - 1) {
        const tr = join(tmp, `xfade_${String(k).padStart(3, '0')}.mp4`);
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
