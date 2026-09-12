/**
 * The numbers the picture vote is made of (core/picture.ts). One ffmpeg pass over the small proxy,
 * two frames a second at 160 px wide: `signalstats` gives brightness, saturation and the colour
 * balance, and the same frames through `edgedetect` give how much detail is in them. A twenty
 * minute recording takes about ten seconds, which is why this only runs when the rider asks for the
 * picture to vote.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PictureStats } from '@core/picture';
import { runFfmpeg } from '../services/media';

/** how often a frame is looked at, and how wide it is scaled to first */
export const LOOK_FPS = 2;
const WIDTH = 160;

const optPath = (p: string): string => p.replace(/\\/g, '/').replace(/:/g, '\\:');

/** `lavfi.signalstats.YAVG=89.1` lines, one block per frame, into one number per frame */
function readStats(text: string, keys: string[]): { t: number[]; values: number[][] } {
  const t: number[] = [];
  const values: number[][] = keys.map(() => []);
  let pending: (number | null)[] = keys.map(() => null);
  let started = false;
  const flush = (): void => {
    if (!started) return;
    keys.forEach((_, i) => values[i].push(pending[i] ?? 0));
    pending = keys.map(() => null);
  };
  for (const line of text.split(/\r?\n/)) {
    const frame = /^frame:\d+\s+pts:\S+\s+pts_time:([\d.]+)/.exec(line);
    if (frame) {
      flush();
      started = true;
      t.push(Number(frame[1]));
      continue;
    }
    const kv = /^lavfi\.signalstats\.(\w+)=(-?[\d.]+)/.exec(line);
    if (!kv) continue;
    const at = keys.indexOf(kv[1]);
    if (at >= 0) pending[at] = Number(kv[2]);
  }
  flush();
  return { t, values };
}

export class PictureStatsAction {
  /** Look at `video` and report what its frames are like. */
  async execute(
    video: string,
    signal?: AbortSignal,
    onProgress?: (f: number) => void,
    durationS?: number,
  ): Promise<PictureStats> {
    const dir = mkdtempSync(join(tmpdir(), 'apexcut-picture-'));
    const plain = join(dir, 'plain.txt');
    const edges = join(dir, 'edges.txt');
    try {
      await runFfmpeg(
        [
          '-i',
          video,
          '-filter_complex',
          [
            `[0:v]fps=${LOOK_FPS},scale=${WIDTH}:-2,split=2[a][b]`,
            `[a]signalstats,metadata=print:file='${optPath(plain)}'[o1]`,
            `[b]edgedetect=low=0.1:high=0.3,signalstats,metadata=print:file='${optPath(edges)}'[o2]`,
          ].join(';'),
          '-map',
          '[o1]',
          '-an',
          '-f',
          'null',
          '-',
          '-map',
          '[o2]',
          '-an',
          '-f',
          'null',
          '-',
        ],
        { durationS, onProgress, signal },
      );
      const main = readStats(readFileSync(plain, 'utf8'), ['YAVG', 'SATAVG', 'UAVG', 'VAVG']);
      const edge = readStats(readFileSync(edges, 'utf8'), ['YAVG']);
      const n = Math.min(main.t.length, edge.t.length);
      return {
        fps: LOOK_FPS,
        t: main.t.slice(0, n),
        bright: main.values[0].slice(0, n),
        sat: main.values[1].slice(0, n),
        // red minus blue: warm light is positive, both are 0..255 around 128
        warmth: main.values[3].slice(0, n).map((v, i) => v - main.values[2][i]),
        edges: edge.values[0].slice(0, n),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
