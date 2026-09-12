/**
 * The videos of the open project (add, remove, order, relink, pick) and the songs under its movie.
 */
import { ipcMain } from 'electron';
import log from 'electron-log/main';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import type { MusicTrack } from '@shared/ipc';
import { probeDuration } from '../services/media';
import { allowRoot } from '../services/protocol';
import { AUDIO_EXT, VIDEO_FILTER, pickPaths } from './helpers';
import type { Services } from './services';

/** Songs the way the music lane wants them: probed for length, whole file selected, gentle fades. */
async function probeTracks(paths: string[]): Promise<MusicTrack[]> {
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
}

export function registerLibraryIpc(s: Services): void {
  ipcMain.handle('library:list', () => s.projects.clipInfos());
  ipcMain.handle('library:add', (_e, paths: unknown) => ({
    added: s.projects.addClips(s.library.add(z.array(z.string()).parse(paths))),
  }));
  ipcMain.handle('library:remove', (_e, stem: unknown) =>
    s.projects.removeClip(z.string().parse(stem)),
  );
  ipcMain.handle('library:reorder', (_e, stems: unknown) =>
    s.projects.reorder(z.array(z.string()).parse(stems)),
  );
  ipcMain.handle('library:inspect', (_e, paths: unknown) =>
    s.library.inspect(z.array(z.string()).parse(paths)),
  );
  ipcMain.handle('library:pick', async (e, kind: unknown) => {
    const k = z.enum(['files', 'dir']).parse(kind);
    const paths = await pickPaths(e, {
      title: k === 'files' ? 'Choose your DJI videos' : 'Choose the folder with your DJI videos',
      properties: k === 'files' ? ['openFile', 'multiSelections'] : ['openDirectory'],
      filters: k === 'files' ? VIDEO_FILTER : [],
    });
    return { paths, cancelled: !paths.length };
  });
  ipcMain.handle('library:relink', async (e, kindRaw: unknown, stemRaw: unknown) => {
    const kind = z.enum(['file', 'dir']).parse(kindRaw);
    const stem = z
      .string()
      .optional()
      .parse(stemRaw ?? undefined);
    const paths = await pickPaths(e, {
      title:
        kind === 'file'
          ? `Where is ${stem ?? 'the video'} now?`
          : 'Choose the folder your videos moved to',
      properties: kind === 'file' ? ['openFile'] : ['openDirectory'],
      filters: kind === 'file' ? VIDEO_FILTER : [],
    });
    if (!paths.length) return null;
    const out = s.library.relink(paths, kind === 'file' ? stem : undefined);
    log.info('relink:', out);
    return out;
  });

  // ---- music
  ipcMain.handle('music:pick', async (e) =>
    probeTracks(
      await pickPaths(e, {
        title: 'Choose music',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Music', extensions: AUDIO_EXT }],
      }),
    ),
  );
  ipcMain.handle('music:add', (_e, paths: unknown) =>
    probeTracks(
      z
        .array(z.string())
        .parse(paths)
        .filter((p) => AUDIO_EXT.includes(p.split('.').pop()?.toLowerCase() ?? '')),
    ),
  );
  ipcMain.handle('music:exists', (_e, p: unknown) => existsSync(z.string().parse(p)));
}
