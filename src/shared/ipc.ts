/**
 * IPC contract shared by main, preload and renderer. Zod schemas validate everything that crosses
 * the bridge from the renderer; the inferred types are the single source of truth.
 */
import { z } from 'zod';
import type { Part, ScoreConfig, Segment } from '@core/types';

export const FORMATS = ['original', '16x9', '4x3', '9x16'] as const;
export type ExportFormat = (typeof FORMATS)[number];

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
});
export type ProjectFile = z.infer<typeof projectFileSchema>;

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
  theme: themeSchema.default('system'),
  outputDir: z.string().nullable().default(null),
  lastFormat: z.enum(FORMATS).default('16x9'),
  lastFramePos: z.number().min(0).max(1).default(0.5),
  lastName: z.string().default('my-ride'),
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
  };
  library: {
    /** videos of the open project, in movie order */
    list(): Promise<ClipInfo[]>;
    pick(kind: 'files' | 'dir'): Promise<{ added: string[]; cancelled: boolean }>;
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
  analysis: {
    run(stems: string[], config?: Partial<ScoreConfig>): Promise<string>;
    rescore(stem: string, config: Partial<ScoreConfig>): Promise<TimelinePayload>;
    timeline(stem: string): Promise<TimelinePayload>;
    saveParts(stem: string, parts: Part[]): Promise<void>;
    filmstrip(stem: string): Promise<{ url: string; step: number; n: number; size: number }>;
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
  updater: {
    status(): Promise<UpdateStatus>;
    /** start a check; the outcome arrives through onStatus */
    check(): Promise<UpdateStatus>;
    /** quit and install a downloaded update */
    install(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
  app: {
    version(): Promise<string>;
    /** zip of logs + project list + settings + app info in Documents; returns its path */
    report(): Promise<{ file: string }>;
    /** renderer warnings/errors also land in main.log */
    log(level: 'warn' | 'error', message: string): void;
    /** main-process crash that the renderer should show */
    onFatal(cb: (err: { message: string; stack?: string }) => void): () => void;
  };
}
