import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import icon from '../../resources/icon.png?asset';
import type { Part } from '@core/types';
import { existsSync } from 'node:fs';
import { ThumbnailAction } from './actions/thumbs';
import { createServices, registerIpc } from './ipc';
import { installProtocol, registerScheme } from './services/protocol';
import { paths, readJson } from './services/store';
import { TITLEBAR_HEIGHT } from '@shared/ipc';

// same data folder in dev (unpackaged runs default to "Electron") and in the packaged app;
// APEXCUT_USER_DATA points a test run at its own folder (also its own single-instance lock)
app.setPath('userData', process.env.APEXCUT_USER_DATA ?? join(app.getPath('appData'), 'ApexCut'));

// one running copy at a time: a second launch focuses the existing window instead
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

log.initialize();
log.transports.file.level = 'info';
autoUpdater.logger = log;

// main-process failures: log, then let the window show the error card instead of dying silently
const tellRenderer = (kind: string, e: unknown): void => {
  const err = e instanceof Error ? e : new Error(String(e));
  log.error(`${kind}:`, err.stack ?? err.message);
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('app:fatal', { message: err.message, stack: err.stack });
  }
};
process.on('uncaughtException', (e) => tellRenderer('uncaught exception', e));
process.on('unhandledRejection', (e) => tellRenderer('unhandled rejection', e));

registerScheme();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d0d14',
    title: 'ApexCut',
    // custom title bar: the renderer draws it; the OS keeps its own min / max / close buttons on
    // top (Windows 11 snap layouts keep working), recoloured by the renderer on theme changes
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 12 } : undefined,
    titleBarOverlay:
      process.platform === 'darwin'
        ? { height: TITLEBAR_HEIGHT }
        : { color: '#0d0d14', symbolColor: '#eeeef3', height: TITLEBAR_HEIGHT },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // with a title bar overlay 'ready-to-show' does not always fire: show after the first paint either way
  let shown = false;
  const showOnce = (): void => {
    if (shown) return;
    shown = true;
    win.show();
  };
  win.on('ready-to-show', showOnce);
  win.webContents.on('did-finish-load', showOnce);
  // maximised / full screen / focus state for the title bar
  const pushState = (): void => {
    if (win.isDestroyed()) return;
    win.webContents.send('window:state', {
      maximized: win.isMaximized(),
      fullscreen: win.isFullScreen(),
      focused: win.isFocused(),
    });
  };
  win.on('maximize', pushState);
  win.on('unmaximize', pushState);
  win.on('enter-full-screen', pushState);
  win.on('leave-full-screen', pushState);
  win.on('focus', pushState);
  win.on('blur', pushState);
  win.webContents.on('did-finish-load', pushState);
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('app.apexcut');
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));

  log.info(
    'data root:',
    paths.root,
    '| exe:',
    process.execPath,
    '| argv:',
    process.argv.slice(1).join(' '),
  );
  installProtocol();
  const services = createServices();
  log.info(
    `project “${services.projects.active.name}”:`,
    services.projects
      .clipInfos()
      .map((c) => `${c.stem} ${c.nEnabled ?? '-'}/${c.nParts ?? '-'}`)
      .join(', '),
  );
  registerIpc(services);
  createWindow();

  // `ApexCut --add=<file-or-folder>`: add videos on startup and scan them (also handy for smoke tests)
  const adds = process.argv.filter((a) => a.startsWith('--add=')).map((a) => a.slice(6));
  // `ApexCut --import-legacy=<out dir of the Python prototype>`: take over its library and edited selections
  for (const dir of process.argv
    .filter((a) => a.startsWith('--import-legacy='))
    .map((a) => a.slice(16))) {
    const lib = readJson<Record<string, { mp4?: string | null; lrf?: string | null }>>(
      join(dir, 'library.json'),
      {},
    );
    for (const [stem, rec] of Object.entries(lib)) {
      adds.push(...[rec.mp4, rec.lrf].filter((p): p is string => !!p));
      const sel = readJson<{ segments?: Part[] } | null>(join(dir, stem, 'selection.json'), null);
      if (sel?.segments) {
        services.analysis.importSelection(stem, sel.segments);
        log.info(`legacy import: ${stem} — ${sel.segments.length} parts`);
      }
    }
  }
  if (adds.length) {
    const added = services.projects.addClips(services.library.add(adds));
    log.info('startup add:', added);
    const todo = services.projects
      .clipInfos()
      .filter((c) => !c.analyzed)
      .map((c) => c.stem);
    if (todo.length) {
      services.jobs.start('analyze', `Scanning ${todo.length} videos`, async (ctx) => {
        for (let i = 0; i < todo.length; i++) {
          await services.analysis.analyze(
            todo[i],
            undefined,
            ctx,
            i / todo.length,
            1 / todo.length,
          );
        }
        return { kind: 'analyze', stems: todo };
      });
    }
  }

  // backfill card thumbnails for clips analysed before thumbnails existed (e.g. legacy imports)
  for (const c of services.library.records()) {
    const meta = services.analysis.meta(c.stem);
    if (meta && !existsSync(join(paths.clipDir(c.stem), 'thumb.jpg'))) {
      new ThumbnailAction()
        .execute(c.stem, services.library.proxyOf(c.stem), meta.durationS * 0.1, 160, 'thumb.jpg')
        .catch((e) => log.warn('thumbnail backfill:', e));
    }
  }

  // check for a new version a few seconds after start; the renderer shows a banner when it is ready
  setTimeout(() => services.updater.check().catch((e) => log.warn('updater:', e)), 4000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
