/**
 * Making the movie: turn an export request into cut items, start the job (one movie, or a file per
 * part), and the EDL for people who finish in Resolve or Premiere. Jobs report progress to every
 * window.
 */
import { ipcMain } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { edl } from '@core/edl';
import { followFrames, followPath } from '@core/framing';
import { resample } from '@core/overlay';
import { fmtClock } from '@shared/format';
import { exportRequestSchema, type ExportRequest, type JobState } from '@shared/ipc';
import { compileMovie, cutAll, fileSizeMb, prepareItems, type CutItem } from '../actions/cut';
import type { OverlayJob, OverlaySprites } from '../actions/overlay';
import { allowRoot, mediaUrl } from '../services/protocol';
import { broadcast } from '../services/windows';
import { sanitize, stamp } from './helpers';
import type { Services } from './services';

type ExportItem = ExportRequest['items'][number];

/**
 * The telemetry overlay of one export: the three sprites the renderer drew are written once, and
 * every part gets the 30 Hz signals resampled to its own frame rate. Null when the overlay is off.
 */
function overlayJobs(
  s: Services,
  overlay: ExportRequest['overlay'],
): ((it: ExportItem) => OverlayJob | undefined) | null {
  if (!overlay) return null;
  const dir = mkdtempSync(join(tmpdir(), 'apexcut-overlay-'));
  const sprites = Object.fromEntries(
    Object.entries(overlay.sprites).map(([k, dataUrl]) => {
      const file = join(dir, `${k}.png`);
      writeFileSync(file, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
      return [k, file];
    }),
  ) as unknown as OverlaySprites;
  const spec = overlay.spec;
  return (it) => {
    const sig = s.analysis.signals(it.stem);
    const meta = s.analysis.meta(it.stem);
    if (!sig || !meta) return undefined;
    const fps = meta.fps || 30;
    return {
      spec,
      sprites,
      fps,
      samples: resample(sig.imuT, sig.imu.leanDeg, sig.imu.aLonG, it.startS, it.endS, fps),
    };
  };
}

/**
 * The crop window that leans into the corners, per part: the whole recording's path is walked once
 * (so a part starts where the ride had got to), then sampled at the part's own frame rate. Null
 * unless the rider asked for it, and only for the vertical format, which is the one with room to
 * move sideways.
 */
function followFor(
  s: Services,
  req: ExportRequest,
): ((it: ExportItem) => { pos: number[]; fps: number } | undefined) | null {
  if (!req.follow || req.format !== '9x16') return null;
  const paths = new Map<string, { t: number[]; path: Float64Array; fps: number } | null>();
  return (it) => {
    let entry = paths.get(it.stem);
    if (entry === undefined) {
      const sig = s.analysis.signals(it.stem);
      const meta = s.analysis.meta(it.stem);
      entry =
        sig && meta
          ? {
              t: sig.imuT,
              path: followPath(sig.imuT, sig.imu.yawRateLpDps, { p0: req.framePos }),
              fps: meta.fps || 30,
            }
          : null;
      paths.set(it.stem, entry);
    }
    if (!entry) return undefined;
    return {
      pos: followFrames(entry.t, entry.path, it.startS, it.endS, entry.fps),
      fps: entry.fps,
    };
  };
}

/** Every part as a cut item: the source file, its window, the framing, the colours, its file name. */
function cutItems(s: Services, req: ExportRequest): CutItem[] {
  const overlayFor = overlayJobs(s, req.overlay);
  const followOf = followFor(s, req);
  return req.items.map((it, k) => {
    const rec = s.library.get(it.stem);
    const src = rec.mp4 ?? rec.lrf;
    if (!src) throw new Error(`no video file for ${it.stem}`);
    const label = (it.reden ?? 'part').replace('/', '-');
    const mm = String(Math.floor(it.startS / 60)).padStart(2, '0');
    const ss = String(Math.floor(it.startS % 60)).padStart(2, '0');
    return {
      src,
      startS: it.startS,
      endS: it.endS,
      format: req.format,
      framePos: req.framePos,
      fade: 0,
      grade: it.grade,
      name: `${it.stem}_${mm}m${ss}s_${label}_${k}.mp4`,
      overlay: overlayFor?.(it),
      follow: followOf?.(it),
    };
  });
}

export function registerExportIpc(s: Services): void {
  ipcMain.handle('export:start', (_e, raw: unknown) => {
    const req = exportRequestSchema.parse(raw);
    const items = cutItems(s, req);
    const total = Math.round(items.reduce((a, i) => a + i.endS - i.startS, 0));
    if (req.separate) {
      const outDir = join(s.settings.outputDir('clips'), `${sanitize(req.name)}_${stamp()}`);
      allowRoot(outDir);
      // separate clips: a dip fades each clip in and out; otherwise clips are plain cuts
      const clips = prepareItems(items, req.transition === 'dip' ? 'dip' : 'cut');
      return s.jobs.start('extract', `${items.length} clips`, async (ctx) => {
        const files = await cutAll(clips, outDir, ctx);
        return { kind: 'extract', folder: outDir, files: files.map((f) => basename(f)) };
      });
    }
    const out = join(s.settings.outputDir('movies'), `${sanitize(req.name)}_${stamp()}.mp4`);
    allowRoot(join(out, '..'));
    return s.jobs.start(
      'export',
      `Movie “${sanitize(req.name)}” · ${fmtClock(total)}`,
      async (ctx) => {
        await compileMovie(items, out, ctx, {
          transition: req.transition,
          music: req.music,
          loudness: req.loudness,
        });
        return {
          kind: 'export',
          file: out,
          url: mediaUrl('movie', basename(out)),
          sizeMb: fileSizeMb(out),
        };
      },
    );
  });
  ipcMain.handle('export:cancel', (_e, id: unknown) => s.jobs.cancel(z.string().parse(id)));
  ipcMain.handle('export:edl', (_e, stemRaw: unknown) => {
    const stem = z.string().parse(stemRaw);
    const rec = s.library.get(stem);
    const meta = s.analysis.meta(stem);
    const parts = s.analysis.parts(stem).filter((p) => p.enabled);
    const src = rec.mp4 ?? rec.lrf ?? `${stem}.MP4`;
    const text = edl(
      parts,
      stem,
      basename(src),
      meta?.fps ?? 29.97,
      meta?.timecode ?? '00:00:00:00',
    );
    const file = join(s.settings.outputDir('movies'), `${stem}_highlights.edl`);
    writeFileSync(file, text, 'utf8');
    return { file };
  });

  // ---- jobs
  ipcMain.handle('jobs:list', () => s.jobs.list());
  s.jobs.on('update', (job: JobState) => broadcast('jobs:update', job));
}
