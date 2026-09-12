/**
 * Talking to the windows. Every push from main to the renderer goes through here, so a new event is
 * one line and nothing forgets a window (there is one today, but jobs, updates and crashes all
 * broadcast the same way).
 */
import { BrowserWindow } from 'electron';

export function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}
