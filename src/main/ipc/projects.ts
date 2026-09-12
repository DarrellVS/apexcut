/**
 * Projects: the list, which one is open, the per-project choices (preset, pulls, transition,
 * colours, format, crop, overlay, music), import/export of a `.apexcut` file, adding videos as
 * groups, and the numbers behind the ride card.
 */
import { ipcMain } from 'electron';
import log from 'electron-log/main';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { PRESET_IDS } from '@core/presets';
import {
  FORMATS,
  gradeSchema,
  musicSettingsSchema,
  overlaySpecSchema,
  TRANSITIONS,
  type RideStats,
} from '@shared/ipc';
import { allowRoot } from '../services/protocol';
import { rideStats } from '../services/rideStats';
import { PROJECT_FILTER, pickPaths, pickSavePath, sanitize } from './helpers';
import type { Services } from './services';

export function registerProjectIpc(s: Services): void {
  ipcMain.handle('projects:list', () => s.projects.list());
  ipcMain.handle('projects:active', () => s.projects.activeId);
  ipcMain.handle('projects:open', (_e, id: unknown) => s.projects.open(z.string().parse(id)));
  ipcMain.handle('projects:create', (_e, name: unknown) =>
    s.projects.create(z.string().max(80).parse(name), s.settings.get().defaultTransition),
  );
  ipcMain.handle('projects:rename', (_e, id: unknown, name: unknown) =>
    s.projects.rename(z.string().parse(id), z.string().max(80).parse(name)),
  );
  ipcMain.handle('projects:remove', (_e, id: unknown) => s.projects.remove(z.string().parse(id)));
  ipcMain.handle('projects:archive', (_e, id: unknown, archived: unknown) =>
    s.projects.setArchived(z.string().parse(id), z.boolean().parse(archived)),
  );

  // ---- how this project's movie is made
  ipcMain.handle('projects:setTransition', (_e, t: unknown) =>
    s.projects.setTransition(z.enum(TRANSITIONS).parse(t)),
  );
  ipcMain.handle('projects:setGrade', (_e, g: unknown, id: unknown) =>
    s.projects.setGrade(gradeSchema.nullable().parse(g), z.string().optional().parse(id)),
  );
  ipcMain.handle('projects:setFormat', (_e, f: unknown) =>
    s.projects.setFormat(z.enum(FORMATS).parse(f)),
  );
  ipcMain.handle('projects:setFramePos', (_e, pos: unknown) =>
    s.projects.setFramePos(z.number().min(0).max(1).parse(pos)),
  );
  ipcMain.handle('projects:setLoudness', (_e, on: unknown) =>
    s.projects.setLoudness(z.boolean().parse(on)),
  );
  ipcMain.handle('projects:setFollow', (_e, on: unknown) =>
    s.projects.setFollow(z.boolean().parse(on)),
  );
  ipcMain.handle('projects:setOrder', (_e, order: unknown) =>
    s.projects.setOrder(z.array(z.string()).max(5000).parse(order)),
  );
  ipcMain.handle('projects:setOverlay', (_e, o: unknown) =>
    s.projects.setOverlay(overlaySpecSchema.nullable().parse(o)),
  );
  ipcMain.handle('projects:setMusic', (_e, m: unknown) => {
    const music = musicSettingsSchema.parse(m);
    for (const t of music.tracks) allowRoot(join(t.path, '..'));
    s.projects.setMusic(music);
  });

  // ---- how parts are picked: both rescore every scanned video of the project from cached signals
  ipcMain.handle('projects:setPreset', (_e, presetRaw: unknown) => {
    const preset = z.enum(PRESET_IDS).parse(presetRaw);
    s.projects.setPreset(preset);
    for (const c of s.projects.clipInfos()) {
      if (c.analyzed) s.analysis.rescore(c.stem, s.projects.scoreConfig());
    }
    log.info(`preset ${preset} applied to project ${s.projects.activeId}`);
  });
  ipcMain.handle('projects:setPulls', (_e, onRaw: unknown) => {
    const on = z.boolean().parse(onRaw);
    s.projects.setPulls(on);
    // keep each video's own sliders; only the switch changes
    for (const c of s.projects.clipInfos()) {
      if (c.analyzed)
        s.analysis.rescore(c.stem, { ...(s.analysis.configOf(c.stem) ?? {}), pulls: on });
    }
    log.info(`pulls ${on ? 'on' : 'off'} for project ${s.projects.activeId}`);
  });

  // ---- the `.apexcut` file: the videos' paths and the selections, never the video itself
  ipcMain.handle('projects:exportFile', async (e, idRaw: unknown) => {
    const id = z.string().parse(idRaw);
    const name = s.projects.list().find((p) => p.id === id)?.name ?? 'project';
    const file = await pickSavePath(e, {
      title: 'Export project',
      defaultPath: join(homedir(), 'Documents', `${sanitize(name)}.apexcut`),
      filters: PROJECT_FILTER,
    });
    if (!file) return null;
    s.projects.exportTo(id, file);
    return { file };
  });
  ipcMain.handle('projects:importFile', async (e) => {
    const [file] = await pickPaths(e, {
      title: 'Import project',
      properties: ['openFile'],
      filters: PROJECT_FILTER,
    });
    return file ? s.projects.importFrom(file) : null;
  });

  /**
   * Videos of a pick or a drop, per recording day: `name` null puts them in the open project,
   * a name makes a project of that day. Returns what was added and what still needs a scan.
   */
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

  ipcMain.handle('projects:rideStats', (): RideStats => rideStats(s.projects, s.analysis));
}
