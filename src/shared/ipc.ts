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

export interface EncoderInfo {
  ffmpegVersion: string;
  hevcEncoder: string;
  gpuDecode: boolean;
}

/** Everything the renderer can call. Implemented in preload, served by main. */
export interface ApexcutApi {
  library: {
    list(): Promise<ClipInfo[]>;
    pick(kind: 'files' | 'dir'): Promise<{ added: string[]; cancelled: boolean }>;
    add(paths: string[]): Promise<{ added: string[] }>;
    remove(stem: string): Promise<void>;
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
  };
  shell: {
    openFolder(path: string): Promise<void>;
  };
  app: {
    version(): Promise<string>;
  };
}
