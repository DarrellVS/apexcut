/**
 * The user's clips: MP4 + LRF pairs found from picked files/folders, persisted in library.json.
 * Analysis results live per clip in clips/<stem>/ (see analysis.ts).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
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

  add(inputs: string[]): string[] {
    const added: string[] = [];
    for (const rec of Library.discover(inputs)) {
      if (this.clips.has(rec.stem)) continue;
      this.clips.set(rec.stem, rec);
      added.push(rec.stem);
    }
    if (added.length) this.save();
    return added;
  }

  remove(stem: string): void {
    this.clips.delete(stem);
    this.save();
  }

  /** Reorder (insertion order of the map = order in the list and in the movie). */
  reorder(stems: string[]): void {
    const next = new Map<string, ClipRecord>();
    for (const s of stems) {
      const c = this.clips.get(s);
      if (c) next.set(s, c);
    }
    for (const [s, c] of this.clips) if (!next.has(s)) next.set(s, c);
    this.clips = next;
    this.save();
  }

  get(stem: string): ClipRecord {
    const c = this.clips.get(stem);
    if (!c) throw new Error(`unknown clip ${stem}`);
    return c;
  }

  /** Video used for analysis, filmstrip and the player: the small LRF when present. */
  proxyOf(stem: string): string {
    const c = this.get(stem);
    const p = c.lrf ?? c.mp4;
    if (!p) throw new Error(`clip ${stem} has no video file`);
    return p;
  }

  /** In user order (defaults to the order videos were added). */
  list(): ClipInfo[] {
    return [...this.clips.values()].map((c) => this.info(c));
  }

  info(c: ClipRecord): ClipInfo {
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
      const parts = readJson<{ parts: { enabled: boolean; start_s: number; end_s: number }[] }>(
        join(dir, 'selection.json'),
        { parts: [] },
      ).parts;
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
