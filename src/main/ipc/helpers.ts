/**
 * Small helpers every IPC module needs: the window a call came from, the two file dialogs with the
 * filters ApexCut uses, and the naming of what it writes.
 */
import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';

/** the window that made the call, so a dialog is modal to it */
export const winOf = (e: IpcMainInvokeEvent): BrowserWindow =>
  BrowserWindow.fromWebContents(e.sender) as BrowserWindow;

export const VIDEO_FILTER = [
  { name: 'Camera video', extensions: ['MP4', 'mp4', 'MOV', 'mov', 'LRF', 'lrf', 'LRV', 'lrv'] },
];
export const PROJECT_FILTER = [{ name: 'ApexCut project', extensions: ['apexcut'] }];
export const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'];

/** Open dialog; returns the picked paths, empty when cancelled. */
export async function pickPaths(
  e: IpcMainInvokeEvent,
  options: Electron.OpenDialogOptions,
): Promise<string[]> {
  const res = await dialog.showOpenDialog(winOf(e), options);
  return res.canceled ? [] : res.filePaths;
}

/** Save dialog; returns the chosen file or null when cancelled. */
export async function pickSavePath(
  e: IpcMainInvokeEvent,
  options: Electron.SaveDialogOptions,
): Promise<string | null> {
  const res = await dialog.showSaveDialog(winOf(e), options);
  return res.canceled || !res.filePath ? null : res.filePath;
}

/** Safe file name: drop characters Windows rejects plus control characters. */
export const sanitize = (name: string): string =>
  [...name]
    .filter((c) => c.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(c))
    .join('')
    .trim() || 'movie';

/** "20260912_174530" — the stamp that keeps two exports of the same name apart. */
export const stamp = (): string =>
  new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
