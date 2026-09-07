/**
 * Projects: a name plus an ordered set of videos, each with its own selection of parts.
 *   data/projects.json                 { active, projects: [{ id, name, createdAt, updatedAt, clips }] }
 *   data/projects/<id>/<stem>.json     selection of that video inside that project
 * The scan of a video (clips/<stem>/) is shared: adding an already-scanned video to a second project
 * needs no rescan. A project can be exported to / imported from a `.apexcut` file (JSON, no video).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log/main';
import type { PresetId } from '@core/presets';
import { autoToParts } from '@core/selection';
import type { Part, Segment } from '@core/types';
import { projectFileSchema, type ClipInfo, type ProjectFile, type ProjectInfo } from '@shared/ipc';
import type { Library } from './library';
import { ensureDir, paths, readJson, writeJson } from './store';

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clips: string[];
  /** sensitivity preset of the project (Sporty when absent) */
  preset?: PresetId;
}

interface ProjectsFile {
  active: string | null;
  projects: ProjectRecord[];
}

interface Selection {
  parts: Part[];
  frozen?: boolean;
}

export const DEFAULT_PROJECT_NAME = 'My rides';

const newId = (): string => randomBytes(5).toString('hex');

export class Projects {
  private state: ProjectsFile;

  constructor(private readonly library: Library) {
    const stored = readJson<ProjectsFile | null>(paths.projectsFile, null);
    this.state = stored ?? this.migrate();
    this.ensureActive();
  }

  /** First run with projects: everything in the library becomes one project, selections move along. */
  private migrate(): ProjectsFile {
    const stems = this.library.records().map((c) => c.stem);
    const p = this.blank(DEFAULT_PROJECT_NAME, stems);
    for (const stem of stems) {
      const old = join(paths.clipDir(stem), 'selection.json');
      if (existsSync(old)) {
        ensureDir(this.dir(p.id));
        renameSync(old, this.selectionFile(stem, p.id));
      }
    }
    const state = { active: p.id, projects: [p] };
    writeJson(paths.projectsFile, state);
    log.info(`projects: migrated ${stems.length} videos into “${p.name}” (${p.id})`);
    return state;
  }

  private blank(name: string, clips: string[] = []): ProjectRecord {
    const now = Date.now();
    return { id: newId(), name: this.uniqueName(name), createdAt: now, updatedAt: now, clips };
  }

  /** "Eifel Sunday" → "Eifel Sunday 2" when that name is already taken (two cards with one name confuse). */
  private uniqueName(name: string): string {
    const taken = new Set((this.state?.projects ?? []).map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  private ensureActive(): void {
    if (!this.state.projects.length) this.state.projects.push(this.blank(DEFAULT_PROJECT_NAME));
    if (!this.state.projects.some((p) => p.id === this.state.active)) {
      this.state.active = this.state.projects[0].id;
    }
    this.save();
  }

  private save(): void {
    writeJson(paths.projectsFile, this.state);
  }

  private find(id: string): ProjectRecord {
    const p = this.state.projects.find((x) => x.id === id);
    if (!p) throw new Error(`unknown project ${id}`);
    return p;
  }

  dir(id: string): string {
    return paths.projectDir(id);
  }

  get activeId(): string {
    return this.state.active as string;
  }

  get active(): ProjectRecord {
    return this.find(this.activeId);
  }

  /** Where the selection of `stem` lives inside a project (the open one by default). */
  selectionFile(stem: string, id = this.activeId): string {
    return join(this.dir(id), `${stem}.json`);
  }

  private selection(stem: string, id: string): Part[] | null {
    const f = this.selectionFile(stem, id);
    return existsSync(f) ? readJson<Selection>(f, { parts: [] }).parts : null;
  }

  private touch(p: ProjectRecord): void {
    p.updatedAt = Date.now();
    this.save();
  }

  // ---- projects

  list(): ProjectInfo[] {
    return this.state.projects.map((p) => this.info(p));
  }

  info(p: ProjectRecord): ProjectInfo {
    let nParts = 0;
    let highlightS = 0;
    let thumbStem: string | null = null;
    for (const stem of p.clips) {
      const parts = this.selection(stem, p.id) ?? [];
      const on = parts.filter((x) => x.enabled);
      nParts += on.length;
      highlightS += on.reduce((a, x) => a + x.end_s - x.start_s, 0);
      if (!thumbStem && existsSync(join(paths.clipDir(stem), 'thumb.jpg'))) thumbStem = stem;
    }
    return {
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      nClips: p.clips.length,
      nParts,
      highlightS: Math.round(highlightS),
      thumbStem,
      preset: p.preset ?? 'sporty',
    };
  }

  setPreset(preset: PresetId): void {
    const p = this.active;
    p.preset = preset;
    this.touch(p);
  }

  create(name: string): ProjectInfo {
    const p = this.blank(name.trim() || DEFAULT_PROJECT_NAME);
    this.state.projects.push(p);
    this.save();
    log.info(`projects: created “${p.name}” (${p.id})`);
    return this.info(p);
  }

  rename(id: string, name: string): void {
    const p = this.find(id);
    p.name = name.trim() || p.name;
    this.touch(p);
  }

  /** Delete a project and its selections; the scans of its videos stay for other projects. */
  remove(id: string): void {
    this.find(id);
    this.state.projects = this.state.projects.filter((p) => p.id !== id);
    rmSync(this.dir(id), { recursive: true, force: true });
    log.info(`projects: removed ${id}`);
    this.ensureActive();
  }

  open(id: string): void {
    this.find(id);
    this.state.active = id;
    this.save();
  }

  /** Every video that is in at least one project (for cache clean-up). */
  stemsInAnyProject(): Set<string> {
    return new Set(this.state.projects.flatMap((p) => p.clips));
  }

  // ---- videos of the open project

  clips(): string[] {
    return this.active.clips.filter((s) => this.library.has(s));
  }

  clipInfos(): ClipInfo[] {
    return this.clips().map((s) => this.library.info(this.library.get(s), this.selectionFile(s)));
  }

  /** Add registered videos to the open project; returns the ones that were new to it. */
  addClips(stems: string[]): string[] {
    return this.addClipsTo(this.activeId, stems);
  }

  addClipsTo(id: string, stems: string[]): string[] {
    const p = this.find(id);
    const added: string[] = [];
    for (const stem of stems) {
      if (p.clips.includes(stem) || !this.library.has(stem)) continue;
      p.clips.push(stem);
      added.push(stem);
      this.seedSelection(stem, p.id);
    }
    if (added.length) this.touch(p);
    return added;
  }

  /** An already-scanned video entering a project starts from its automatic parts. */
  private seedSelection(stem: string, id: string): void {
    const f = this.selectionFile(stem, id);
    const hl = join(paths.clipDir(stem), 'highlights.json');
    if (existsSync(f) || !existsSync(hl)) return;
    const segments = readJson<{ segments: Segment[] }>(hl, { segments: [] }).segments;
    writeJson(f, { parts: autoToParts(segments) });
  }

  removeClip(stem: string): void {
    const p = this.active;
    p.clips = p.clips.filter((s) => s !== stem);
    rmSync(this.selectionFile(stem, p.id), { force: true });
    this.touch(p);
  }

  reorder(stems: string[]): void {
    const p = this.active;
    const next = stems.filter((s) => p.clips.includes(s));
    for (const s of p.clips) if (!next.includes(s)) next.push(s);
    p.clips = next;
    this.touch(p);
  }

  // ---- export / import

  exportTo(id: string, file: string): void {
    const p = this.find(id);
    const out: ProjectFile = {
      apexcut: 1,
      name: p.name,
      exportedAt: new Date().toISOString(),
      clips: p.clips.filter((s) => this.library.has(s)).map((s) => ({ ...this.library.get(s) })),
      selections: {},
    };
    for (const stem of p.clips) {
      const f = this.selectionFile(stem, p.id);
      if (existsSync(f)) out.selections[stem] = readJson<Selection>(f, { parts: [] });
    }
    writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
    log.info(`projects: exported “${p.name}” → ${file}`);
  }

  /** Create a project from a `.apexcut` file; returns its id and the videos whose files are missing. */
  importFrom(file: string): { id: string; missing: string[] } {
    const data = projectFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    const p = this.blank(data.name, []);
    const missing: string[] = [];
    for (const c of data.clips) {
      // re-discover next to the recorded paths so a moved/renamed proxy is picked up too
      const present = [c.mp4, c.lrf].filter((x): x is string => !!x && existsSync(x));
      if (present.length) this.library.add(present);
      else this.library.register(c);
      // known from another project on this computer? then its files count, not the recorded paths
      const rec = this.library.get(c.stem);
      if (![rec.mp4, rec.lrf].some((x) => x && existsSync(x))) missing.push(c.stem);
      p.clips.push(c.stem);
    }
    this.state.projects.push(p);
    ensureDir(this.dir(p.id));
    for (const [stem, sel] of Object.entries(data.selections)) {
      if (p.clips.includes(stem)) writeJson(this.selectionFile(stem, p.id), sel);
    }
    for (const stem of p.clips) this.seedSelection(stem, p.id);
    this.save();
    log.info(
      `projects: imported “${p.name}” from ${file} (${p.clips.length} videos, ${missing.length} missing)`,
    );
    return { id: p.id, missing };
  }
}
