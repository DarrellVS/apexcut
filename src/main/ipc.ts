/**
 * IPC handlers: thin — validate input, call a service, return. Long work becomes a job.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { z } from 'zod';
import log from 'electron-log/main';
import pkg from '../../package.json';
import { edl } from '@core/edl';
import { PRESET_IDS, PRESETS } from '@core/presets';
import type { Part, ScoreConfig } from '@core/types';
import {
  exportRequestSchema,
  musicSettingsSchema,
  overlaySpecSchema,
  partSchema,
  settingsSchema,
  TRANSITIONS,
  type JobState,
  type MusicTrack,
  type Settings,
} from '@shared/ipc';
import { compileMovie, cutAll, fileSizeMb, prepareItems, type CutItem } from './actions/cut';
import type { OverlayJob, OverlaySprites } from './actions/overlay';
import { resample } from '@core/overlay';
import { REASON_LABEL, reasonOf } from '@core/selection';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { probeDuration } from './services/media';
import { FilmstripAction } from './actions/thumbs';
import { Analysis } from './services/analysis';
import { Jobs } from './services/jobs';
import { Library } from './services/library';
import { Projects } from './services/projects';
import { createReport } from './services/report';
import { Storage } from './services/storage';
import { Updater } from './services/updater';
import { encoders } from './services/media';
import { allowRoot, mediaUrl, registerResolver } from './services/protocol';
import { paths, SettingsStore } from './services/store';

export interface Services {
  library: Library;
  projects: Projects;
  analysis: Analysis;
  jobs: Jobs;
  settings: SettingsStore;
  updater: Updater;
  storage: Storage;
}

export function createServices(): Services {
  const library = new Library();
  const projects = new Projects(library);
  const jobs = new Jobs();
  return {
    library,
    projects,
    analysis: new Analysis(library, (stem) => projects.selectionFile(stem)),
    jobs,
    settings: new SettingsStore(),
    updater: new Updater(app.isPackaged),
    storage: new Storage(projects, jobs),
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
  // songs live wherever the user keeps them: the path travels base64url-encoded, its folder is allowed
  registerResolver('music', ([enc]) =>
    enc ? Buffer.from(enc, 'base64url').toString('utf8') : null,
  );
  for (const t of s.projects.list().flatMap((p) => p.music.tracks)) allowRoot(join(t.path, '..'));

  // ---- projects
  const projectFilter = [{ name: 'ApexCut project', extensions: ['apexcut'] }];
  ipcMain.handle('projects:list', () => s.projects.list());
  ipcMain.handle('projects:active', () => s.projects.activeId);
  ipcMain.handle('projects:open', (_e, id: unknown) => s.projects.open(z.string().parse(id)));
  ipcMain.handle('projects:create', (_e, name: unknown) =>
    s.projects.create(z.string().max(80).parse(name), s.settings.get().defaultTransition),
  );
  ipcMain.handle('projects:setTransition', (_e, t: unknown) =>
    s.projects.setTransition(z.enum(TRANSITIONS).parse(t)),
  );
  ipcMain.handle('projects:setOverlay', (_e, o: unknown) =>
    s.projects.setOverlay(overlaySpecSchema.nullable().parse(o)),
  );
  ipcMain.handle('projects:setMusic', (_e, m: unknown) => {
    const music = musicSettingsSchema.parse(m);
    for (const t of music.tracks) allowRoot(join(t.path, '..'));
    s.projects.setMusic(music);
  });

  // ---- music files
  const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'];
  const probeTracks = async (paths: string[]): Promise<MusicTrack[]> => {
    const out: MusicTrack[] = [];
    for (const p of paths) {
      if (!existsSync(p)) continue;
      const duration = await probeDuration(p);
      if (!duration) continue;
      allowRoot(join(p, '..'));
      out.push({
        id: Math.random().toString(36).slice(2, 10),
        path: p,
        name: basename(p).replace(/\.[^.]+$/, ''),
        durationS: Math.round(duration * 10) / 10,
        inS: 0,
        outS: Math.round(duration * 10) / 10,
        gain: 1,
        fadeInS: 1,
        fadeOutS: 2,
      });
    }
    return out;
  };
  ipcMain.handle('music:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Choose music',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Music', extensions: AUDIO_EXT }],
    });
    return res.canceled ? [] : probeTracks(res.filePaths);
  });
  ipcMain.handle('music:add', (_e, paths: unknown) =>
    probeTracks(
      z
        .array(z.string())
        .parse(paths)
        .filter((p) => AUDIO_EXT.includes(p.split('.').pop()?.toLowerCase() ?? '')),
    ),
  );
  ipcMain.handle('music:exists', (_e, p: unknown) => existsSync(z.string().parse(p)));
  ipcMain.handle('projects:rename', (_e, id: unknown, name: unknown) =>
    s.projects.rename(z.string().parse(id), z.string().max(80).parse(name)),
  );
  ipcMain.handle('projects:remove', (_e, id: unknown) => s.projects.remove(z.string().parse(id)));
  ipcMain.handle('projects:exportFile', async (e, idRaw: unknown) => {
    const id = z.string().parse(idRaw);
    const name = s.projects.list().find((p) => p.id === id)?.name ?? 'project';
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showSaveDialog(win as BrowserWindow, {
      title: 'Export project',
      defaultPath: join(homedir(), 'Documents', `${sanitize(name)}.apexcut`),
      filters: projectFilter,
    });
    if (res.canceled || !res.filePath) return null;
    s.projects.exportTo(id, res.filePath);
    return { file: res.filePath };
  });
  ipcMain.handle('projects:importFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Import project',
      properties: ['openFile'],
      filters: projectFilter,
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return s.projects.importFrom(res.filePaths[0]);
  });

  ipcMain.handle('projects:archive', (_e, id: unknown, archived: unknown) =>
    s.projects.setArchived(z.string().parse(id), z.boolean().parse(archived)),
  );
  ipcMain.handle('projects:setPreset', (_e, presetRaw: unknown) => {
    const preset = z.enum(PRESET_IDS).parse(presetRaw);
    s.projects.setPreset(preset);
    // cached signals only, so this is quick even for a dozen videos
    for (const c of s.projects.clipInfos()) {
      if (c.analyzed) s.analysis.rescore(c.stem, PRESETS[preset].config);
    }
    log.info(`preset ${preset} applied to project ${s.projects.activeId}`);
  });

  // ---- library (videos of the open project)
  const addToProject = (inputs: string[]): string[] => s.projects.addClips(s.library.add(inputs));
  ipcMain.handle('library:list', () => s.projects.clipInfos());
  ipcMain.handle('library:add', (_e, paths: unknown) => ({
    added: addToProject(z.array(z.string()).parse(paths)),
  }));
  ipcMain.handle('library:remove', (_e, stem: unknown) =>
    s.projects.removeClip(z.string().parse(stem)),
  );
  ipcMain.handle('library:reorder', (_e, stems: unknown) =>
    s.projects.reorder(z.array(z.string()).parse(stems)),
  );
  ipcMain.handle('library:relink', async (e, kindRaw: unknown, stemRaw: unknown) => {
    const kind = z.enum(['file', 'dir']).parse(kindRaw);
    const stem = z
      .string()
      .optional()
      .parse(stemRaw ?? undefined);
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title:
        kind === 'file'
          ? `Where is ${stem ?? 'the video'} now?`
          : 'Choose the folder your videos moved to',
      properties: kind === 'file' ? ['openFile'] : ['openDirectory'],
      filters:
        kind === 'file' ? [{ name: 'DJI video', extensions: ['MP4', 'mp4', 'LRF', 'lrf'] }] : [],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const out = s.library.relink(res.filePaths, kind === 'file' ? stem : undefined);
    log.info('relink:', out);
    return out;
  });
  ipcMain.handle('library:pick', async (e, kind: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const k = z.enum(['files', 'dir']).parse(kind);
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: k === 'files' ? 'Choose your DJI videos' : 'Choose the folder with your DJI videos',
      properties: k === 'files' ? ['openFile', 'multiSelections'] : ['openDirectory'],
      filters:
        k === 'files' ? [{ name: 'DJI video', extensions: ['MP4', 'mp4', 'LRF', 'lrf'] }] : [],
    });
    if (res.canceled) return { paths: [], cancelled: true };
    return { paths: res.filePaths, cancelled: false };
  });
  ipcMain.handle('library:inspect', (_e, paths: unknown) =>
    s.library.inspect(z.array(z.string()).parse(paths)),
  );
  ipcMain.handle('projects:addGroups', (_e, raw: unknown) => {
    const groups = z
      .array(z.object({ name: z.string().max(80).nullable(), paths: z.array(z.string()) }))
      .parse(raw);
    const stems: string[] = [];
    let firstProject: string | null = null;
    for (const g of groups) {
      const found = s.library.add(g.paths);
      if (g.name === null) stems.push(...s.projects.addClips(found));
      else {
        const p = s.projects.create(g.name);
        firstProject ??= p.id;
        stems.push(...s.projects.addClipsTo(p.id, found));
      }
    }
    const unique = [...new Set(stems)];
    const toScan = unique.filter((stem) => !s.analysis.meta(stem));
    log.info(
      `addGroups: ${groups.length} groups, ${unique.length} videos, ${toScan.length} to scan`,
    );
    return { stems: unique, toScan, firstProject };
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
    // telemetry overlay: sprites to disk once, per part the 30 Hz samples at the video's fps
    let overlayFor: ((it: (typeof req.items)[number]) => OverlayJob | undefined) | null = null;
    if (req.overlay) {
      const dir = mkdtempSync(join(tmpdir(), 'apexcut-overlay-'));
      const sprites = Object.fromEntries(
        Object.entries(req.overlay.sprites).map(([k, dataUrl]) => {
          const file = join(dir, `${k}.png`);
          writeFileSync(file, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
          return [k, file];
        }),
      ) as unknown as OverlaySprites;
      const spec = req.overlay.spec;
      overlayFor = (it) => {
        const sig = s.analysis.signals(it.stem);
        const meta = s.analysis.meta(it.stem);
        if (!sig || !meta) return undefined;
        const fps = meta.fps || 30;
        return {
          spec,
          sprites,
          fps,
          samples: resample(sig.imuT, sig.imu.leanDeg, sig.imu.aLonG, it.startS, it.endS, fps),
          label: it.reden
            ? (REASON_LABEL[reasonOf({ reden: it.reden } as never)] ?? 'lean')
            : 'lean',
        };
      };
    }
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
        fade: 0,
        name: `${it.stem}_${mm}m${ss}s_${label}_${k}.mp4`,
        overlay: overlayFor?.(it),
      };
    });
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
    return s.jobs.start('export', `Movie “${sanitize(req.name)}” (${total} s)`, async (ctx) => {
      await compileMovie(items, out, ctx, req.transition, req.cards, req.music);
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
  ipcMain.handle('settings:set', (_e, patch: unknown) => {
    // `.partial()` still fills defaults for absent keys, which would reset every other setting
    // (the quick tour came back after changing the theme) — keep only the keys that were sent
    const raw = z.record(z.string(), z.unknown()).parse(patch);
    const parsed = settingsSchema.partial().parse(raw) as Record<string, unknown>;
    const clean = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in raw));
    return s.settings.set(clean as Partial<Settings>);
  });
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
  ipcMain.handle('storage:info', () => s.storage.info());
  ipcMain.handle('storage:cleanup', () => s.storage.cleanup());
  ipcMain.handle('updater:status', () => s.updater.status);
  ipcMain.handle('updater:check', () => s.updater.check());
  ipcMain.handle('updater:install', () => s.updater.install());
  ipcMain.handle('shell:openFolder', (_e, p: unknown) => {
    const path = z.string().parse(p);
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) shell.openPath(path);
    else shell.showItemInFolder(path);
  });
  // unpackaged runs report Electron's own version; the package version is what the UI should show
  ipcMain.handle('app:version', () => (app.isPackaged ? app.getVersion() : pkg.version));
  ipcMain.handle('app:report', async () => {
    const file = await createReport(s.jobs.list());
    shell.showItemInFolder(file);
    return { file };
  });
  ipcMain.on('app:log', (_e, level: unknown, message: unknown) => {
    const text = `[renderer] ${String(message).slice(0, 4000)}`;
    if (level === 'error') log.error(text);
    else log.warn(text);
  });
}
