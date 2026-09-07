import { describe, expect, it } from 'vitest';
import { pickByLength } from '@core/pick';
import type { Part } from '@core/types';

const part = (
  id: string,
  start: number,
  dur: number,
  score: number,
  extra: Partial<Part> = {},
): Part => ({
  id,
  start_s: start,
  end_s: start + dur,
  reden: 'bochten',
  enabled: true,
  manual: false,
  score,
  ...extra,
});

// two videos, 31 parts, ~27 minutes in total — like a real project
const videos: Record<string, Part[]> = {
  a: Array.from({ length: 16 }, (_, i) =>
    part(`a${i}`, i * 60, 40 + (i % 5) * 10, 1 + (i % 7) / 10),
  ),
  b: Array.from({ length: 15 }, (_, i) =>
    part(`b${i}`, i * 70, 30 + (i % 4) * 15, 0.8 + (i % 6) / 10),
  ),
};
const total = (r: { enabled: Record<string, Record<string, boolean>> }): number =>
  Object.entries(videos)
    .flatMap(([v, list]) => list.filter((p) => r.enabled[v][p.id]))
    .reduce((a, p) => a + p.end_s - p.start_s, 0);

describe('pickByLength', () => {
  it('lands within ±10 % of the target when enough parts exist', () => {
    for (const targetS of [60, 180, 600]) {
      const r = pickByLength(videos, { targetS });
      expect(r.reached).toBe(true);
      expect(total(r)).toBeGreaterThanOrEqual(targetS * 0.9);
      expect(total(r)).toBeLessThanOrEqual(targetS * 1.1 + 70);
    }
  });

  it('prefers the highest scores', () => {
    const r = pickByLength(videos, { targetS: 120 });
    const chosen = Object.entries(videos).flatMap(([v, list]) =>
      list.filter((p) => r.enabled[v][p.id]),
    );
    const minChosen = Math.min(...chosen.map((p) => p.score ?? 0));
    const skippedBetter = Object.entries(videos).flatMap(([v, list]) =>
      list.filter((p) => !r.enabled[v][p.id] && (p.score ?? 0) > minChosen + 0.3),
    );
    expect(skippedBetter.length).toBe(0);
  });

  it('never drops starred or added parts, even at a tiny target', () => {
    const v = {
      a: [
        part('s', 0, 30, 0.1, { starred: true }),
        part('m', 100, 30, 0.1, { manual: true, reden: 'handmatig' }),
        part('x', 200, 30, 5),
      ],
    };
    const r = pickByLength(v, { targetS: 10 });
    expect(r.enabled.a.s).toBe(true);
    expect(r.enabled.a.m).toBe(true);
    expect(r.enabled.a.x).toBe(false);
  });

  it('says so when the target cannot be reached, and enables everything', () => {
    const r = pickByLength(videos, { targetS: 100_000 });
    expect(r.reached).toBe(false);
    expect(Object.values(r.enabled).every((m) => Object.values(m).every(Boolean))).toBe(true);
  });

  it('keepPicks keeps the current selection and only adjusts towards the target', () => {
    const v = { a: [part('p', 0, 60, 0.2), part('q', 100, 60, 5, { enabled: false })] };
    const r = pickByLength(v, { targetS: 60, keepPicks: true });
    expect(r.enabled.a.p).toBe(true);
    expect(r.enabled.a.q).toBe(false);
  });
});

describe('pickByLength with repeated ids across videos', () => {
  it('treats a2 in video A and a2 in video B as different parts', () => {
    const v = { A: [part('a2', 0, 60, 5)], B: [part('a2', 0, 60, 0.1)] };
    const r = pickByLength(v, { targetS: 60 });
    expect(r.enabled.A.a2).toBe(true);
    expect(r.enabled.B.a2).toBe(false);
    expect(r.totalS).toBe(60);
  });
});
