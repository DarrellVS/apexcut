/**
 * GoPro `gpmd` track → the streams inside it.
 *
 * GPMF is key-length-value: a four-character key, a one-character type, the size of one item, and
 * how many of them follow, padded to four bytes. `\0` as the type means the value is more KLV, so
 * the file is a tree: every payload is a `DEVC` device, each `DEVC` holds `STRM` streams, and a
 * stream holds its data (`ACCL`, `GYRO`, `CORI`, …) next to the things that explain it — `SCAL`
 * (divide by this), `STNM` (its name in words), `TSMP` (how many samples so far) and `STMP` (when
 * the payload starts, in microseconds).
 *
 * Verified against GoPro's own sample recordings (gopro/gpmf-parser): Hero5, Hero7 and Hero8, which
 * between them cover a camera with no orientation hints (Hero5), one with axis strings (Hero7) and
 * one that also carries its own fused attitude (Hero8).
 */

/** the numbers of one stream in one payload, already scaled */
export interface GpmfStream {
  key: string;
  /** one row per sample; a row is one value per axis */
  rows: number[][];
  /** the stream's name in words, when the camera writes one */
  name: string;
  /** how the axes are ordered on the wire, e.g. "ZXY" (upper case = as is, lower = negated) */
  orderOut: string;
}

export interface GpmfPayload {
  /** device name, e.g. "Hero8 Black" */
  device: string;
  /** when this payload starts, seconds, when the camera says so */
  stampS: number | null;
  streams: Map<string, GpmfStream>;
}

const ITEM_BYTES: Record<string, number> = {
  b: 1,
  B: 1,
  s: 2,
  S: 2,
  l: 4,
  L: 4,
  f: 4,
  d: 8,
  j: 8,
  J: 8,
  q: 4,
  Q: 8,
  F: 4,
  U: 1,
  c: 1,
};

const fourcc = (b: Uint8Array, i: number): string =>
  String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

function one(v: DataView, off: number, type: string): number {
  switch (type) {
    case 'b':
      return v.getInt8(off);
    case 'B':
      return v.getUint8(off);
    case 's':
      return v.getInt16(off);
    case 'S':
      return v.getUint16(off);
    case 'l':
      return v.getInt32(off);
    case 'L':
      return v.getUint32(off);
    case 'f':
      return v.getFloat32(off);
    case 'd':
      return v.getFloat64(off);
    case 'j':
      return Number(v.getBigInt64(off));
    case 'J':
      return Number(v.getBigUint64(off));
    // fixed point
    case 'q':
      return v.getInt32(off) / 65536;
    case 'Q':
      return Number(v.getBigInt64(off)) / 4294967296;
    default:
      return NaN;
  }
}

/** the rows of one KLV item: `size` bytes per sample, `repeat` samples, one value per axis */
function rows(v: DataView, off: number, type: string, size: number, repeat: number): number[][] {
  const unit = ITEM_BYTES[type];
  if (!unit || type === 'c' || type === 'F' || type === 'U') return [];
  const perRow = Math.floor(size / unit);
  const out: number[][] = [];
  for (let r = 0; r < repeat; r++) {
    const row: number[] = [];
    for (let k = 0; k < perRow; k++) row.push(one(v, off + r * size + k * unit, type));
    out.push(row);
  }
  return out;
}

const text = (b: Uint8Array, off: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[off + i]);
  return s.replace(/\0+$/, '');
};

interface Klv {
  key: string;
  type: string;
  size: number;
  repeat: number;
  /** where the value starts and ends */
  from: number;
  to: number;
  /** where the next item starts */
  next: number;
}

function* items(b: Uint8Array, start: number, end: number): Generator<Klv> {
  let i = start;
  while (i + 8 <= end) {
    const key = fourcc(b, i);
    const type = String.fromCharCode(b[i + 4]);
    const size = b[i + 5];
    const repeat = (b[i + 6] << 8) | b[i + 7];
    const len = size * repeat;
    const from = i + 8;
    const to = from + len;
    if (to > end) return;
    const next = to + ((4 - (len % 4)) % 4);
    yield { key, type, size, repeat, from, to, next };
    if (next <= i) return;
    i = next;
  }
}

/** the streams we actually use; everything else is skipped without reading it */
const WANTED = new Set(['ACCL', 'GYRO', 'CORI', 'GRAV', 'IORI']);

function readStream(b: Uint8Array, v: DataView, start: number, end: number): GpmfStream | null {
  let scal: number[] = [];
  let name = '';
  let orderOut = '';
  let data: Klv | null = null;
  for (const it of items(b, start, end)) {
    if (it.key === 'SCAL') scal = rows(v, it.from, it.type, it.size, it.repeat).map((r) => r[0]);
    else if (it.key === 'STNM') name = text(b, it.from, it.to - it.from);
    else if (it.key === 'ORIO') orderOut = text(b, it.from, it.to - it.from);
    else if (WANTED.has(it.key)) data = it;
  }
  if (!data) return null;
  const raw = rows(v, data.from, data.type, data.size, data.repeat);
  const scaled = raw.map((row) => row.map((x, c) => x / (scal[c] ?? scal[0] ?? 1)));
  return { key: data.key, rows: scaled, name, orderOut };
}

/** Every payload of a `gpmd` track, in order. */
export function parseGpmf(raw: Uint8Array): GpmfPayload[] {
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out: GpmfPayload[] = [];
  for (const devc of items(raw, 0, raw.length)) {
    if (devc.key !== 'DEVC' || devc.type !== '\0') continue;
    const payload: GpmfPayload = { device: '', stampS: null, streams: new Map() };
    for (const it of items(raw, devc.from, devc.to)) {
      if (it.key === 'DVNM') payload.device = text(raw, it.from, it.to - it.from);
      else if (it.key === 'STMP') {
        const us = rows(v, it.from, it.type, it.size, it.repeat)[0]?.[0];
        if (Number.isFinite(us)) payload.stampS = us / 1e6;
      } else if (it.key === 'TICK' && payload.stampS === null) {
        const ms = rows(v, it.from, it.type, it.size, it.repeat)[0]?.[0];
        if (Number.isFinite(ms)) payload.stampS = ms / 1e3;
      } else if (it.key === 'STRM' && it.type === '\0') {
        const s = readStream(raw, v, it.from, it.to);
        if (s) payload.streams.set(s.key, s);
      }
    }
    out.push(payload);
  }
  return out;
}

export interface GpmfSeries {
  t: Float64Array;
  /** one row per sample */
  rows: number[][];
}

/**
 * One stream over the whole recording, with a time per sample. The camera stamps each payload, not
 * each sample, so a payload's samples are spread evenly over it — which is what the sensors do.
 * Payloads without a stamp (older cameras) are spread over the recording instead.
 */
export function gpmfSeries(
  payloads: GpmfPayload[],
  key: string,
  durationS: number,
): GpmfSeries | null {
  if (!payloads.some((p) => p.streams.has(key))) return null;
  const span = durationS / payloads.length;
  // stamps are the camera's own clock: usable once shifted to the start of the recording, and only
  // when they run forward and cover roughly the recording (a Hero5 stamps its uptime instead)
  const stamps = payloads.map((p) => p.stampS);
  const usable =
    payloads.length > 1 &&
    stamps.every((v, i) => v !== null && (i === 0 || v >= (stamps[i - 1] as number))) &&
    (stamps[stamps.length - 1] as number) - (stamps[0] as number) <= durationS * 1.5;
  const startOf = (i: number): number =>
    usable ? (stamps[i] as number) - (stamps[0] as number) : i * span;
  const t: number[] = [];
  const rowsOut: number[][] = [];
  payloads.forEach((p, i) => {
    const s = p.streams.get(key);
    if (!s || !s.rows.length) return;
    const from = startOf(i);
    const to = i + 1 < payloads.length ? startOf(i + 1) : Math.max(from + span, durationS);
    // the samples fill their own payload and never run into the next one
    const step = (to > from ? to - from : span) / s.rows.length;
    s.rows.forEach((row, j) => {
      t.push(from + j * step);
      rowsOut.push(row);
    });
  });
  if (!t.length) return null;
  return { t: Float64Array.from(t), rows: rowsOut };
}
