/**
 * Storage: how much the scan cache (clips/<stem>/) takes, which scans belong to no project any
 * more, and cleaning those up. Library entries stay — re-adding a video just needs a rescan.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log/main';
import type { StorageInfo } from '@shared/ipc';
import type { Jobs } from './jobs';
import type { Projects } from './projects';
import { paths } from './store';

function dirSize(dir: string): number {
  let total = 0;
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else total += st.size;
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

export class Storage {
  constructor(
    private readonly projects: Projects,
    private readonly jobs: Jobs,
  ) {}

  private scannedStems(): string[] {
    if (!existsSync(paths.clips)) return [];
    return readdirSync(paths.clips).filter((s) =>
      existsSync(join(paths.clipDir(s), 'signals.json')),
    );
  }

  private unusedStems(): string[] {
    const used = this.projects.stemsInAnyProject();
    return this.scannedStems().filter((s) => !used.has(s));
  }

  info(): StorageInfo {
    const unused = this.unusedStems();
    return {
      dataRoot: paths.root,
      cacheBytes: dirSize(paths.clips),
      unusedBytes: unused.reduce((a, s) => a + dirSize(paths.clipDir(s)), 0),
      nScanned: this.scannedStems().length,
      unused,
    };
  }

  /** Delete the scan cache of videos that are in no project. Refuses while a scan is running. */
  cleanup(): { removed: string[]; freedBytes: number } {
    if (this.jobs.hasRunning('analyze'))
      throw new Error('A scan is running — try again when it is done.');
    const removed: string[] = [];
    let freedBytes = 0;
    for (const stem of this.unusedStems()) {
      const dir = paths.clipDir(stem);
      freedBytes += dirSize(dir);
      rmSync(dir, { recursive: true, force: true });
      removed.push(stem);
    }
    log.info(`storage: cleaned ${removed.length} scans, ${Math.round(freedBytes / 1e6)} MB`);
    return { removed, freedBytes };
  }
}
