/**
 * The rider's own mark: two fingers held up to the camera.
 *
 * A hand in a glove in front of a helmet camera is a big, flat, near-black shape that was not there
 * a moment ago, with two fingers sticking out of it. That is what this looks for, frame by frame,
 * on small grey pictures — no model, no recognising *what* anything is:
 *
 * 1. **New and dark.** A background that brightens at once but darkens slowly, so a hand held up
 *    never becomes part of it while a tunnel or a cloud does. The hand is what is much darker than
 *    that background.
 * 2. **One lump, big enough.** The largest connected dark area, between 5 % and 50 % of the frame —
 *    a hand at arm's length from a wide-angle lens is huge.
 * 3. **Flat.** Almost no texture inside it (a glove is one colour; a hedge, a row of houses or a
 *    tree is not). This is what separates a real mark from the dark things a road is full of.
 * 4. **Two fingers.** Lines drawn across the top half of the lump cross exactly two runs — the two
 *    fingers — on most of those lines, and never four or five (that would be an open hand).
 * 5. **Held.** All of that for at least three frames in a row, so a single odd frame marks nothing.
 *
 * Measured on real recordings (see docs/gestures.md): it finds the gesture when it is held for
 * about a second, and marks something wrongly about once per twenty minutes of riding in the dark,
 * never in daylight.
 */

/** how the pictures are sampled and what counts as the gesture */
export const GESTURE = {
  /** the grey picture the detector works on */
  width: 256,
  height: 256,
  /** frames a second taken out of the recording */
  fps: 8,
  /** how much darker than the background a pixel has to be, and how much of it is left */
  darkerBy: 35,
  darkerFactor: 0.65,
  /** how big the hand is, as a share of the picture */
  minArea: 0.05,
  maxArea: 0.5,
  /** a finger is at least this wide, as a share of the picture width */
  minFingerWidth: 0.012,
  /** how much of the top of the hand shows exactly two fingers, and how many lines at least */
  minTwoShare: 0.45,
  minTwoLines: 12,
  /** an open hand shows four or five fingers: never more than this share of the lines */
  maxOpenShare: 0.15,
  /** how flat the shape has to be (grey levels of variation inside it) */
  maxTexture: 8,
  /** how far down the picture the middle of the hand is: it is held in front of you, not in the sky */
  minCentreY: 0.35,
  /** how many frames in a row before it counts as a mark */
  minFrames: 3,
} as const;

/** one moment the rider marked */
export interface GestureMark {
  /** when the gesture starts, seconds into the recording */
  tS: number;
  /** how many frames in a row it was seen */
  frames: number;
}

/** what one frame looks like to the detector; exported for the tests */
export interface FrameShape {
  /** share of the picture the lump takes */
  area: number;
  /** share of the lines across its top that cross exactly two fingers */
  twoShare: number;
  /** how many such lines there are */
  twoLines: number;
  /** share of lines that cross four fingers or more */
  openShare: number;
  /** how much the grey varies inside the lump */
  texture: number;
  /** where the middle of the lump sits, 0 = the top of the picture, 1 = the bottom */
  centreY: number;
}

const EMPTY: FrameShape = {
  area: 0,
  twoShare: 0,
  twoLines: 0,
  openShare: 0,
  texture: 0,
  centreY: 0,
};

/** Is this frame a hand held up with two fingers? */
export function isGesture(s: FrameShape): boolean {
  return (
    s.area >= GESTURE.minArea &&
    s.area <= GESTURE.maxArea &&
    s.twoShare >= GESTURE.minTwoShare &&
    s.twoLines >= GESTURE.minTwoLines &&
    s.openShare <= GESTURE.maxOpenShare &&
    s.texture <= GESTURE.maxTexture &&
    s.centreY >= GESTURE.minCentreY
  );
}

/**
 * What the biggest new dark lump in this frame looks like. `frame` and `background` are grey
 * pictures of `width` × `height` bytes.
 */
export function frameShape(
  frame: Uint8Array,
  background: Uint8Array,
  width: number = GESTURE.width,
  height: number = GESTURE.height,
): FrameShape {
  const n = width * height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (
      frame[i] < background[i] - GESTURE.darkerBy &&
      frame[i] < background[i] * GESTURE.darkerFactor
    ) {
      mask[i] = 1;
    }
  }
  // the largest lump of it (flood fill, four neighbours)
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let bestId = -1;
  let bestSize = 0;
  let id = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    let top = 0;
    stack[top++] = i;
    label[i] = id;
    let size = 0;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % width;
      const y = (p / width) | 0;
      if (x > 0 && mask[p - 1] && label[p - 1] < 0) {
        label[p - 1] = id;
        stack[top++] = p - 1;
      }
      if (x < width - 1 && mask[p + 1] && label[p + 1] < 0) {
        label[p + 1] = id;
        stack[top++] = p + 1;
      }
      if (y > 0 && mask[p - width] && label[p - width] < 0) {
        label[p - width] = id;
        stack[top++] = p - width;
      }
      if (y < height - 1 && mask[p + width] && label[p + width] < 0) {
        label[p + width] = id;
        stack[top++] = p + width;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestId = id;
    }
    id++;
  }
  if (bestId < 0 || bestSize < 16) return EMPTY;

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (label[i] !== bestId) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sum += frame[i];
      sumSq += frame[i] * frame[i];
    }
  }
  const mean = sum / bestSize;
  const texture = Math.sqrt(Math.max(0, sumSq / bestSize - mean * mean));

  // lines across the top half of the lump: how many fingers does each cross?
  const minFinger = Math.max(2, Math.round(width * GESTURE.minFingerWidth));
  const lastRow = minY + Math.round((maxY - minY) * 0.55);
  let lines = 0;
  let twoLines = 0;
  let openLines = 0;
  for (let y = minY; y <= lastRow; y++) {
    let fingers = 0;
    let run = 0;
    for (let x = minX; x <= maxX + 1; x++) {
      const inside = x <= maxX && label[y * width + x] === bestId;
      if (inside) run++;
      else {
        if (run >= minFinger) fingers++;
        run = 0;
      }
    }
    lines++;
    if (fingers === 2) twoLines++;
    else if (fingers >= 4) openLines++;
  }
  return {
    area: bestSize / n,
    twoShare: lines ? twoLines / lines : 0,
    twoLines,
    openShare: lines ? openLines / lines : 0,
    texture,
    centreY: (minY + maxY) / 2 / height,
  };
}

/**
 * Walks a recording frame by frame and remembers where the rider held two fingers up. Feed it grey
 * frames in order; `marks()` gives what it found.
 */
export class GestureDetector {
  private readonly background: Uint8Array;
  private started = false;
  private index = 0;
  private streak = 0;
  private streakStart = 0;
  private readonly found: GestureMark[] = [];

  constructor(
    private readonly fps: number = GESTURE.fps,
    private readonly width: number = GESTURE.width,
    private readonly height: number = GESTURE.height,
  ) {
    this.background = new Uint8Array(width * height);
  }

  /** one frame, in order */
  push(frame: Uint8Array): void {
    const n = this.width * this.height;
    if (!this.started) {
      this.background.set(frame.subarray(0, n));
      this.started = true;
      this.index++;
      return;
    }
    const shape = frameShape(frame, this.background, this.width, this.height);
    // the background brightens at once and darkens three levels a frame, so a hand never joins it
    for (let i = 0; i < n; i++) {
      const bg = this.background[i];
      this.background[i] =
        frame[i] >= bg ? bg + Math.ceil((frame[i] - bg) * 0.3) : Math.max(frame[i], bg - 3);
    }
    // the first second is the background settling down, not a gesture
    if (this.index > this.fps) {
      if (isGesture(shape)) {
        if (!this.streak) this.streakStart = this.index;
        this.streak++;
      } else {
        this.close();
      }
    }
    this.index++;
  }

  private close(): void {
    if (this.streak >= GESTURE.minFrames) {
      this.found.push({ tS: this.streakStart / this.fps, frames: this.streak });
    }
    this.streak = 0;
  }

  /** every moment the rider marked, in order */
  marks(): GestureMark[] {
    this.close();
    return this.found;
  }
}
