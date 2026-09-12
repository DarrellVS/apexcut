/**
 * What the picture itself has to say. The IMU knows how the bike moved; it cannot know that you
 * rode into a tunnel, that the sun was going down, or that the road suddenly got busy. This turns a
 * handful of cheap numbers about each frame — brightness, colour, how much detail there is — into
 * one 0..1 vote per moment, which scoring adds on top of the motion score when the rider asks for
 * it (`picture_weight`, off by default).
 *
 * What it can see: light changing fast (a tunnel, trees, coming out into the open), warm saturated
 * light (evening sun), and a picture full of detail (town, traffic, other riders). What it cannot
 * see is *what* is in the picture — no model runs here, so it never knows a motorcycle from a bus.
 * Everything is measured against the recording's own middle, so a grey day and a bright one are
 * judged on their own terms.
 */
import { robustScale } from './numeric';

/** the numbers ffmpeg reports per sampled frame (main/actions/picture.ts) */
export interface PictureStats {
  /** how often a frame was looked at, per second */
  fps: number;
  /** seconds from the start of the recording */
  t: number[];
  /** average luma, 0..255 */
  bright: number[];
  /** average saturation, 0..~180 */
  sat: number[];
  /** average red minus blue: warm light is positive */
  warmth: number[];
  /** how much edge there is in the frame, 0..255 */
  edges: number[];
}

/** what made the picture vote for a moment; the order is the order of `PICTURE_WEIGHTS` */
export const PICTURE_REASONS = ['light', 'golden', 'busy'] as const;
export type PictureReason = (typeof PICTURE_REASONS)[number];
/** the same in words a rider would use */
export const PICTURE_REASON_LABEL: Record<PictureReason, string> = {
  light: 'the light changed fast',
  golden: 'low evening sun',
  busy: 'a busy road',
};

export interface PictureSignal {
  t: Float64Array;
  /** 0..1, how much this moment is worth watching for what it looks like */
  score: Float64Array;
  /** which of `PICTURE_REASONS` counted most at that moment */
  why: Uint8Array;
}

/** how much each part of the picture counts towards its vote */
export const PICTURE_WEIGHTS = { change: 0.5, golden: 0.3, busy: 0.2 } as const;
/** how long the vote is smoothed over, seconds — a single odd frame should not decide anything */
export const PICTURE_SMOOTH_S = 2;
/** how much the vote counts when the rider switches it on */
export const PICTURE_VOTE = 0.35;

const clip01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);

/** how far above its own middle a series sits, in robust deviations, clipped to 0..1 */
function overMiddle(values: number[], deviations = 2): Float64Array {
  const arr = Float64Array.from(values);
  const { med, scale } = robustScale(arr);
  const s = scale > 1e-9 ? scale : 1;
  return arr.map((v) => clip01((v - med) / (deviations * s)));
}

/** a centred mean over `win` samples */
function smooth(values: Float64Array, win: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const half = Math.max(0, Math.floor(win / 2));
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let k = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      sum += values[j];
      k++;
    }
    out[i] = k ? sum / k : 0;
  }
  return out;
}

/**
 * The vote, one value per sampled frame. Empty stats give an empty signal, which scoring treats as
 * "the picture had nothing to say".
 */
export function pictureScore(stats: PictureStats): PictureSignal {
  const n = Math.min(stats.t.length, stats.bright.length);
  if (n < 3) {
    return { t: new Float64Array(0), score: new Float64Array(0), why: new Uint8Array(0) };
  }
  const fps = stats.fps > 0 ? stats.fps : 2;

  // light changing fast: how much the brightness moves per second, against this ride's own middle
  const dBright: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = stats.bright[Math.max(0, i - 1)];
    const b = stats.bright[Math.min(n - 1, i + 1)];
    dBright.push((Math.abs(b - a) * fps) / 2);
  }
  const change = overMiddle(dBright, 3);
  // evening light: warm and saturated at once, so a warm grey sky does not count
  const warm = overMiddle(stats.warmth.slice(0, n), 2);
  const vivid = overMiddle(stats.sat.slice(0, n), 2);
  const golden = warm.map((v, i) => v * vivid[i]);
  // a full picture: hedges, houses, traffic, other riders — as opposed to an empty road
  const busy = overMiddle(stats.edges.slice(0, n), 2);

  const raw = new Float64Array(n);
  // which of the three counted most right there, so a part can say why it was picked
  const why = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = PICTURE_WEIGHTS.change * change[i];
    const b = PICTURE_WEIGHTS.golden * golden[i];
    const c = PICTURE_WEIGHTS.busy * busy[i];
    raw[i] = a + b + c;
    why[i] = a >= b && a >= c ? 0 : b >= c ? 1 : 2;
  }
  return {
    t: Float64Array.from(stats.t.slice(0, n)),
    score: smooth(raw, Math.max(1, Math.round(PICTURE_SMOOTH_S * fps))).map(clip01),
    why,
  };
}
