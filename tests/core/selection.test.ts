import { describe, expect, it } from 'vitest';
import { autoToParts, joinParts, mergeSelection, missingAuto, suggestions } from '@core/selection';
import { edl, timecode } from '@core/edl';
import type { Segment } from '@core/types';

const seg = (start_s: number, end_s: number): Segment => ({
  start_s,
  end_s,
  core_start_s: start_s,
  core_end_s: end_s,
  score: 1,
  peak: 1,
  max_lean_deg: 20,
  max_brake_g: 0.1,
  max_accel_g: 0.1,
  reden: 'bochten',
});

describe('selection', () => {
  it('manual parts survive a rescore and hide overlapping auto parts', () => {
    const prev = autoToParts([seg(10, 20), seg(30, 40)]);
    const joined = joinParts([prev[0], prev[1]], 'm1');
    const next = mergeSelection([joined], [seg(10, 20), seg(30, 40), seg(60, 70)]);
    expect(next.map((p) => p.id)).toEqual(['m1', 'a2']);
    expect(joined.parts).toEqual([
      [10, 20],
      [30, 40],
    ]);
    expect(missingAuto(next, [seg(10, 20), seg(30, 40), seg(60, 70)])).toHaveLength(0);
    expect(
      missingAuto(
        next.filter((p) => p.id !== 'm1'),
        [seg(10, 20)],
      ),
    ).toHaveLength(1);
  });

  it('suggests chains where the gap is short or still scores', () => {
    const parts = autoToParts([seg(0, 10), seg(12, 20), seg(40, 50), seg(56, 60)]);
    const score = new Float64Array(700).fill(0.1);
    for (let i = 500; i <= 560; i++) score[i] = 0.5; // gap 50–56 keeps scoring
    const s = suggestions(parts, score, 0.6);
    expect(s).toHaveLength(2);
    expect(s[0].parts.map((p) => p.id)).toEqual(['a0', 'a1']); // gap 2 s
    expect(s[1].parts.map((p) => p.id)).toEqual(['a2', 'a3']); // mean 0.5 ≥ 0.45·0.6
    expect(s[0].from).toBe(0);
    expect(s[0].to).toBe(20);
  });
});

describe('edl', () => {
  it('timecode math', () => {
    expect(timecode(0, 29.97)).toBe('00:00:00:00');
    expect(timecode(61, 29.97, '10:00:00:00')).toBe('10:01:00:29');
  });
  it('one event per part with record timeline continuity', () => {
    const parts = autoToParts([seg(10, 20), seg(30, 45)]);
    const text = edl(parts, 'clip', 'clip.MP4', 29.97);
    expect(text).toContain(
      '001  AX       AA/V  C        00:00:10:00 00:00:20:00 00:00:00:00 00:00:10:00',
    );
    expect(text).toContain(
      '002  AX       AA/V  C        00:00:30:00 00:00:45:00 00:00:10:00 00:00:25:00',
    );
  });
});
