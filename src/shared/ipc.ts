/**
 * IPC contract shared by main, preload and renderer. Zod schemas validate everything that crosses
 * the bridge from the renderer; the inferred types are the single source of truth.
 */
import { z } from 'zod';
import { OVERLAY_CORNERS, OVERLAY_SIZES, OVERLAY_STYLES } from '@core/overlay';
import type { PresetId } from '@core/presets';
import type { Part, ScoreConfig, Segment } from '@core/types';

export const FORMATS = ['original', '16x9', '4x3', '9x16'] as const;
export type ExportFormat = (typeof FORMATS)[number];

/** How parts are joined in the movie (see actions/cut.ts). */
export const TRANSITIONS = ['crossfade', 'cut', 'dip'] as const;
export type Transition = (typeof TRANSITIONS)[number];
export const TRANSITION_LABEL: Record<Transition, { label: string; hint: string }> = {
  crossfade: { label: 'Crossfade', hint: 'parts blend into each other (½ s)' },
  cut: { label: 'Cut', hint: 'straight from one part to the next' },
  dip: { label: 'Dip to black', hint: 'a short fade out and in between parts' },
};

/** Crop windows for a square source; `pos` (0..1) slides along the cropped axis. */
export const FORMAT_SPEC: Record<ExportFormat, { w: number; h: number } | null> = {
  original: null,
  '16x9': { w: 3840, h: 2160 },
  '4x3': { w: 3840, h: 2880 },
  '9x16': { w: 2160, h: 3840 },
};

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

export type JobResult =
  | { kind: 'analyze'; stems: string[] }
  | { kind: 'export'; file: string; url: string; sizeMb: number }
  | { kind: 'extract'; folder: string; files: string[] };

export const exportItemSchema = z.object({
  stem: z.string(),
  startS: z.number().nonnegative(),
  endS: z.number().positive(),
  reden: z.string().optional(),
});

export const exportRequestSchema = z.object({
  items: z.array(exportItemSchema).min(1),
  separate: z.boolean().default(false),
  format: z.enum(FORMATS).default('original'),
  framePos: z.number().min(0).max(1).default(0.5),
  name: z.string().min(1).max(80).default('my-ride'),
  transition: z.enum(TRANSITIONS).default('crossfade'),
  /** songs under the movie; missing files are skipped */
  music: musicSettingsSchema.default(DEFAULT_MUSIC),
  /** telemetry overlay: the choice plus the three sprites the renderer drew (PNG data URLs) */
  overlay: z
    .object({
      spec: overlaySpecSchema,
      sprites: z.object({ bike: z.string(), dial: z.string(), needle: z.string() }),
    })
    .nullable()
    .default(null),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const partSchema = z.object({
  id: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  reden: z.enum(['bochten', 'accel/rem', 'beide', 'handmatig', 'samengeplakt']),
  enabled: z.boolean(),
  manual: z.boolean(),
  parts: z.array(z.tuple([z.number(), z.number()])).optional(),
  starred: z.boolean().optional(),
  score: z.number().nullable().optional(),
  peak: z.number().optional(),
  core_start_s: z.number().optional(),
  core_end_s: z.number().optional(),
  max_lean_deg: z.number().optional(),
  max_brake_g: z.number().optional(),
  max_accel_g: z.number().optional(),
});

/** The `.apexcut` file a project is exported to. Videos themselves are not included. */
export const projectFileSchema = z.object({
  apexcut: z.literal(1),
  name: z.string().min(1).max(80),
  exportedAt: z.string(),
  clips: z.array(
    z.object({ stem: z.string(), mp4: z.string().nullable(), lrf: z.string().nullable() }),
  ),
  selections: z.record(
    z.string(),
    z.object({ parts: z.array(partSchema), frozen: z.boolean().optional() }),
  ),
  music: musicSettingsSchema.optional(),
});
export type ProjectFile = z.infer<typeof projectFileSchema>;

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

/** Everything the renderer can call. Implemented in preload, served by main. */
export interface ApexcutApi {
  projects: {
    list(): Promise<ProjectInfo[]>;
    /** id of the open project */
    active(): Promise<string>;
    open(id: string): Promise<void>;
    create(name: string): Promise<ProjectInfo>;
    rename(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
    /** save dialog + write `.apexcut`; null when cancelled */
    exportFile(id: string): Promise<{ file: string } | null>;
    /** open dialog + import `.apexcut` as a new project; null when cancelled */
    importFile(): Promise<{ id: string; missing: string[] } | null>;
    /** sensitivity preset of the open project; rescoring every scanned video of it */
    setPreset(preset: PresetId): Promise<void>;
    /** count straight-line acceleration pulls in the open project; rescoring every scanned video */
    setPulls(on: boolean): Promise<void>;
    /** move a project to / out of the Archived section; an archived open project closes */
    archive(id: string, archived: boolean): Promise<void>;
    /** how the open project's parts are joined in the movie */
    setTransition(transition: Transition): Promise<void>;
    /** the open project's music lane */
    setMusic(music: MusicSettings): Promise<void>;
    /** the open project's telemetry overlay (null = off) */
    setOverlay(overlay: OverlaySpecDto | null): Promise<void>;
    /** the numbers of the open project for the ride card */
    rideStats(): Promise<RideStats>;
    /**
     * Add videos in groups: `name` null = into the open project, otherwise a new project with that
     * name. Returns the stems added, which of them still need a scan, and the first project created.
     */
    addGroups(
      groups: { name: string | null; paths: string[] }[],
    ): Promise<{ stems: string[]; toScan: string[]; firstProject: string | null }>;
  };
  library: {
    /** videos of the open project, in movie order */
    list(): Promise<ClipInfo[]>;
    /** file/folder dialog; returns what was picked (nothing is added yet) */
    pick(kind: 'files' | 'dir'): Promise<{ paths: string[]; cancelled: boolean }>;
    /** what a pick/drop contains, per recording day, without adding */
    inspect(paths: string[]): Promise<ImportGroup[]>;
    add(paths: string[]): Promise<{ added: string[] }>;
    /** take a video out of the open project (its scan is kept for other projects) */
    remove(stem: string): Promise<void>;
    /** new order of all videos (also the order in the movie) */
    reorder(stems: string[]): Promise<void>;
    /**
     * Video files moved: pick one file for `stem`, or a folder to fix every missing video found in it.
     * `relinked` = stems fixed; `mismatch` = the picked file belongs to another video; null = cancelled.
     */
    relink(
      kind: 'file' | 'dir',
      stem?: string,
    ): Promise<{ relinked: string[]; mismatch?: string } | null>;
  };
  files: {
    /** absolute path of a File dropped from Explorer (Electron webUtils) */
    pathOf(file: File): string;
  };
  music: {
    /** file dialog for songs; returns them probed (name, length) and ready for the lane */
    pick(): Promise<MusicTrack[]>;
    /** probe files (e.g. dropped ones) the same way */
    add(paths: string[]): Promise<MusicTrack[]>;
    /** does the file still exist? */
    exists(path: string): Promise<boolean>;
  };
  analysis: {
    run(stems: string[], config?: Partial<ScoreConfig>): Promise<string>;
    rescore(stem: string, config: Partial<ScoreConfig>): Promise<TimelinePayload>;
    timeline(stem: string): Promise<TimelinePayload>;
    saveParts(stem: string, parts: Part[]): Promise<void>;
    filmstrip(stem: string): Promise<{ url: string; step: number; n: number; size: number }>;
    /** one frame of a video as a JPEG data URL (for the ride card) */
    frame(stem: string, tS: number, width?: number): Promise<string>;
  };
  exporter: {
    start(req: ExportRequest): Promise<string>;
    cancel(jobId: string): Promise<void>;
    edl(stem: string): Promise<{ file: string }>;
  };
  jobs: {
    list(): Promise<JobState[]>;
    onUpdate(cb: (job: JobState) => void): () => void;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    encoders(): Promise<EncoderInfo>;
    /** folder picker for the output folder; null when cancelled */
    pickOutputDir(): Promise<Settings | null>;
  };
  shell: {
    openFolder(path: string): Promise<void>;
  };
  storage: {
    info(): Promise<StorageInfo>;
    /** delete scans of videos that are in no project */
    cleanup(): Promise<{ removed: string[]; freedBytes: number }>;
  };
  updater: {
    status(): Promise<UpdateStatus>;
    /** start a check; the outcome arrives through onStatus */
    check(): Promise<UpdateStatus>;
    /** quit and install a downloaded update */
    install(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
  window: {
    /** colours of the native window buttons drawn over the custom title bar (Windows / Linux) */
    setOverlay(color: string, symbolColor: string): Promise<void>;
    /** maximised / full screen / focused, pushed by main on every change and once after load */
    onState(cb: (s: WindowState) => void): () => void;
    /** double-click on the title bar: maximise or restore (macOS follows the system preference) */
    titlebarDoubleClick(): void;
  };
  app: {
    version(): Promise<string>;
    /** zip of logs + project list + settings + app info in Documents; returns its path */
    report(): Promise<{ file: string }>;
    /** renderer warnings/errors also land in main.log */
    log(level: 'warn' | 'error', message: string): void;
    /** main-process crash that the renderer should show */
    onFatal(cb: (err: { message: string; stack?: string }) => void): () => void;
    /** save a PNG data URL into the output folder and put it on the clipboard; returns the file */
    saveImage(dataUrl: string, name: string): Promise<{ file: string }>;
  };
}
