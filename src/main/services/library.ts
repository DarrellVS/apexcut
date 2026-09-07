/**
 * Registry of every video the app knows: MP4 + LRF pairs found from picked files/folders, persisted
 * in library.json. Which videos belong to which project (and in what order) lives in projects.ts;
 * analysis results live per clip in clips/<stem>/ (analysis.ts) and are shared between projects.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { autoToParts } from '@core/selection';
import type { Part, Segment } from '@core/types';
import type { ClipInfo } from '@shared/ipc';
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
