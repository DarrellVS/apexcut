/**
 * User-facing parts: auto segments plus manual edits (trim, leave out, join, add, restore).
 * Rules are described in docs/scoring.md → "User selection".
 */
import type { Part, Reason, Segment } from './types';

export function autoToParts(segments: Segment[]): Part[] {
  return segments.map((s, i) => ({ ...s, id: `a${i}`, enabled: true, manual: false }));
}

/** Overlap larger than `frac` of the shorter part. */
export function overlaps(
  a: { start_s: number; end_s: number },
  b: { start_s: number; end_s: number },
  frac = 0.3,
): boolean {
  const ov = Math.min(a.end_s, b.end_s) - Math.max(a.start_s, b.start_s);
  return ov > 0 && ov > frac * Math.min(a.end_s - a.start_s, b.end_s - b.start_s);
}

/** New auto segments replace old auto parts; manual parts win over overlapping auto ones. */
export function mergeSelection(previous: Part[], autoSegments: Segment[]): Part[] {
  const manual = previous.filter((p) => p.manual);
  const auto = autoToParts(autoSegments).filter((a) => !manual.some((m) => overlaps(a, m)));
  return [...auto, ...manual].sort((x, y) => x.start_s - y.start_s);
}

export function joinParts(list: Part[], id = `m${Date.now()}`): Part {
  const start_s = Math.min(...list.map((p) => p.start_s));
  const end_s = Math.max(...list.map((p) => p.end_s));
  const max = (k: 'score' | 'max_lean_deg' | 'max_brake_g' | 'max_accel_g'): number =>
    Math.max(...list.map((p) => p[k] ?? 0));
  return {
    id,
    start_s,
    end_s,
    enabled: true,
    manual: true,
    reden: 'samengeplakt',
    score: max('score'),
    max_lean_deg: max('max_lean_deg'),
    max_brake_g: max('max_brake_g'),
    max_accel_g: max('max_accel_g'),
    parts: list.map((p) => [p.start_s, p.end_s]),
    // a favourite stays a favourite when joined with others
    ...(list.some((p) => p.starred) ? { starred: true } : {}),
  };
}

export function manualPart(t: number, duration: number, id = `m${Date.now()}`, before = 2): Part {
  const start = Math.round(Math.max(0, t - before) * 10) / 10;
  const end = Math.round(Math.min(duration, t + 6) * 10) / 10;
  return { id, start_s: start, end_s: end, enabled: true, manual: true, reden: 'handmatig' };
}

/** Auto segments from the original scan that no current part covers (deleted or joined). */
export function missingAuto(parts: Part[], auto: Segment[]): Segment[] {
  return auto.filter((a) => !parts.some((p) => overlaps(a, p)));
}

export interface Suggestion {
  id: string;
  parts: Part[];
  from: number;
  to: number;
}

/**
 * Chains of neighbouring parts that probably belong together: short gap, or the score stays high
 * in the gap. `score` is the 10 Hz smoothed score, `threshold` the current cut-off.
 */
export function suggestions(
  parts: Part[],
  score: ArrayLike<number>,
  threshold: number,
  fs = 10,
): Suggestion[] {
  const segs = [...parts].sort((a, b) => a.start_s - b.start_s);
  const out: Suggestion[] = [];
  if (!segs.length) return out;
  const joined = (a: Part, b: Part): boolean => {
    const gap = b.start_s - a.end_s;
    if (gap <= 0.5 || gap > 20) return false;
    const i0 = Math.max(0, Math.round(a.end_s * fs));
    const i1 = Math.min(score.length - 1, Math.round(b.start_s * fs));
    let sum = 0;
    let n = 0;
    let mn = Infinity;
    for (let k = i0; k <= i1; k++) {
      const v = score[k];
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      sum += v;
      n++;
      if (v < mn) mn = v;
    }
    if (!n) return false;
    const mean = sum / n;
    return gap <= 4 || mean >= 0.45 * threshold || (mn >= 0.25 * threshold && gap <= 12);
  };
  let chain: Part[] = [segs[0]];
  for (let i = 1; i <= segs.length; i++) {
    const b = segs[i];
    if (b && joined(chain[chain.length - 1], b)) chain.push(b);
    else {
      if (chain.length > 1)
        out.push({
          id: chain.map((p) => p.id).join('+'),
          parts: chain,
          from: chain[0].start_s,
          to: chain[chain.length - 1].end_s,
        });
      chain = b ? [b] : [];
    }
  }
  return out;
}

export const REASON_LABEL: Record<Reason, string> = {
  bochten: 'Corners',
  'accel/rem': 'Braking & acceleration',
  beide: 'Corners + braking',
  handmatig: 'Added by you',
  samengeplakt: 'Joined',
};

export function reasonOf(p: Part): Reason {
  return p.manual ? (p.reden === 'samengeplakt' ? 'samengeplakt' : 'handmatig') : p.reden;
}
