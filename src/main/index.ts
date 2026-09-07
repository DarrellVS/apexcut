import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import icon from '../../resources/icon.png?asset';
import { createServices, registerIpc } from './ipc';
import { installProtocol, registerScheme } from './services/protocol';

// same data folder in dev (unpackaged runs default to "Electron") and in the packaged app
app.setPath('userData', join(app.getPath('appData'), 'ApexCut'));

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

  installProtocol();
  const services = createServices();
  registerIpc(services);
  createWindow();

  // `ApexCut --add=<file-or-folder>`: add videos on startup and scan them (also handy for smoke tests)
  const adds = process.argv.filter((a) => a.startsWith('--add=')).map((a) => a.slice(6));
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
