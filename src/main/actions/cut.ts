/**
 * ffmpeg operations, one class per job step.
 *
 * Square output = stream copy (lossless, cuts snap to the keyframe before the start).
 * Cropped formats = re-encode at full resolution: 10-bit stays 10-bit, CQ 18, bitrate cap ≈ source
 * bitrate × kept pixels, GPU decode (NVDEC) when the encoder is NVENC with CPU fallback. Measured on
 * the prototype: p5 vs p7 differ by 0.1 dB PSNR at equal bitrate but p5 is 1.6× faster; two parallel
 * cuts give another 1.5×; GPU decode ~2.5×.
 */
import { basename, join } from 'node:path';
import { mkdtempSync, rmSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { FORMAT_SPEC, type ExportFormat } from '@shared/ipc';
import { encoders, probe, runFfmpeg, type ProbeResult } from '../services/media';
import type { JobContext } from '../services/jobs';

export interface CutInput {
  src: string;
  startS: number;
  endS: number;
  dst: string;
  format: ExportFormat;
  framePos: number;
  fade: number;
  quality?: number;
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
    if (input.format === 'original') {
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
    const info = await probeCached(input.src);
    const enc = (await encoders()).hevcEncoder;
    const vf: string[] = [];
    const crop = cropFilter(input.format, info.width, info.height, input.framePos);
    if (crop) vf.push(crop);
    if (input.fade > 0 && dur > 2 * input.fade) {
      vf.push(
        `fade=t=in:st=0:d=${input.fade.toFixed(2)},fade=t=out:st=${(dur - input.fade).toFixed(2)}:d=${input.fade.toFixed(2)}`,
      );
    }
    const spec = FORMAT_SPEC[input.format];
    const keptPixels = spec
      ? Math.min(spec.w, info.width) * Math.min(spec.h, info.height)
      : info.width * info.height;
    const target = info.kbps
      ? Math.round((info.kbps * keptPixels) / (info.width * info.height))
      : null;
    const args = [...common];
    if (vf.length) args.push('-vf', vf.join(','));
    if (input.fade > 0 && dur > 2 * input.fade) {
      args.push(
        '-af',
        `afade=t=in:st=0:d=${input.fade.toFixed(2)},afade=t=out:st=${(dur - input.fade).toFixed(2)}:d=${input.fade.toFixed(2)}`,
      );
    }
    args.push(
      ...encoderArgs(enc, input.quality ?? 18, info.tenBit, target),
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-movflags',
      '+faststart',
      input.dst,
    );
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
  async execute(parts: string[], dst: string, ctx: JobContext): Promise<string> {
    const list = `${dst}.txt`;
    writeFileSync(
      list,
      parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'),
      'utf8',
    );
    try {
      await runFfmpeg(
        ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', dst],
        { signal: ctx.signal },
      );
    } finally {
      rmSync(list, { force: true });
    }
    return dst;
  }
}

export const PARALLEL_CUTS = 2; // each 4K HEVC decode holds ~4 GB RAM

export interface CutItem extends Omit<CutInput, 'dst'> {
  name: string;
}

/** Cut all items (a few at once for re-encodes), aggregate progress, keep item order. */
export async function cutAll(items: CutItem[], outDir: string, ctx: JobContext): Promise<string[]> {
  const total = items.reduce((a, i) => a + (i.endS - i.startS), 0) || 1;
  const fracs = new Array<number>(items.length).fill(0);
  const report = (): void => {
    const done = fracs.reduce((a, f, k) => a + f * (items[k].endS - items[k].startS), 0);
    const finished = fracs.filter((f) => f >= 1).length;
    ctx.progress(
      Math.min(0.97, done / total),
      `Cutting part ${Math.min(items.length, finished + 1)} of ${items.length}`,
    );
  };
  const workers = items.some((i) => i.format !== 'original') ? PARALLEL_CUTS : 1;
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

export async function compileMovie(
  items: CutItem[],
  outPath: string,
  ctx: JobContext,
): Promise<string> {
  const tmp = mkdtempSync(join(outPath, '..', 'apexcut-'));
  try {
    const parts = await cutAll(
      items.map((it, k) => ({ ...it, name: `part_${String(k).padStart(3, '0')}.mp4` })),
      tmp,
      ctx,
    );
    ctx.progress(0.98, 'Joining everything');
    if (parts.length === 1) renameSync(parts[0], outPath);
    else await new ConcatAction().execute(parts, outPath, ctx);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return outPath;
}

export function fileSizeMb(file: string): number {
  return Math.round((statSync(file).size / 1e6) * 10) / 10;
}
