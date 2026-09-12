/**
 * The data that crosses the bridge as plain objects: videos, projects, the timeline payload, jobs,
 * and the app's own state. Anything the renderer *sends* is validated by a zod schema
 * (schemas.ts); what main sends back is described here.
 */
import { z } from 'zod';
import type { Grade } from '@core/grade';
import { OVERLAY_CORNERS, OVERLAY_SIZES, OVERLAY_STYLES } from '@core/overlay';
import type { PresetId } from '@core/presets';
import type { ScoreConfig, Part, Segment } from '@core/types';
import { FORMATS, TRANSITIONS, type ExportFormat, type Transition } from './movie';

export interface ClipInfo {
  stem: string;
  mp4: string | null;
  lrf: string | null;
  exists: boolean;
  analyzed: boolean;
  durationS?: number;
  fps?: number;
  width?: number;
  height?: number;
  model?: string;
  nParts?: number;
  nEnabled?: number;
  highlightS?: number;
  /** apexcut://media URL of the proxy video */
  proxyUrl?: string;
}

/** Videos found in a pick/drop, grouped per recording day (before anything is added). */
export interface ImportGroup {
  /** "YYYY-MM-DD" */
  day: string;
  stems: string[];
  /** every file (MP4 + LRF) of those videos */
  paths: string[];
  /** how many of them the app already knows */
  known: number;
}

/** A song under the movie: a file, the piece of it that plays (in/out), its own gain and fades. */
export const musicTrackSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  durationS: z.number().nonnegative(),
  inS: z.number().nonnegative(),
  outS: z.number().positive(),
  gain: z.number().min(0).max(1).default(1),
  fadeInS: z.number().min(0).max(10).default(1),
  fadeOutS: z.number().min(0).max(10).default(2),
});
export type MusicTrack = z.infer<typeof musicTrackSchema>;

/** The music lane of a project: songs back to back plus the mix levels. */
export const musicSettingsSchema = z.object({
  tracks: z.array(musicTrackSchema).default([]),
  /** overall music level 0..1 */
  musicGain: z.number().min(0).max(1).default(0.8),
  /** original (engine/wind) audio level 0..1 while music plays */
  originalGain: z.number().min(0).max(1).default(0.35),
});
export type MusicSettings = z.infer<typeof musicSettingsSchema>;
export const DEFAULT_MUSIC: MusicSettings = { tracks: [], musicGain: 0.8, originalGain: 0.35 };

/** Telemetry overlay choice of a project (null = off). */
export const overlaySpecSchema = z.object({
  style: z.enum(OVERLAY_STYLES),
  corner: z.enum(OVERLAY_CORNERS),
  size: z.enum(OVERLAY_SIZES),
});
export type OverlaySpecDto = z.infer<typeof overlaySpecSchema>;

/** The numbers of a whole project (all its videos), for the ride card. */
export interface RideStats {
  name: string;
  /** "YYYY-MM-DD" of the first video, or null */
  day: string | null;
  nVideos: number;
  nParts: number;
  nCorners: number;
  /** seconds of enabled parts */
  movieS: number;
  maxLeanDeg: number;
  maxBrakeG: number;
  /** start of the 60 s window with the most leaning, and the share of that minute spent leaning */
  twistyStem: string | null;
  twistyT: number;
  twistyPct: number;
  /** the three best parts: video + a moment inside them, for thumbnails */
  top: { stem: string; tS: number; reden: string; maxLeanDeg: number }[];
}

/** A project: a name plus an ordered set of videos with their own selections. */
export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nClips: number;
  nParts: number;
  /** total seconds of selected parts */
  highlightS: number;
  /** stem of the first analysed video (for the card thumbnail) */
  thumbStem: string | null;
  /** sensitivity preset (see core/presets.ts) */
  preset: PresetId;
  /** also count straight-line acceleration pulls */
  pulls: boolean;
  archived: boolean;
  /** how parts are joined in this project's movie */
  transition: Transition;
  music: MusicSettings;
  /** telemetry overlay in the export, null when off */
  overlay: OverlaySpecDto | null;
  /** the movie's colours, null = as recorded */
  grade: Grade | null;
  /** shape of this movie; null = the app's last choice (`settings.lastFormat`) */
  format: ExportFormat | null;
  /** where the crop window sits on the cropped axis (0..1); null = the app's last choice */
  framePos: number | null;
  /** even the volume of the movie out when it is made */
  loudness: boolean;
  /** vertical movies: the crop window leans into the corners while the movie is made */
  follow: boolean;
  /**
   * The order the parts play in, as `"<video>:<part id>"` keys. Empty = the natural order (the
   * videos in the order of the ride, each part after the one before it). A part that is not in the
   * list plays after the ones that are, in its natural place.
   */
  order: string[];
}

export interface TimelinePayload {
  /** 10 Hz signals for the timeline lanes */
  data: Record<string, (number | null)[]>;
  threshold: number;
  config: ScoreConfig;
  parts: Part[];
  auto: Segment[];
  durationS: number;
}

export type JobKind = 'analyze' | 'export' | 'extract';
export type JobStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface JobState {
  id: string;
  kind: JobKind;
  label: string;
  status: JobStatus;
  progress: number;
  message: string;
  startedAt: number;
  result: JobResult | null;
  error: string | null;
}

/** one video of a scan that could not be read; the others were still scanned */
export interface ScanFailure {
  stem: string;
  error: string;
}

export type JobResult =
  | { kind: 'analyze'; stems: string[]; failed?: ScanFailure[] }
  | { kind: 'export'; file: string; url: string; sizeMb: number }
  | { kind: 'extract'; folder: string; files: string[] };

/** height of the custom title bar in CSS px; the native window buttons are drawn at this height too */
export const TITLEBAR_HEIGHT = 40;

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
  theme: themeSchema.default('system'),
  outputDir: z.string().nullable().default(null),
  lastFormat: z.enum(FORMATS).default('16x9'),
  lastFramePos: z.number().min(0).max(1).default(0.5),
  lastName: z.string().default('my-ride'),
  /** the three-step tour has been shown (or skipped) */
  tourSeen: z.boolean().default(false),
  /** part edges snap to auto boundaries, score valleys, other parts and whole seconds while dragging */
  snapping: z.boolean().default(false),
  /** transition new projects start with */
  defaultTransition: z.enum(TRANSITIONS).default('crossfade'),
});
export type Settings = z.infer<typeof settingsSchema>;

/** Auto-update state as shown in the banner and in Settings → Updates & about. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'disabled' }
  | { state: 'checking' }
  | { state: 'uptodate'; checkedAt: number }
  | { state: 'downloading'; version?: string; percent: number }
  | { state: 'ready'; version: string; notes: string }
  | { state: 'error'; message: string };

/** Settings → Storage: size of the scan cache and which scans no project uses any more. */
/** a movie being handed to a phone over the local network (main/services/share.ts) */
export interface ShareState {
  /** the address to open on the phone */
  url: string;
  /** the movie being shared, and its file name */
  file: string;
  name: string;
  /** when the share closes itself (epoch ms) */
  until: number;
}

export interface StorageInfo {
  dataRoot: string;
  cacheBytes: number;
  unusedBytes: number;
  nScanned: number;
  unused: string[];
}

export interface EncoderInfo {
  ffmpegVersion: string;
  hevcEncoder: string;
  gpuDecode: boolean;
}
