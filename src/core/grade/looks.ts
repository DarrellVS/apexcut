/**
 * What a grade is, and the looks and sliders people choose from. No maths here: this is the
 * vocabulary both sides of the app speak (the Colour section shows it, the export stores it).
 */
export interface Grade {
  /** exposure in stops, −2 … +2 */
  exposure: number;
  /** −100 … +100 */
  contrast: number;
  /** lift or lower the bright end, −100 … +100 */
  highlights: number;
  /** lift or lower the dark end, −100 … +100 */
  shadows: number;
  /** −100 (black & white) … +100 */
  saturation: number;
  /** cold ← 0 → warm, −100 … +100 */
  warmth: number;
  /** green ← 0 → magenta, −100 … +100 */
  tint: number;
  /** darkened edges, 0 … 100 */
  vignette: number;
  /** 0 … 100 */
  sharpen: number;
}

export type GradeKey = keyof Grade;

export const NEUTRAL_GRADE: Grade = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  vignette: 0,
  sharpen: 0,
};

/** slider ranges and how the value reads, per control */
export const GRADE_CONTROLS: {
  key: GradeKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** how the value is shown next to the slider */
  fmt: (v: number) => string;
  /** what the two ends mean, for the tooltip */
  hint: string;
}[] = [
  {
    key: 'exposure',
    label: 'Brightness',
    min: -2,
    max: 2,
    step: 0.05,
    fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`,
    hint: 'Darker or brighter overall, in stops like a camera',
  },
  {
    key: 'contrast',
    label: 'Contrast',
    min: -100,
    max: 100,
    step: 1,
    fmt: signed,
    hint: 'Flat and soft, or bold light and dark',
  },
  {
    key: 'highlights',
    label: 'Highlights',
    min: -100,
    max: 100,
    step: 1,
    fmt: signed,
    hint: 'Tame a bright sky (down) or make the light parts glow (up)',
  },
  {
    key: 'shadows',
    label: 'Shadows',
    min: -100,
    max: 100,
    step: 1,
    fmt: signed,
    hint: 'Open up dark trees and tarmac (up) or deepen them (down)',
  },
  {
    key: 'saturation',
    label: 'Colour',
    min: -100,
    max: 100,
    step: 1,
    fmt: signed,
    hint: 'Muted to vivid; all the way down is black & white',
  },
  {
    key: 'warmth',
    label: 'Warmth',
    min: -100,
    max: 100,
    step: 1,
    fmt: signed,
    hint: 'Cool blue morning or warm golden evening',
  },
  {
    key: 'tint',
    label: 'Tint',
    min: -100,
    max: 100,
    step: 1,
    fmt: signed,
    hint: 'Green to magenta, for skin and foliage',
  },
  {
    key: 'vignette',
    label: 'Dark edges',
    min: 0,
    max: 100,
    step: 1,
    fmt: (v) => `${Math.round(v)}`,
    hint: 'Darkens the corners of the picture, eyes go to the road',
  },
  {
    key: 'sharpen',
    label: 'Sharpen',
    min: 0,
    max: 100,
    step: 1,
    fmt: (v) => `${Math.round(v)}`,
    hint: 'A bit of extra crispness; too much looks harsh',
  },
];
function signed(v: number): string {
  return `${v > 0 ? '+' : ''}${Math.round(v)}`;
}

export interface Look {
  id: string;
  label: string;
  hint: string;
  grade: Grade;
}
/** starting points; the first one is "as recorded" */
export const LOOKS: Look[] = [
  { id: 'none', label: 'As recorded', hint: 'No colour changes', grade: NEUTRAL_GRADE },
  {
    id: 'moody',
    label: 'Moody',
    hint: 'Darker, cooler, muted, heavy edges',
    grade: {
      ...NEUTRAL_GRADE,
      exposure: -0.15,
      contrast: 20,
      saturation: -20,
      shadows: -15,
      warmth: -12,
      vignette: 35,
    },
  },
  {
    id: 'punchy',
    label: 'Punchy',
    hint: 'Bold contrast, vivid colour, crisp',
    grade: { ...NEUTRAL_GRADE, contrast: 25, saturation: 30, shadows: -10, sharpen: 30 },
  },
  {
    id: 'sunny',
    label: 'Sunny',
    hint: 'A touch brighter, warmer and more colourful',
    grade: { ...NEUTRAL_GRADE, exposure: 0.15, contrast: 10, saturation: 15, warmth: 15 },
  },
  {
    id: 'golden',
    label: 'Golden hour',
    hint: 'Warm evening light, softer highlights',
    grade: { ...NEUTRAL_GRADE, warmth: 40, tint: 6, saturation: 10, highlights: -12, vignette: 15 },
  },
  {
    id: 'film',
    label: 'Film',
    hint: 'Soft contrast, lifted shadows, faded colour',
    grade: {
      ...NEUTRAL_GRADE,
      contrast: -10,
      saturation: -25,
      shadows: 18,
      highlights: -15,
      warmth: 10,
      vignette: 20,
    },
  },
  {
    id: 'mono',
    label: 'Black & white',
    hint: 'No colour, a little extra contrast',
    grade: { ...NEUTRAL_GRADE, saturation: -100, contrast: 15, shadows: -5, vignette: 10 },
  },
];

export const isNeutral = (g: Grade | null | undefined): boolean =>
  !g || (Object.keys(NEUTRAL_GRADE) as GradeKey[]).every((k) => Math.abs(g[k]) < 1e-9);

export const gradeEquals = (a: Grade | null | undefined, b: Grade | null | undefined): boolean =>
  (Object.keys(NEUTRAL_GRADE) as GradeKey[]).every(
    (k) => Math.abs((a?.[k] ?? 0) - (b?.[k] ?? 0)) < 1e-9,
  );

/** the look a grade equals exactly, if any */
export const lookOf = (g: Grade | null | undefined): Look | null =>
  LOOKS.find((l) => gradeEquals(l.grade, g)) ?? null;

/** clamp every value into its slider range and drop NaN */
export function sanitizeGrade(g: Partial<Grade> | null | undefined): Grade {
  const out = { ...NEUTRAL_GRADE };
  for (const c of GRADE_CONTROLS) {
    const v = Number(g?.[c.key]);
    out[c.key] = Number.isFinite(v) ? Math.min(c.max, Math.max(c.min, v)) : 0;
  }
  return out;
}
