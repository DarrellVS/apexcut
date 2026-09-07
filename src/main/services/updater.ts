/**
 * Auto-update (electron-updater → GitHub Releases) with a state the renderer can show: checking,
 * up to date, downloading x %, ready to install, or a plain error. Dev builds never check.
 */
import { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log/main';
import type { UpdateStatus } from '@shared/ipc';

export class Updater {
  status: UpdateStatus = { state: 'idle' };
  private wired = false;

  constructor(private readonly enabled: boolean) {}

  private set(next: UpdateStatus): void {
    this.status = next;
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('updater:status', next);
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-not-available', () =>
      this.set({ state: 'uptodate', checkedAt: Date.now() }),
    );
    autoUpdater.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0 }),
    );
    autoUpdater.on('download-progress', (p) =>
      this.set({
        state: 'downloading',
        version: this.status.state === 'downloading' ? this.status.version : undefined,
        percent: Math.round(p.percent),
      }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.set({
        state: 'ready',
        version: info.version,
        notes: notesToText(info.releaseNotes),
      }),
    );
    autoUpdater.on('error', (e) => {
      log.warn('updater:', e.message);
      this.set({ state: 'error', message: friendlyUpdaterError(e.message) });
    });
  }

  /** Check now; resolves when the check has been started (the result arrives as status events). */
  async check(): Promise<UpdateStatus> {
    if (!this.enabled) {
      this.set({ state: 'disabled' });
      return this.status;
    }
    this.wire();
    if (this.status.state === 'downloading' || this.status.state === 'ready') return this.status;
    await autoUpdater.checkForUpdates().catch(() => undefined);
    return this.status;
  }

  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall();
  }
}

function notesToText(notes: unknown): string {
  const raw = Array.isArray(notes)
    ? notes.map((n: { note?: string | null }) => n.note ?? '').join('\n')
    : typeof notes === 'string'
      ? notes
      : '';
  // GitHub gives HTML; keep the words
  return raw
    .replace(/<li>/g, '• ')
    .replace(/<\/(p|li|h\d|ul)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function friendlyUpdaterError(msg: string): string {
  if (/ENOTFOUND|ECONN|ETIMEDOUT|net::|network/i.test(msg))
    return 'Could not reach the update server. Check your internet connection and try again.';
  if (/404/.test(msg)) return 'No releases found yet.';
  return 'Checking for updates failed. Try again later.';
}
