/**
 * Registry of every video the app knows: MP4 + LRF pairs found from picked files/folders, persisted
 * in library.json. Which videos belong to which project (and in what order) lives in projects.ts;
 * analysis results live per clip in clips/<stem>/ (analysis.ts) and are shared between projects.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { autoToParts } from '@core/selection';
import type { Part, Segment } from '@core/types';
import type { ClipInfo, ImportGroup } from '@shared/ipc';
import { paths, readJson, writeJson } from './store';
import { mediaUrl } from './protocol';

const VIDEO_EXT = new Set(['.mp4', '.mov']);
const PROXY_EXT = new Set(['.lrf']);

export interface ClipRecord {
  stem: string;
  mp4: string | null;
  lrf: string | null;
}

export interface ClipMeta {
  stem: string;
  durationS: number;
  fps: number;
  width: number;
  height: number;
  proxyWidth: number;
  proxyHeight: number;
  model?: string;
  firmware?: string;
  timecode?: string | null;
  sourceKbps?: number | null;
  tenBit?: boolean;
}

export class Library {
  private clips = new Map<string, ClipRecord>();

  constructor() {
    for (const c of readJson<ClipRecord[]>(paths.libraryFile, [])) this.clips.set(c.stem, c);
  }

  private save(): void {
    writeJson(paths.libraryFile, [...this.clips.values()]);
  }

  /** Pair MP4/LRF files by stem from files and/or folders (non-recursive, like the camera's DCIM layout). */
  static discover(inputs: string[]): ClipRecord[] {
    const byStem = new Map<string, ClipRecord>();
    const consider = (file: string): void => {
      const ext = extname(file).toLowerCase();
      if (!VIDEO_EXT.has(ext) && !PROXY_EXT.has(ext)) return;
      const stem = basename(file, extname(file));
      const rec = byStem.get(stem) ?? { stem, mp4: null, lrf: null };
      if (VIDEO_EXT.has(ext)) rec.mp4 = file;
      else rec.lrf = file;
      byStem.set(stem, rec);
    };
    for (const input of inputs) {
      if (!existsSync(input)) continue;
      if (statSync(input).isDirectory()) {
        for (const f of readdirSync(input)) consider(join(input, f));
      } else {
        consider(input);
        // pick up the sibling proxy/original next to a single picked file
        const dir = join(input, '..');
        const stem = basename(input, extname(input));
        for (const ext of ['.LRF', '.lrf', '.MP4', '.mp4']) {
          const sib = join(dir, stem + ext);
          if (sib !== input && existsSync(sib)) consider(sib);
        }
      }
    }
    return [...byStem.values()];
  }

  /** Recording day of a video ("YYYY-MM-DD") from the DJI file name, else the file's mtime. */
  static dayOf(rec: ClipRecord): string {
    const m = /_(\d{4})(\d{2})(\d{2})\d{6}_/.exec(rec.stem);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const file = rec.mp4 ?? rec.lrf;
    const d = file && existsSync(file) ? statSync(file).mtime : new Date();
    return d.toISOString().slice(0, 10);
  }

  /** Look at picked files/folders without adding anything: the videos found, grouped per day. */
  inspect(inputs: string[]): ImportGroup[] {
    const byDay = new Map<string, ImportGroup>();
    for (const rec of Library.discover(inputs)) {
      const day = Library.dayOf(rec);
      const g = byDay.get(day) ?? { day, stems: [], paths: [], known: 0 };
      g.stems.push(rec.stem);
      g.paths.push(...[rec.mp4, rec.lrf].filter((p): p is string => !!p));
      if (this.clips.has(rec.stem)) g.known++;
      byDay.set(day, g);
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  /** Register the videos found in `inputs`; returns every stem found (known ones included). */
  add(inputs: string[]): string[] {
    const found = Library.discover(inputs);
    for (const rec of found) this.register(rec);
    return found.map((r) => r.stem);
  }

  /** Register a record directly (project import); known paths are only filled in, never replaced. */
  register(rec: ClipRecord): void {
    const cur = this.clips.get(rec.stem);
    if (cur) {
      let changed = false;
      for (const k of ['mp4', 'lrf'] as const) {
        if (!cur[k] && rec[k]) {
          cur[k] = rec[k];
          changed = true;
        }
      }
      if (changed) this.save();
      return;
    }
    this.clips.set(rec.stem, { ...rec });
    this.save();
  }

  has(stem: string): boolean {
    return this.clips.has(stem);
  }

  /** Point a known video at files that moved (same stem); the scan and all picks stay valid. */
  setPaths(stem: string, rec: Pick<ClipRecord, 'mp4' | 'lrf'>): void {
    const cur = this.get(stem);
    cur.mp4 = rec.mp4 ?? cur.mp4;
    cur.lrf = rec.lrf ?? cur.lrf;
    this.save();
  }

  /** Does every recorded file of this video still exist? */
  isPresent(stem: string): boolean {
    const c = this.get(stem);
    const files = [c.mp4, c.lrf].filter((p): p is string => !!p);
    return files.length > 0 && files.every((p) => existsSync(p));
  }

  /**
   * Relink missing videos from picked files/folders: anything discovered whose stem is a known
   * video that is missing gets the new paths. Returns the stems fixed and, when a single file was
   * picked for a specific video but belongs to another stem, that other stem.
   */
  relink(inputs: string[], only?: string): { relinked: string[]; mismatch?: string } {
    const found = Library.discover(inputs);
    const relinked: string[] = [];
    for (const rec of found) {
      if (only && rec.stem !== only) continue;
      if (!this.clips.has(rec.stem) || this.isPresent(rec.stem)) continue;
      this.setPaths(rec.stem, rec);
      relinked.push(rec.stem);
    }
    const mismatch = only && !relinked.length && found.length === 1 ? found[0].stem : undefined;
    return { relinked, mismatch };
  }

  get(stem: string): ClipRecord {
    const c = this.clips.get(stem);
    if (!c) throw new Error(`unknown clip ${stem}`);
    return c;
  }

  records(): ClipRecord[] {
    return [...this.clips.values()];
  }

  /** Video used for analysis, filmstrip and the player: the small LRF when present. */
  proxyOf(stem: string): string {
    const c = this.get(stem);
    const p = c.lrf ?? c.mp4;
    if (!p) throw new Error(`clip ${stem} has no video file`);
    return p;
  }

  /** Card info for one video; `selectionFile` is the project's selection for it. */
  info(c: ClipRecord, selectionFile: string): ClipInfo {
    const dir = paths.clipDir(c.stem);
    const meta = readJson<ClipMeta | null>(join(dir, 'clip.json'), null);
    const analyzed = existsSync(join(dir, 'signals.json')) && meta !== null;
    const info: ClipInfo = {
      stem: c.stem,
      mp4: c.mp4,
      lrf: c.lrf,
      exists: [c.mp4, c.lrf].filter(Boolean).every((p) => existsSync(p as string)),
      analyzed,
    };
    if (meta) {
      info.durationS = meta.durationS;
      info.fps = meta.fps;
      info.width = meta.width;
      info.height = meta.height;
      info.model = meta.model;
    }
    if (analyzed) {
      const parts = existsSync(selectionFile)
        ? readJson<{ parts: Part[] }>(selectionFile, { parts: [] }).parts
        : autoToParts(
            readJson<{ segments: Segment[] }>(join(dir, 'highlights.json'), { segments: [] })
              .segments,
          );
      info.nParts = parts.length;
      info.nEnabled = parts.filter((p) => p.enabled).length;
      info.highlightS =
        Math.round(
          parts.filter((p) => p.enabled).reduce((a, p) => a + p.end_s - p.start_s, 0) * 10,
        ) / 10;
      info.proxyUrl = mediaUrl('proxy', c.stem);
    }
    return info;
  }
}
