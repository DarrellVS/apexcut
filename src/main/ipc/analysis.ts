/**
 * Scanning a video and everything read back from a scan: the timeline payload, a rescore from the
 * cached signals, the user's selection, the filmstrip and a single frame.
 */
import { ipcMain } from 'electron';
import log from 'electron-log/main';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import type { Part, ScoreConfig } from '@core/types';
import { partSchema, type ScanFailure } from '@shared/ipc';
import { FilmstripAction, ThumbnailAction } from '../actions/thumbs';
import { mediaUrl } from '../services/protocol';
import type { Services } from './services';

export function registerAnalysisIpc(s: Services): void {
  ipcMain.handle('analysis:run', (_e, stems: unknown, cfg: unknown) => {
    const list = z.array(z.string()).parse(stems);
    // a new scan follows the project's preset and pulls switch unless the caller says otherwise
    const config = (cfg ?? s.projects.scoreConfig()) as Partial<ScoreConfig> | undefined;
    return s.jobs.start(
      'analyze',
      list.length === 1 ? `Scanning ${list[0]}` : `Scanning ${list.length} videos`,
      async (ctx) => {
        // one unreadable video must not stop the others: remember its error, carry on
        const done: string[] = [];
        const failed: ScanFailure[] = [];
        for (let i = 0; i < list.length; i++) {
          if (ctx.signal.aborted) throw new Error('cancelled');
          try {
            await s.analysis.analyze(list[i], config, ctx, i / list.length, 1 / list.length);
            done.push(list[i]);
          } catch (e) {
            if (ctx.signal.aborted) throw e;
            const msg = e instanceof Error ? e.message : String(e);
            log.warn(`scan ${list[i]} failed:`, msg);
            failed.push({ stem: list[i], error: msg });
          }
        }
        // nothing readable at all: the job itself fails (the toast carries the reason)
        if (!done.length && failed.length) throw new Error(failed[0].error);
        return { kind: 'analyze', stems: done, failed: failed.length ? failed : undefined };
      },
    );
  });
  ipcMain.handle('analysis:timeline', (_e, stem: unknown) =>
    s.analysis.timeline(z.string().parse(stem)),
  );
  ipcMain.handle('analysis:rescore', (_e, stem: unknown, cfg: unknown) =>
    s.analysis.rescore(z.string().parse(stem), (cfg ?? {}) as Partial<ScoreConfig>),
  );
  ipcMain.handle('analysis:saveParts', (_e, stem: unknown, parts: unknown) =>
    s.analysis.saveParts(z.string().parse(stem), z.array(partSchema).parse(parts) as Part[]),
  );
  ipcMain.handle('analysis:filmstrip', async (_e, stemRaw: unknown) => {
    const stem = z.string().parse(stemRaw);
    const meta = s.analysis.meta(stem);
    const info = await new FilmstripAction().execute(
      stem,
      s.library.proxyOf(stem),
      meta?.durationS ?? 0,
    );
    return {
      url: mediaUrl('clip', stem, basename(info.file)),
      step: info.step,
      n: info.n,
      size: info.size,
    };
  });
  /** one frame as a JPEG data URL, for the ride card */
  ipcMain.handle('analysis:frame', async (_e, stemRaw: unknown, tRaw: unknown, wRaw: unknown) => {
    const stem = z.string().parse(stemRaw);
    const tS = z.number().nonnegative().parse(tRaw);
    const width = z
      .number()
      .int()
      .min(64)
      .max(1920)
      .default(640)
      .parse(wRaw ?? undefined);
    const file = await new ThumbnailAction().execute(
      stem,
      s.library.proxyOf(stem),
      tS,
      width,
      `frame_${Math.round(tS * 10)}_${width}.jpg`,
    );
    return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
  });
}
