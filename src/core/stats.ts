/**
 * Ride numbers from the 10 Hz timeline signals, restricted to time ranges (the parts in the movie).
 * Used by the ride card (main) and to keep a part's lean/braking figures right after its edges move.
 */
export interface TimeRange {
  start_s: number;
  end_s: number;
}

export interface CornerOptions {
  /** a corner starts when |lean| reaches this */
  enterDeg: number;
  /** …and ends when |lean| drops below this (hysteresis against flicker at the threshold) */
  exitDeg: number;
  /** shorter excursions are noise */
  minS: number;
  /** same-side excursions closer than this are one corner */
  gapS: number;
}

export const DEFAULT_CORNER: CornerOptions = { enterDeg: 20, exitDeg: 12, minS: 0.4, gapS: 0.6 };

const inRanges = (t: number, ranges: TimeRange[]): boolean =>
  ranges.some((r) => t >= r.start_s && t <= r.end_s);

/**
 * Count corners: lean excursions past `enterDeg` on one side, ended when the lean falls under
 * `exitDeg` or the side flips; only samples inside `ranges` count.
 */
export function countCorners(
  t: ArrayLike<number>,
  leanDeg: ArrayLike<number | null>,
  ranges: TimeRange[],
  o: CornerOptions = DEFAULT_CORNER,
): number {
  const runs: [number, number, number][] = []; // start, end, side
  let cur: [number, number, number] | null = null;
  for (let i = 0; i < t.length; i++) {
    const v = leanDeg[i];
    if (v === null || v === undefined || !inRanges(t[i], ranges)) {
      if (cur) runs.push(cur);
      cur = null;
      continue;
    }
    const side = v > 0 ? 1 : -1;
    const a = Math.abs(v);
    if (cur && cur[2] === side && a >= o.exitDeg) {
      cur[1] = t[i]; // still in the same corner
    } else if (a >= o.enterDeg) {
      if (cur) runs.push(cur);
      cur = [t[i], t[i], side];
    } else if (cur && (a < o.exitDeg || cur[2] !== side)) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  // merge same-side runs separated by a short dip, then drop the blips
  const merged: [number, number, number][] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last[2] === r[2] && r[0] - last[1] < o.gapS) last[1] = r[1];
    else merged.push([...r]);
  }
  return merged.filter((r) => r[1] - r[0] >= o.minS).length;
}

export interface RangeStats {
  maxLeanDeg: number;
  maxBrakeG: number;
  maxAccelG: number;
}

/** Extremes inside one range, unrounded (what a part shows as “up to 34° lean · braking 0.6 g”). */
export function rangeStats(
  t: ArrayLike<number>,
  leanDeg: ArrayLike<number | null>,
  aLonG: ArrayLike<number | null>,
  range: TimeRange,
): RangeStats {
  let lean = 0;
  let brake = 0;
  let accel = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] < range.start_s || t[i] > range.end_s) continue;
    lean = Math.max(lean, Math.abs(leanDeg[i] ?? 0));
    brake = Math.max(brake, -(aLonG[i] ?? 0));
    accel = Math.max(accel, aLonG[i] ?? 0);
  }
  return { maxLeanDeg: lean, maxBrakeG: brake, maxAccelG: accel };
}

/**
 * The 60 s window (inside `ranges`) with the most time above `leanDeg` degrees of lean:
 * where it starts and the share of that minute spent leaning.
 */
export function twistiestMinute(
  t: ArrayLike<number>,
  lean: ArrayLike<number | null>,
  ranges: TimeRange[],
  fs = 10,
  minLeanDeg = 10,
): { tS: number; pct: number } | null {
  const win = 60 * fs;
  const hits: number[] = [];
  let run = 0;
  let best = -1;
  let tS = 0;
  for (let i = 0; i < t.length; i++) {
    const h = inRanges(t[i], ranges) && Math.abs(lean[i] ?? 0) > minLeanDeg ? 1 : 0;
    hits.push(h);
    run += h;
    if (i >= win) run -= hits[i - win];
    if (run > best) {
      best = run;
      tS = Math.max(0, t[i] - 60);
    }
  }
  return best < 0 ? null : { tS, pct: Math.round((best / win) * 100) };
}
