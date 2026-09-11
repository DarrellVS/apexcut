import { describe, expect, it } from 'vitest';
import {
  channelGains,
  colorMatrix,
  ffmpegGrade,
  gradeEquals,
  isNeutral,
  LOOKS,
  lookOf,
  NEUTRAL_GRADE,
  sampleCurve,
  sanitizeGrade,
  toneTable,
} from '@core/grade';

describe('grade', () => {
  it('a neutral grade changes nothing', () => {
    expect(isNeutral(NEUTRAL_GRADE)).toBe(true);
    expect(isNeutral(null)).toBe(true);
    expect(ffmpegGrade(NEUTRAL_GRADE)).toEqual([]);
    expect(sampleCurve(NEUTRAL_GRADE, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(channelGains(NEUTRAL_GRADE)).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('builds the ffmpeg chain in the right order', () => {
    const chain = ffmpegGrade({
      ...NEUTRAL_GRADE,
      exposure: 1,
      contrast: 20,
      shadows: 30,
      sharpen: 50,
      vignette: 40,
    });
    expect(chain.map((f) => f.split('=')[0])).toEqual(['colorchannelmixer', 'curves', 'unsharp']);
    expect(chain[0]).toContain('rr=2.0000:rg=0.0000:rb=0.0000:gr=0.0000:gg=2.0000');
    // the ends stay pinned; the quarter point is pushed down by contrast and lifted by the shadows
    expect(chain[1]).toMatch(/^curves=all='0\.0000\/0\.0000 .* 1\.0000\/1\.0000'$/);
    const quarter = Number(/0\.2500\/([\d.]+)/.exec(chain[1])![1]);
    expect(quarter).toBeGreaterThan(0.2);
    expect(quarter).toBeLessThan(0.3);
    expect(chain.join(',')).not.toMatch(/(^|,)eq=|vignette/);
  });

  it('full desaturation is the luma matrix, no saturation change is the identity', () => {
    const grey = colorMatrix({ ...NEUTRAL_GRADE, saturation: -100 });
    for (const row of grey) expect(row.map((v) => +v.toFixed(4))).toEqual([0.2126, 0.7152, 0.0722]);
    const id = colorMatrix(NEUTRAL_GRADE);
    expect(id).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it('contrast alone is a straight line around mid grey in the tone table', () => {
    const t = toneTable({ ...NEUTRAL_GRADE, contrast: 100 }, 5);
    expect(t).toEqual([0, 0, 0.5, 1, 1]);
    expect(toneTable(NEUTRAL_GRADE, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('warmth pushes red up and blue down by the same amount', () => {
    const k = channelGains({ ...NEUTRAL_GRADE, warmth: 50 });
    expect(k.r - 1).toBeCloseTo(1 - k.b, 9);
    expect(k.g).toBe(1);
  });

  it('the tone curve stays monotone and pinned at the ends', () => {
    for (const g of [
      { ...NEUTRAL_GRADE, shadows: 100, highlights: -100 },
      { ...NEUTRAL_GRADE, shadows: -100, highlights: 100 },
    ]) {
      const ys = sampleCurve(g, 65);
      expect(ys[0]).toBe(0);
      expect(ys[64]).toBe(1);
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 1e-9);
    }
  });

  it('recognises looks and clamps stray values', () => {
    expect(lookOf(LOOKS[2].grade)?.id).toBe('punchy');
    expect(lookOf({ ...LOOKS[2].grade, tint: 1 })).toBeNull();
    const g = sanitizeGrade({ exposure: 9, contrast: Number.NaN, vignette: -5 });
    expect(g.exposure).toBe(2);
    expect(g.contrast).toBe(0);
    expect(g.vignette).toBe(0);
    expect(gradeEquals(g, { ...NEUTRAL_GRADE, exposure: 2 })).toBe(true);
  });
});
