/**
 * The quality rules of every export, as pure functions: which crop a format needs, how big the
 * result is, which encoder arguments a source deserves (10-bit stays 10-bit, CQ 18) and the bitrate
 * cap that follows the kept pixels. No ffmpeg here — see encode.ts for the calls that use these.
 *
 * Measured on the prototype: p5 vs p7 differ by 0.1 dB PSNR at equal bitrate but p5 is 1.6× faster;
 * two parallel cuts give another 1.5×; GPU decode ~2.5×.
 */
import { FORMAT_SPEC, type ExportFormat } from '@shared/ipc';
import type { ProbeResult } from '../../services/media';

/** `crop=w:h:x:y` for a format, or null when the whole frame is kept (square). */
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

/** The output size of a format for a source of `w`×`h` (never bigger than the source). */
export function outputSize(
  format: ExportFormat,
  w: number,
  h: number,
): { width: number; height: number } {
  const spec = FORMAT_SPEC[format];
  return spec
    ? { width: Math.min(spec.w, w), height: Math.min(spec.h, h) }
    : { width: w, height: h };
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

/** Bitrate cap for a crop: the source rate scaled by the share of pixels that survive. */
export function targetKbps(info: ProbeResult, format: ExportFormat): number | null {
  if (!info.kbps) return null;
  const out = outputSize(format, info.width, info.height);
  return Math.round((info.kbps * out.width * out.height) / (info.width * info.height));
}
