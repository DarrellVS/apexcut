/**
 * How a movie is shaped: the formats, what each one crops out of the square recording, and how the
 * parts are joined. Main and renderer both work from these, so a preview cannot promise something
 * the export does not do.
 */
export const FORMATS = ['original', '16x9', '4x3', '9x16'] as const;
export type ExportFormat = (typeof FORMATS)[number];

/** How parts are joined in the movie (see main/actions/cut/). */
export const TRANSITIONS = ['crossfade', 'cut', 'dip'] as const;
/** how long a crossfade blends, and how long a dip fades out and in — seconds */
export const XFADE_S = 0.5;
export const DIP_S = 0.4;
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
