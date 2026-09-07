/**
 * IPC handlers: thin — validate input, call a service, return. Long work becomes a job.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { edl } from '@core/edl';
import type { Part, ScoreConfig } from '@core/types';
import { exportRequestSchema, partSchema, settingsSchema, type JobState } from '@shared/ipc';
import { compileMovie, cutAll, fileSizeMb, type CutItem } from './actions/cut';
import { FilmstripAction } from './actions/thumbs';
import { Analysis } from './services/analysis';
import { Jobs } from './services/jobs';
import { Library } from './services/library';
import { encoders } from './services/media';
import { allowRoot, mediaUrl, registerResolver } from './services/protocol';
import { paths, SettingsStore } from './services/store';

export interface Services {
  library: Library;
  analysis: Analysis;
  jobs: Jobs;
  settings: SettingsStore;
}

export function createServices(): Services {
  const library = new Library();
  return {
    library,
    analysis: new Analysis(library),
    jobs: new Jobs(),
    settings: new SettingsStore(),
  };
}

/** Safe file name: drop characters Windows rejects plus control characters. */
const sanitize = (name: string): string =>
  [...name]
    .filter((c) => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c))
    .join('')
    .trim() || 'movie';
const stamp = (): string =>
  new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);

export function registerIpc(s: Services): void {
  // the user's output folder must be servable (movie preview after a restart)
  const out = s.settings.get().outputDir;
  if (out) allowRoot(out);

  // ---- media protocol resolvers
  registerResolver('proxy', ([stem]) => (stem ? s.library.proxyOf(stem) : null));
  registerResolver('clip', ([stem, ...rest]) => (stem ? join(paths.clipDir(stem), ...rest) : null));
  registerResolver('movie', ([file]) =>
    file ? join(s.settings.outputDir('movies'), basename(file)) : null,
  );

  // ---- library
  ipcMain.handle('library:list', () => s.library.list());
  ipcMain.handle('library:add', (_e, paths: unknown) => ({
    added: s.library.add(z.array(z.string()).parse(paths)),
  }));
  ipcMain.handle('library:remove', (_e, stem: unknown) => s.library.remove(z.string().parse(stem)));
  ipcMain.handle('library:reorder', (_e, stems: unknown) =>
    s.library.reorder(z.array(z.string()).parse(stems)),
  );
  ipcMain.handle('library:pick', async (e, kind: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const k = z.enum(['files', 'dir']).parse(kind);
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: k === 'files' ? 'Choose your DJI videos' : 'Choose the folder with your DJI videos',
      properties: k === 'files' ? ['openFile', 'multiSelections'] : ['openDirectory'],
      filters:
        k === 'files' ? [{ name: 'DJI video', extensions: ['MP4', 'mp4', 'LRF', 'lrf'] }] : [],
    });
    if (res.canceled) return { added: [], cancelled: true };
    return { added: s.library.add(res.filePaths), cancelled: false };
  });

  // ---- analysis
  ipcMain.handle('analysis:run', (_e, stems: unknown, cfg: unknown) => {
    const list = z.array(z.string()).parse(stems);
    const config = (cfg ?? undefined) as Partial<ScoreConfig> | undefined;
    return s.jobs.start(
      'analyze',
      list.length === 1 ? `Scanning ${list[0]}` : `Scanning ${list.length} videos`,
      async (ctx) => {
        for (let i = 0; i < list.length; i++) {
          if (ctx.signal.aborted) throw new Error('cancelled');
          await s.analysis.analyze(list[i], config, ctx, i / list.length, 1 / list.length);
        }
        return { kind: 'analyze', stems: list };
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

  // ---- export
  ipcMain.handle('export:start', (_e, raw: unknown) => {
    const req = exportRequestSchema.parse(raw);
    const items: CutItem[] = req.items.map((it, k) => {
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
        fade: req.format === 'original' ? 0 : 0.4,
        name: `${it.stem}_${mm}m${ss}s_${label}_${k}.mp4`,
      };
    });
    const total = Math.round(items.reduce((a, i) => a + i.endS - i.startS, 0));
    if (req.separate) {
      const outDir = join(s.settings.outputDir('clips'), `${sanitize(req.name)}_${stamp()}`);
      allowRoot(outDir);
      return s.jobs.start('extract', `${items.length} clips`, async (ctx) => {
        const files = await cutAll(items, outDir, ctx);
        return { kind: 'extract', folder: outDir, files: files.map((f) => basename(f)) };
      });
    }
    const out = join(s.settings.outputDir('movies'), `${sanitize(req.name)}_${stamp()}.mp4`);
    allowRoot(join(out, '..'));
    return s.jobs.start('export', `Movie “${sanitize(req.name)}” (${total} s)`, async (ctx) => {
      await compileMovie(items, out, ctx);
      return {
        kind: 'export',
        file: out,
        url: mediaUrl('movie', basename(out)),
        sizeMb: fileSizeMb(out),
      };
    });
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
  s.jobs.on('update', (job: JobState) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('jobs:update', job);
  });

  // ---- settings / shell / app
  ipcMain.handle('settings:get', () => s.settings.get());
  ipcMain.handle('settings:set', (_e, patch: unknown) =>
    s.settings.set(settingsSchema.partial().parse(patch)),
  );
  ipcMain.handle('settings:encoders', () => encoders());
  ipcMain.handle('settings:pickOutputDir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Where should your movies go?',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: s.settings.get().outputDir ?? paths.defaultOutput,
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const next = s.settings.set({ outputDir: res.filePaths[0] });
    allowRoot(res.filePaths[0]);
    return next;
  });
  ipcMain.handle('shell:openFolder', (_e, p: unknown) => {
    const path = z.string().parse(p);
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) shell.openPath(path);
    else shell.showItemInFolder(path);
  });
  ipcMain.handle('app:version', () => app.getVersion());
}
