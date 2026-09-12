/**
 * A vertical crop that follows the corner. The recording is square and a 9:16 movie keeps a tall
 * strip of it, so there is room to slide sideways. Instead of a fixed strip, the strip leans into
 * the turn: the yaw rate says how hard the bike is turning and which way (positive = to the right,
 * measured on real recordings), and the window moves that way and comes back on the straights.
 *
 * Pure and shared: the stage draws the same path the export burns in, so what the rider sees while
 * choosing is what the movie does. No ffmpeg here — main writes the commands to a file.
 */

export interface FollowOptions {
  /** the resting position of the window, 0 = the left edge, 1 = the right edge */
  p0: number;
  /** the yaw rate that uses the whole travel, degrees per second */
  yawFullDps?: number;
  /** below this the bike is going straight: steering corrections and head turns move nothing */
  deadDps?: number;
  /** how much of the room towards an edge a full turn uses (0..1) */
  travel?: number;
  /** how softly the window follows the signal, seconds */
  smoothS?: number;
  /** the fastest the window may move, in position per second */
  maxRatePerS?: number;
}

/**
 * Tuned on real rides: a deadband keeps the frame still through the small corrections and shoulder
 * checks that make up most of the yaw signal, a slow smoother and a speed limit keep what is left a
 * pan rather than a twitch, and 45°/s of turning uses the whole travel.
 */
export const FOLLOW_DEFAULTS = {
  yawFullDps: 45,
  deadDps: 12,
  travel: 0.6,
  smoothS: 1,
  maxRatePerS: 0.25,
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Where the window wants to be at one moment: away from the resting position towards the side the
 * bike is turning to, never further than the room that is left on that side.
 */
export function followTarget(yawDps: number, p0: number, o: Required<FollowOptions>): number {
  const v = yawDps || 0;
  const over = Math.abs(v) - o.deadDps;
  if (over <= 0) return clamp01(p0);
  const u = Math.sign(v) * Math.min(1, over / Math.max(1, o.yawFullDps - o.deadDps));
  const room = u > 0 ? 1 - p0 : p0;
  return clamp01(p0 + u * o.travel * room);
}

/**
 * The whole path for a recording: the target, smoothed in time and limited in speed, so the window
 * pans instead of jumping. One position per sample of `t`.
 */
export function followPath(
  t: ArrayLike<number>,
  yawDps: ArrayLike<number | null>,
  opts: FollowOptions,
): Float64Array {
  const o = { ...FOLLOW_DEFAULTS, ...opts, p0: clamp01(opts.p0) };
  const n = t.length;
  const out = new Float64Array(n);
  let pos = o.p0;
  // a gap in the signal holds the last turn rather than snapping the frame back to the middle
  let yaw = 0;
  for (let i = 0; i < n; i++) {
    const dt = i === 0 ? 0 : Math.max(0, Math.min(1, t[i] - t[i - 1]));
    const v = yawDps[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) yaw = v;
    const want = followTarget(yaw, o.p0, o);
    const a = dt > 0 ? dt / (o.smoothS + dt) : 0;
    let next = pos + (want - pos) * a;
    const step = o.maxRatePerS * dt;
    if (next - pos > step) next = pos + step;
    else if (pos - next > step) next = pos - step;
    pos = clamp01(next);
    out[i] = pos;
  }
  return out;
}

/** The position at a moment (the sample at or before it). */
export function followAt(t: ArrayLike<number>, path: ArrayLike<number>, time: number): number {
  const n = path.length;
  if (!n) return 0.5;
  let lo = 0;
  let hi = n - 1;
  if (time <= t[0]) return path[0];
  if (time >= t[hi]) return path[hi];
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= time) lo = mid;
    else hi = mid;
  }
  return path[lo];
}

/** The positions of one part, one per frame of the export. */
export function followFrames(
  t: ArrayLike<number>,
  path: ArrayLike<number>,
  startS: number,
  endS: number,
  fps: number,
): number[] {
  const n = Math.max(1, Math.round((endS - startS) * fps));
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(followAt(t, path, startS + k / fps));
  return out;
}

/**
 * The ffmpeg `sendcmd` file that moves the crop window of one part: per frame the x of the named
 * crop filter, in whole even pixels (4:2:0 chroma sits on even columns). Only a changed value costs
 * a line, so a straight road costs nothing.
 */
export function followCommands(
  pos: number[],
  fps: number,
  slackPx: number,
  target = 'crop@follow',
): string {
  const lines: string[] = [];
  let last = NaN;
  pos.forEach((p, k) => {
    const x = Math.min(slackPx, Math.max(0, Math.round((clamp01(p) * slackPx) / 2) * 2));
    if (x === last) return;
    lines.push(`${(k / fps).toFixed(4)} ${target} x ${x};`);
    last = x;
  });
  return lines.join('\n');
}
