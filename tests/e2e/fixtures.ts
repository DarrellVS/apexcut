/**
 * Files for the end-to-end tests.
 *
 * - `plainMp4()`  a real, playable MP4 without a DJI data track (made with the bundled ffmpeg)
 * - `corruptMp4()` 4 kB of noise with an .mp4 name
 * - `realDjiVideo()` a small DJI recording on this machine, when there is one: the path in
 *   `APEXCUT_E2E_VIDEO`, else the smallest `.LRF` under `~/Downloads/dji-examples` that is at least
 *   25 s long by size (≥ 15 MB, so it has at least one part). Tests that need it skip when it is absent.
 * - `bigDjiVideos()` the paths in `APEXCUT_E2E_BIG_VIDEO` (`;`-separated, for the "stop scanning" test).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const dir = join(tmpdir(), 'apexcut-e2e-fixtures');
mkdirSync(dir, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FFMPEG = require('ffmpeg-static') as string;

export function plainMp4(name = 'plain_video'): string {
  const file = join(dir, `${name}.mp4`);
  if (!existsSync(file)) {
    execFileSync(FFMPEG, [
      '-hide_banner',
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x320:rate=30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'ultrafast',
      '-t',
      '4',
      file,
    ]);
  }
  return file;
}

export function corruptMp4(name = 'broken_video'): string {
  const file = join(dir, `${name}.mp4`);
  if (!existsSync(file)) writeFileSync(file, randomBytes(4096));
  return file;
}

export function realDjiVideo(): string | null {
  const env = process.env.APEXCUT_E2E_VIDEO;
  if (env && existsSync(env)) return env;
  const examples = join(homedir(), 'Downloads', 'dji-examples');
  if (!existsSync(examples)) return null;
  const candidates = readdirSync(examples)
    .filter((f) => /\.lrf$/i.test(f))
    .map((f) => ({ file: join(examples, f), size: statSync(join(examples, f)).size }))
    .filter((c) => c.size >= 15e6)
    .sort((a, b) => a.size - b.size);
  return candidates[0]?.file ?? null;
}

/** one or more large recordings (`;`-separated) for the "stop scanning" test; [] when unset */
export function bigDjiVideos(): string[] {
  return (process.env.APEXCUT_E2E_BIG_VIDEO ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p && existsSync(p));
}

/** "DJI_20260905234927_0031_D.LRF" → "DJI_20260905234927_0031_D" */
export function stemOf(file: string): string {
  return file.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
}
