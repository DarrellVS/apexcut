/**
 * Where things live on disk + settings persistence.
 *   %APPDATA%/apexcut/library.json      known clips
 *   %APPDATA%/apexcut/settings.json     user settings
 *   %APPDATA%/apexcut/clips/<stem>/     analysis results, filmstrip, thumbnails (shared by projects)
 *   %APPDATA%/apexcut/projects.json     projects (name, ordered videos) + which one is open
 *   %APPDATA%/apexcut/projects/<id>/    per-project selection of each video
 *   <Videos>/ApexCut/{movies,clips}     default output (changeable)
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { settingsSchema, type Settings } from '@shared/ipc';

export const paths = {
  get root(): string {
    return join(app.getPath('userData'), 'data');
  },
  get clips(): string {
    return join(this.root, 'clips');
  },
  clipDir(stem: string): string {
    return join(this.clips, stem);
  },
  get libraryFile(): string {
    return join(this.root, 'library.json');
  },
  get settingsFile(): string {
    return join(this.root, 'settings.json');
  },
  get projectsFile(): string {
    return join(this.root, 'projects.json');
  },
  projectDir(id: string): string {
    return join(this.root, 'projects', id);
  },
  get defaultOutput(): string {
    return join(app.getPath('videos'), 'ApexCut');
  },
};

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  ensureDir(join(file, '..'));
  // write-then-rename so a crash mid-write never leaves a truncated file behind
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, file);
}

export class SettingsStore {
  private cache: Settings | null = null;

  get(): Settings {
    if (!this.cache) this.cache = settingsSchema.parse(readJson(paths.settingsFile, {}));
    return this.cache;
  }

  set(patch: Partial<Settings>): Settings {
    const next = settingsSchema.parse({ ...this.get(), ...patch });
    writeJson(paths.settingsFile, next);
    this.cache = next;
    return next;
  }

  outputDir(sub: 'movies' | 'clips'): string {
    return ensureDir(join(this.get().outputDir ?? paths.defaultOutput, sub));
  }
}
