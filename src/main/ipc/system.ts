/**
 * The app around the editor: settings, the scan cache, updates, opening folders, the custom title
 * bar, the version, the problem report, saving a picture, restarting, and renderer logging.
 */
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  shell,
  systemPreferences,
} from 'electron';
import log from 'electron-log/main';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import pkg from '../../../package.json';
import { settingsSchema, TITLEBAR_HEIGHT, type Settings } from '@shared/ipc';
import { encoders } from '../services/media';
import { allowRoot } from '../services/protocol';
import { createReport } from '../services/report';
import { paths } from '../services/store';
import { pickPaths, sanitize } from './helpers';
import type { Services } from './services';

/** a file ApexCut itself wrote into the output folders — nothing else may be shared */
function isOwnOutput(s: Services, file: string): boolean {
  const target = resolve(file).toLowerCase();
  return (['movies', 'clips'] as const).some((sub) =>
    target.startsWith(resolve(s.settings.outputDir(sub)).toLowerCase() + sep),
  );
}

export function registerSystemIpc(s: Services): void {
  // ---- settings
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

  // ---- sharing a movie with a phone on the same network
  ipcMain.handle('share:start', (_e, file: unknown) => {
    const path = z.string().parse(file);
    // only the app's own output is ever served, never a file someone else names
    if (!isOwnOutput(s, path)) throw new Error('only movies ApexCut made can be shared');
    return s.share.start(path);
  });
  ipcMain.handle('share:stop', () => s.share.stop());
  ipcMain.handle('share:current', () => s.share.current());
  ipcMain.handle('settings:pickOutputDir', async (e) => {
    const [dir] = await pickPaths(e, {
      title: 'Where should your movies go?',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: s.settings.get().outputDir ?? paths.defaultOutput,
    });
    if (!dir) return null;
    const next = s.settings.set({ outputDir: dir });
    allowRoot(dir);
    return next;
  });

  // ---- scan cache and updates
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

  // ---- custom title bar: the renderer draws the bar, the OS draws the window buttons over it
  ipcMain.handle('window:setOverlay', (e, colorRaw: unknown, symbolRaw: unknown) => {
    const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
    const color = hex.parse(colorRaw);
    const symbolColor = hex.parse(symbolRaw);
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    win.setBackgroundColor(color);
    if (process.platform !== 'darwin')
      win.setTitleBarOverlay({ color, symbolColor, height: TITLEBAR_HEIGHT });
  });
  ipcMain.on('window:titlebarDoubleClick', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (process.platform === 'darwin') {
      const action = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string');
      if (action === 'Minimize') {
        win.minimize();
        return;
      }
    }
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });

  // ---- the app itself
  // unpackaged runs report Electron's own version; the package version is what the UI should show
  ipcMain.handle('app:version', () => (app.isPackaged ? app.getVersion() : pkg.version));
  ipcMain.handle('app:saveImage', (_e, dataRaw: unknown, nameRaw: unknown) => {
    const dataUrl = z.string().startsWith('data:image/png;base64,').parse(dataRaw);
    const name = sanitize(z.string().max(80).parse(nameRaw));
    const buf = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
    const file = join(s.settings.outputDir('movies'), `${name}.png`);
    writeFileSync(file, buf);
    clipboard.writeImage(nativeImage.createFromBuffer(buf));
    log.info('ride card saved:', file);
    return { file };
  });
  ipcMain.handle('app:report', async () => {
    const file = await createReport(s.jobs.list());
    shell.showItemInFolder(file);
    return { file };
  });
  // the error card's "Restart ApexCut": a real restart, so a broken main process comes back too
  ipcMain.on('app:relaunch', () => {
    log.info('relaunching on request');
    app.relaunch();
    app.exit(0);
  });
  ipcMain.on('app:log', (_e, level: unknown, message: unknown) => {
    const text = `[renderer] ${String(message).slice(0, 4000)}`;
    if (level === 'error') log.error(text);
    else log.warn(text);
  });
}
