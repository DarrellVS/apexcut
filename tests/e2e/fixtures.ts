/**
 * Files for the end-to-end tests.
 *
 * - `plainMp4()`  a real, playable MP4 without a DJI data track (made with the bundled ffmpeg)
 * - `corruptMp4()` 4 kB of noise with an .mp4 name
 * - `realDjiVideo()` a DJI recording on this machine, when there is one: the path in
 *   `APEXCUT_E2E_VIDEO`, else the smallest `.LRF` in one of the folders below (the proxy carries the
 *   same motion data as the MP4 and reads fast). Tests that need it skip when there is none.
 * - `bigDjiVideos()` the paths in `APEXCUT_E2E_BIG_VIDEO` (`;`-separated, for the "stop scanning" test).
 * - `goproVideo()` one of GoPro's own sample recordings, when they have been downloaded to
 *   `~/Videos/GoPro-samples` (see tests/fixtures/gopro/README.md); tests that need it skip otherwise.
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

/** where recordings usually sit on this machine; the first match wins */
const VIDEO_DIRS = [
  join(homedir(), 'Videos', 'DJI-RAW'),
  join(homedir(), 'Downloads', 'dji-examples'),
];

export function realDjiVideo(): string | null {
  const env = process.env.APEXCUT_E2E_VIDEO;
  if (env && existsSync(env)) return env;
  for (const dir of VIDEO_DIRS) {
    if (!existsSync(dir)) continue;
    const candidates = readdirSync(dir)
      .filter((f) => /\.lrf$/i.test(f))
      .map((f) => ({ file: join(dir, f), size: statSync(join(dir, f)).size }))
      .sort((a, b) => a.size - b.size);
    if (candidates.length) return candidates[0].file;
  }
  return null;
}

/**
 * A GoPro recording with its motion track: `APEXCUT_E2E_GOPRO`, else a sample downloaded from
 * gopro/gpmf-parser into `~/Videos/GoPro-samples` (hero5.mp4 is the longest, so it has the most to
 * find). The metadata of the same recordings is committed under tests/fixtures/gopro for the unit
 * tests; the videos themselves are too big for the repository.
 */
export function goproVideo(): string | null {
  const env = process.env.APEXCUT_E2E_GOPRO;
  if (env && existsSync(env)) return env;
  const dir = join(homedir(), 'Videos', 'GoPro-samples');
  if (!existsSync(dir)) return null;
  for (const name of ['hero5.mp4', 'hero8.mp4', 'hero7.mp4']) {
    if (existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

/**
 * A recording in which the rider holds two fingers up to the camera: `APEXCUT_E2E_GESTURE`, else a
 * `.LRF` in `~/Videos/DJI-GESTURES`. Tests that need it skip when there is none.
 */
export function gestureVideo(): string | null {
  const env = process.env.APEXCUT_E2E_GESTURE;
  if (env && existsSync(env)) return env;
  const dir = join(homedir(), 'Videos', 'DJI-GESTURES');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /\.lrf$/i.test(f))
    .map((f) => join(dir, f))
    .sort();
  return files[0] ?? null;
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
