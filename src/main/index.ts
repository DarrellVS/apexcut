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

// same data folder in dev (unpackaged runs default to "Electron") and in the packaged app
app.setPath('userData', join(app.getPath('appData'), 'ApexCut'));

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
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('ready-to-show', () => win.show());
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
    'library:',
    services.library
      .list()
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
    const added = services.library.add(adds);
    log.info('startup add:', added);
    const todo = services.library
      .list()
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
  for (const c of services.library.list()) {
    if (c.analyzed && !existsSync(join(paths.clipDir(c.stem), 'thumb.jpg'))) {
      new ThumbnailAction()
        .execute(
          c.stem,
          services.library.proxyOf(c.stem),
          (c.durationS ?? 0) * 0.1,
          160,
          'thumb.jpg',
        )
        .catch((e) => log.warn('thumbnail backfill:', e));
    }
  }

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => log.warn('updater:', e));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
