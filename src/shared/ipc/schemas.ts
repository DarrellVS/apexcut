/**
 * Everything the renderer sends, validated at the door. The inferred types are the single source of
 * truth for both sides; a handler that parses with these can trust what it gets.
 */
import { z } from 'zod';
import { PICTURE_REASONS } from '@core/picture';
import { FORMATS, TRANSITIONS } from './movie';
import { DEFAULT_MUSIC, musicSettingsSchema, overlaySpecSchema } from './dto';

/** colour grading (core/grade.ts); every value 0 when neutral */
export const gradeSchema = z.object({
  exposure: z.number().min(-2).max(2),
  contrast: z.number().min(-100).max(100),
  highlights: z.number().min(-100).max(100),
  shadows: z.number().min(-100).max(100),
  saturation: z.number().min(-100).max(100),
  warmth: z.number().min(-100).max(100),
  tint: z.number().min(-100).max(100),
  vignette: z.number().min(0).max(100),
  sharpen: z.number().min(0).max(100),
});

export const exportItemSchema = z.object({
  stem: z.string(),
  startS: z.number().nonnegative(),
  endS: z.number().positive(),
  reden: z.string().optional(),
  /** colours for this part (its own or the movie's); none = as recorded */
  grade: gradeSchema.optional(),
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
  /** even the volume of the finished movie out (−14 LUFS) */
  loudness: z.boolean().default(false),
  /** vertical only: let the crop window lean into the corners (see core/framing) */
  follow: z.boolean().default(false),
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
  picture: z.boolean().optional(),
  picture_why: z.enum(PICTURE_REASONS).optional(),
  marked: z.boolean().optional(),
  marked_at: z.number().optional(),
  grade: gradeSchema.optional(),
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
