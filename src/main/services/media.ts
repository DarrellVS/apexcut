/**
 * ffmpeg / ffprobe access: binary paths (npm builds, unpacked from the asar), probing, and hardware
 * encoder detection. Every ffmpeg invocation in the app goes through `runFfmpeg` so progress parsing
 * and cancellation work the same everywhere.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import log from 'electron-log/main';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import type { EncoderInfo } from '@shared/ipc';

const execFileP = promisify(execFile);

function unpacked(p: string): string {
  // electron-builder keeps these outside app.asar (see asarUnpack); the require path still says app.asar
  return p.replace('app.asar', 'app.asar.unpacked');
}

export const FFMPEG = unpacked(ffmpegStatic as unknown as string);
export const FFPROBE = unpacked((ffprobeStatic as unknown as { path: string }).path);

export interface StreamInfo {
  index: number;
  codec_type: string;
  codec_name?: string;
  codec_tag_string?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  nb_frames?: string;
  pix_fmt?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
}

export interface ProbeResult {
  duration: number;
  fps: number;
  width: number;
  height: number;
  nbFrames: number;
  pixFmt: string;
  tenBit: boolean;
  kbps: number | null;
  dataTags: string[];
  timecode: string | null;
  streams: StreamInfo[];
}

export async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await execFileP(
    FFPROBE,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const j = JSON.parse(stdout) as { format: Record<string, string>; streams: StreamInfo[] };
  const video = j.streams.find((s) => s.codec_type === 'video' && s.codec_name !== 'mjpeg');
  if (!video) throw new Error(`no video stream in ${path}`);
  const [num, den] = (video.r_frame_rate ?? '30/1').split('/').map(Number);
  const br = Number(video.bit_rate ?? j.format.bit_rate ?? 0);
  const pix = video.pix_fmt ?? 'yuv420p';
  let timecode: string | null = null;
  for (const s of j.streams) if (s.tags?.timecode) timecode = s.tags.timecode;
  return {
    duration: Number(j.format.duration),
    fps: num / den,
    width: video.width ?? 0,
    height: video.height ?? 0,
    nbFrames: Number(video.nb_frames ?? 0),
    pixFmt: pix,
    tenBit: pix.includes('10') || pix.includes('p010'),
    kbps: br ? Math.round(br / 1000) : null,
    dataTags: j.streams.filter((s) => s.codec_type === 'data').map((s) => s.codec_tag_string ?? ''),
    timecode,
    streams: j.streams,
  };
}

/** Length of an audio (or any) file in seconds; null when ffprobe cannot read it. */
export async function probeDuration(path: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP(FFPROBE, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ]);
    const d = Number(stdout.trim());
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

/** Stream-copy a data track (e.g. `djmd`) out of the container. Returns the raw bytes. */
export async function extractDataTrack(path: string, tag = 'djmd'): Promise<Uint8Array> {
  const info = await probe(path);
  const stream = info.streams.find((s) => s.codec_type === 'data' && s.codec_tag_string === tag);
  if (!stream) throw new Error(`no '${tag}' track in ${path}`);
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, [
      '-v',
      'error',
      '-i',
      path,
      '-map',
      `0:${stream.index}`,
      '-c',
      'copy',
      '-f',
      'data',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let err = '';
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => (err += c.toString()));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve(new Uint8Array(Buffer.concat(chunks)))
        : reject(new Error(err || `ffmpeg exit ${code}`)),
    );
  });
}

export interface RunOptions {
  /** total output seconds, for progress */
  durationS?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Run ffmpeg with `-progress pipe:1`; resolves on exit 0, rejects with the stderr tail otherwise. */
export function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(FFMPEG, [
      '-hide_banner',
      '-v',
      'error',
      '-y',
      '-progress',
      'pipe:1',
      '-nostats',
      ...args,
    ]);
    let err = '';
    let buf = '';
    proc.stdout?.on('data', (c: Buffer) => {
      buf += c.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && opts.durationS && opts.onProgress)
          opts.onProgress(Math.min(1, Number(m[1]) / 1e6 / opts.durationS));
      }
    });
    proc.stderr?.on('data', (c: Buffer) => (err = (err + c.toString()).slice(-4000)));
    const onAbort = (): void => {
      proc.kill();
      reject(new Error('cancelled'));
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    proc.on('error', reject);
    proc.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) return reject(new Error('cancelled'));
      code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg exit ${code}`));
    });
  });
}

let encoderCache: EncoderInfo | null = null;

async function encoderWorks(name: string): Promise<boolean> {
  try {
    await execFileP(FFMPEG, [
      '-hide_banner',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=256x256:rate=30',
      '-t',
      '0.2',
      '-c:v',
      name,
      '-f',
      'null',
      '-',
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Best available HEVC encoder (cached). Order: NVIDIA, Intel, AMD, software. */
export async function encoders(): Promise<EncoderInfo> {
  if (encoderCache) return encoderCache;
  const { stdout } = await execFileP(FFMPEG, ['-hide_banner', '-version']);
  const version = /ffmpeg version (\S+)/.exec(stdout)?.[1] ?? 'unknown';
  let hevc = 'libx265';
  for (const enc of ['hevc_nvenc', 'hevc_qsv', 'hevc_amf']) {
    if (await encoderWorks(enc)) {
      hevc = enc;
      break;
    }
  }
  encoderCache = { ffmpegVersion: version, hevcEncoder: hevc, gpuDecode: hevc === 'hevc_nvenc' };
  log.info('media: ffmpeg', version, 'encoder', hevc);
  return encoderCache;
}
