/**
 * The live preview of a grade: an SVG filter the video element points at with `filter: url(#id)`.
 * Same maths as the export (core/grade.ts): one colour matrix (gains, warmth, tint, saturation) →
 * one tone table (contrast, shadows, highlights) → sharpen. Dark edges are a separate overlay (see
 * VideoStage), because a filter cannot know where the picture's edges are inside the element.
 */
import { colorMatrix, hasTone, isNeutral, sharpenAmount, toneTable, type Grade } from '@core/grade';

/** inner markup of an SVG `<filter>` for the grade; empty string for a neutral grade */
export function gradeFilterMarkup(g: Grade | null | undefined): string {
  if (!g || isNeutral(g)) return '';
  const m = colorMatrix(g);
  const steps: string[] = [];
  // gains, warmth, tint and saturation as one matrix (the same numbers the export uses)
  const row = (o: number): string => `${m[o][0]} ${m[o][1]} ${m[o][2]} 0 0`;
  steps.push(`<feColorMatrix type="matrix" values="${row(0)}  ${row(1)}  ${row(2)}  0 0 0 1 0"/>`);
  // contrast and the shadows / highlights curve as one lookup table on every channel
  if (hasTone(g)) {
    const table = toneTable(g, 33)
      .map((v) => v.toFixed(4))
      .join(' ');
    steps.push(
      `<feComponentTransfer><feFuncR type="table" tableValues="${table}"/><feFuncG type="table" tableValues="${table}"/><feFuncB type="table" tableValues="${table}"/></feComponentTransfer>`,
    );
  }
  if (g.sharpen) {
    const a = sharpenAmount(g) * 0.6;
    const centre = 1 + 4 * a;
    steps.push(
      `<feConvolveMatrix order="3" kernelMatrix="0 ${-a} 0 ${-a} ${centre} ${-a} 0 ${-a} 0" divisor="1" preserveAlpha="true"/>`,
    );
  }
  return steps.join('');
}

/** CSS for the dark-edges overlay: transparent centre, dark corners; empty when off */
export function vignetteCss(g: Grade | null | undefined): string {
  if (!g || !g.vignette) return '';
  const a = (g.vignette / 100) * 0.85;
  return `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${a.toFixed(3)}) 100%)`;
}
