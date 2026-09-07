/**
 * Filmstrip sprite (one frame every N seconds, tiled horizontally) and single thumbnails, rendered
 * from the proxy with ffmpeg and cached under clips/<stem>/.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runFfmpeg } from '../services/media';
import { ensureDir, paths } from '../services/store';

export interface FilmstripInfo {
  file: string;
  step: number;
  n: number;
  size: number;
}

export class FilmstripAction {
  async execute(
    stem: string,
    video: string,
    durationS: number,
    step = 4,
    size = 96,
  ): Promise<FilmstripInfo> {
    const n = Math.max(1, Math.floor(durationS / step) + 1);
    const file = join(ensureDir(paths.clipDir(stem)), `strip_${step}s_${size}.jpg`);
    if (!existsSync(file)) {
      await runFfmpeg([
        '-i',
        video,
        '-vf',
        `fps=1/${step},scale=${size}:${size},tile=${n}x1`,
        '-frames:v',
        '1',
        '-q:v',
        '5',
        file,
      ]);
    }
    return { file, step, n, size };
  }
}

export class ThumbnailAction {
  async execute(
    stem: string,
    video: string,
    tS: number,
    width = 320,
    name?: string,
  ): Promise<string> {
    const file = name
      ? join(ensureDir(paths.clipDir(stem)), name)
      : join(
          ensureDir(join(paths.clipDir(stem), 'thumbs')),
          `${String(Math.round(tS * 10)).padStart(7, '0')}.jpg`,
        );
    if (!existsSync(file)) {
      await runFfmpeg([
        '-ss',
        tS.toFixed(2),
        '-i',
        video,
        '-frames:v',
        '1',
        '-vf',
        `scale=${width}:-2`,
        '-q:v',
        '4',
        file,
      ]);
    }
    return file;
  }
}
