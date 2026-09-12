import { describe, expect, it } from 'vitest';
import { frameShape, GESTURE, GestureDetector, isGesture } from '@core/gesture';
import { marksToParts, MARK_AFTER_S, MARK_BEFORE_S } from '@core/selection';

/**
 * The rider's own mark: two fingers held up to the camera. The pictures here are drawn by hand —
 * a bright scene, and a flat black hand with a given number of fingers — which is exactly what the
 * detector is meant to react to. Real recordings are checked end to end (tests/e2e/gesture.spec.ts).
 */
const { width: W, height: H } = GESTURE;

function scene(grey = 180): Uint8Array {
  const f = new Uint8Array(W * H).fill(grey);
  // a little noise, so nothing depends on a perfectly flat picture
  for (let i = 0; i < f.length; i += 7) f[i] = grey - 3;
  return f;
}

/** draw a black hand: a palm at the bottom and `fingers` fingers sticking up */
function hand(frame: Uint8Array, fingers: number, grey = 10): Uint8Array {
  const out = Uint8Array.from(frame);
  const palmTop = Math.round(H * 0.58);
  const left = Math.round(W * 0.36);
  const right = Math.round(W * 0.64);
  for (let y = palmTop; y < H; y++) for (let x = left; x < right; x++) out[y * W + x] = grey;
  const span = right - left;
  const fingerW = Math.round(span / (fingers * 2));
  for (let k = 0; k < fingers; k++) {
    const x0 = left + Math.round(((k * 2 + 0.5) * span) / (fingers * 2));
    for (let y = Math.round(H * 0.3); y < palmTop; y++) {
      for (let x = x0; x < x0 + fingerW; x++) out[y * W + x] = grey;
    }
  }
  return out;
}

describe('what the detector sees in one frame', () => {
  const bg = scene();

  it('sees nothing in a picture that did not change', () => {
    const s = frameShape(scene(), bg);
    expect(s.area).toBe(0);
    expect(isGesture(s)).toBe(false);
  });

  it('sees two fingers when two fingers are held up', () => {
    const s = frameShape(hand(scene(), 2), bg);
    expect(s.area).toBeGreaterThan(GESTURE.minArea);
    expect(s.twoShare).toBeGreaterThan(GESTURE.minTwoShare);
    expect(s.texture).toBeLessThan(GESTURE.maxTexture);
    expect(isGesture(s)).toBe(true);
  });

  it('is not fooled by one finger, a fist or an open hand', () => {
    expect(isGesture(frameShape(hand(scene(), 1), bg))).toBe(false);
    expect(isGesture(frameShape(hand(scene(), 0), bg))).toBe(false);
    expect(isGesture(frameShape(hand(scene(), 5), bg))).toBe(false);
  });

  it('is not fooled by something dark with texture in it, like a hedge', () => {
    const hedge = hand(scene(), 2);
    for (let i = 0; i < hedge.length; i++) if (hedge[i] < 60) hedge[i] = 10 + (i % 60);
    const s = frameShape(hedge, bg);
    expect(s.texture).toBeGreaterThan(GESTURE.maxTexture);
    expect(isGesture(s)).toBe(false);
  });

  it('is not fooled by the whole picture going dark, like a tunnel', () => {
    expect(isGesture(frameShape(scene(20), bg))).toBe(false);
  });

  it('wants the hand in front of the rider, not up in the sky', () => {
    const high = new Uint8Array(W * H).fill(180);
    for (let y = 0; y < Math.round(H * 0.25); y++) {
      for (let x = Math.round(W * 0.3); x < Math.round(W * 0.7); x++) high[y * W + x] = 10;
    }
    expect(frameShape(high, bg).centreY).toBeLessThan(GESTURE.minCentreY);
    expect(isGesture(frameShape(high, bg))).toBe(false);
  });
});

describe('walking through a recording', () => {
  /** a recording of `seconds` with the gesture held from `from` to `to` */
  function marksOf(seconds: number, from: number, to: number): { tS: number }[] {
    const det = new GestureDetector();
    const frames = seconds * GESTURE.fps;
    for (let i = 0; i < frames; i++) {
      const t = i / GESTURE.fps;
      det.push(t >= from && t < to ? hand(scene(), 2) : scene());
    }
    return det.marks();
  }

  it('marks a gesture that is held for about a second', () => {
    const marks = marksOf(6, 2, 3.1);
    expect(marks).toHaveLength(1);
    expect(marks[0].tS).toBeGreaterThanOrEqual(2);
    expect(marks[0].tS).toBeLessThan(3.1);
  });

  it('marks nothing in a recording where nothing happens', () => {
    expect(marksOf(6, 99, 99)).toHaveLength(0);
  });

  it('needs more than a single frame, so a flicker marks nothing', () => {
    expect(marksOf(6, 2, 2 + 1 / GESTURE.fps)).toHaveLength(0);
  });

  it('finds every gesture of a ride, in order', () => {
    const det = new GestureDetector();
    for (let i = 0; i < 30 * GESTURE.fps; i++) {
      const t = i / GESTURE.fps;
      const holding = (t >= 3 && t < 4.2) || (t >= 12 && t < 13.5) || (t >= 25 && t < 26.2);
      det.push(holding ? hand(scene(), 2) : scene());
    }
    const marks = det.marks();
    expect(marks).toHaveLength(3);
    expect(marks.map((m) => Math.round(m.tS))).toEqual([3, 12, 25]);
  });
});

describe('a mark becomes a part', () => {
  it('keeps the seconds before your hand went up, and a couple after', () => {
    const [p] = marksToParts([{ tS: 60 }], 600);
    expect(p.start_s).toBe(60 - MARK_BEFORE_S);
    expect(p.end_s).toBe(60 + MARK_AFTER_S);
    expect(p.marked).toBe(true);
    expect(p.marked_at).toBe(60);
    // manual, so rescoring and a new preset leave it alone
    expect(p.manual).toBe(true);
    expect(p.enabled).toBe(true);
  });

  it('never runs off either end of the video', () => {
    const [start] = marksToParts([{ tS: 3 }], 600);
    expect(start.start_s).toBe(0);
    const [end] = marksToParts([{ tS: 599 }], 600);
    expect(end.end_s).toBe(600);
  });

  it('does not lay two marks on top of each other', () => {
    const parts = marksToParts([{ tS: 20 }, { tS: 24 }], 600);
    expect(parts).toHaveLength(2);
    expect(parts[1].start_s).toBeGreaterThanOrEqual(parts[0].end_s);
  });

  it('takes the marks in the order they were made', () => {
    const parts = marksToParts([{ tS: 100 }, { tS: 20 }], 600);
    expect(parts.map((p) => p.marked_at)).toEqual([20, 100]);
  });
});
