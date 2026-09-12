import { describe, expect, it } from 'vitest';
import { pictureScore, PICTURE_VOTE, type PictureStats } from '@core/picture';

/**
 * What the picture itself votes for. The numbers here stand in for what ffmpeg reports about each
 * sampled frame, so a "tunnel" is a brightness that drops and comes back, and "evening sun" is warm
 * and saturated at once.
 */
const flat = (n: number, over: Partial<PictureStats> = {}): PictureStats => ({
  fps: 2,
  t: Array.from({ length: n }, (_, i) => i / 2),
  bright: Array.from({ length: n }, () => 120),
  sat: Array.from({ length: n }, () => 40),
  warmth: Array.from({ length: n }, () => 5),
  edges: Array.from({ length: n }, () => 30),
  ...over,
});
const peakAt = (sig: { t: Float64Array; score: Float64Array }): number => {
  let best = 0;
  for (let i = 1; i < sig.score.length; i++) if (sig.score[i] > sig.score[best]) best = i;
  return sig.t[best];
};

describe('the picture vote', () => {
  it('says nothing about a recording that never changes', () => {
    const sig = pictureScore(flat(120));
    expect(sig.t).toHaveLength(120);
    expect(Math.max(...sig.score)).toBeCloseTo(0, 6);
  });

  it('has nothing to say about a recording too short to judge', () => {
    expect(pictureScore(flat(2)).score).toHaveLength(0);
  });

  it('votes for the moment the light changes — a tunnel', () => {
    const n = 200;
    const bright = Array.from({ length: n }, (_, i) => (i >= 100 && i < 120 ? 20 : 120));
    const sig = pictureScore(flat(n, { bright }));
    // the way in is at 50 s, the way out at 60 s; the peak is one of the two
    expect(peakAt(sig)).toBeGreaterThan(48);
    expect(peakAt(sig)).toBeLessThan(62);
    expect(Math.max(...sig.score)).toBeGreaterThan(0.15);
  });

  it('votes for evening light: warm and vivid at the same time', () => {
    const n = 200;
    const warmth = Array.from({ length: n }, (_, i) => (i > 150 ? 40 : 2));
    const sat = Array.from({ length: n }, (_, i) => (i > 150 ? 90 : 30));
    const sig = pictureScore(flat(n, { warmth, sat }));
    expect(peakAt(sig)).toBeGreaterThan(75);
    // warm light alone, with no colour in it, is just a grey sky
    const warmOnly = pictureScore(flat(n, { warmth }));
    expect(Math.max(...warmOnly.score)).toBeLessThan(Math.max(...sig.score));
  });

  it('votes a little for a picture full of detail', () => {
    const n = 200;
    const edges = Array.from({ length: n }, (_, i) => (i > 100 ? 90 : 20));
    const sig = pictureScore(flat(n, { edges }));
    expect(peakAt(sig)).toBeGreaterThan(50);
    expect(Math.max(...sig.score)).toBeGreaterThan(0.05);
  });

  it('never votes outside 0..1, whatever it is fed', () => {
    const n = 100;
    const wild = flat(n, {
      bright: Array.from({ length: n }, (_, i) => (i % 2 ? 255 : 0)),
      sat: Array.from({ length: n }, () => 180),
      warmth: Array.from({ length: n }, (_, i) => i * 10 - 500),
      edges: Array.from({ length: n }, (_, i) => (i % 3 ? 255 : 0)),
    });
    for (const v of pictureScore(wild).score) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('counts for a share of the score, not all of it', () => {
    expect(PICTURE_VOTE).toBeGreaterThan(0);
    expect(PICTURE_VOTE).toBeLessThan(1);
  });
});
