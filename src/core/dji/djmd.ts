/**
 * DJI `djmd` track → per-frame motion data.
 *
 * Verified on Osmo Action 6 (firmware 02.01.19, proto dvtm_ac206.proto):
 *   top-level field 1 = file header, field 3 = one record per video frame (29.97 Hz)
 *   record.1.2  timestamp in microseconds
 *   record.2.9  attitude quaternion (w, x, y, z), unit norm, camera → world
 *   record.2.10 specific force (accelerometer) in g, camera frame: x forward, y right, z down
 * The MP4 and the LRF proxy carry identical records.
 */
import { asMap, f32Fields, parse, utf8 } from './pb';

export interface DjmdHeader {
  proto: string;
  firmware: string;
  serial: string;
  model: string;
  startTsUs: number | null;
}

export interface FrameMeta {
  /** seconds since first frame */
  t: Float64Array;
  tsUs: Float64Array;
  qw: Float64Array;
  qx: Float64Array;
  qy: Float64Array;
  qz: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  az: Float64Array;
  /** fraction of frames that carried a quaternion */
  quaternionCoverage: number;
}

export interface DjmdResult {
  header: DjmdHeader;
  frames: FrameMeta;
}

const FALLBACK_FPS = 29.97;

export function parseDjmd(raw: Uint8Array): DjmdResult {
  const header: DjmdHeader = { proto: '', firmware: '', serial: '', model: '', startTsUs: null };
  const records: Uint8Array[] = [];
  for (const f of parse(raw)) {
    if (f.field === 1 && f.wireType === 'bytes') {
      const h = asMap(f.value as Uint8Array);
      const inner = h.get(1);
      if (inner instanceof Uint8Array) {
        const hh = asMap(inner);
        header.proto = utf8(hh.get(1));
        header.firmware = utf8(hh.get(2));
        header.serial = utf8(hh.get(5));
        header.model = utf8(hh.get(10));
        header.startTsUs = typeof hh.get(9) === 'number' ? (hh.get(9) as number) : null;
      }
    } else if (f.field === 3 && f.wireType === 'bytes') {
      records.push(f.value as Uint8Array);
    }
  }

  const n = records.length;
  const mk = (): Float64Array => new Float64Array(n).fill(NaN);
  const frames: FrameMeta = {
    t: mk(),
    tsUs: mk(),
    qw: mk(),
    qx: mk(),
    qy: mk(),
    qz: mk(),
    ax: mk(),
    ay: mk(),
    az: mk(),
    quaternionCoverage: 0,
  };
  let withQ = 0;
  records.forEach((rec, i) => {
    const m = asMap(rec);
    const meta1 = m.get(1);
    if (meta1 instanceof Uint8Array) {
      const ts = asMap(meta1).get(2);
      if (typeof ts === 'number') frames.tsUs[i] = ts;
    }
    const meta2 = m.get(2);
    if (meta2 instanceof Uint8Array) {
      const m2 = asMap(meta2);
      const q = m2.get(9);
      if (q instanceof Uint8Array) {
        const qf = f32Fields(q);
        frames.qw[i] = qf.get(1) ?? NaN;
        frames.qx[i] = qf.get(2) ?? NaN;
        frames.qy[i] = qf.get(3) ?? NaN;
        frames.qz[i] = qf.get(4) ?? NaN;
        if (!Number.isNaN(frames.qw[i])) withQ++;
      }
      const a = m2.get(10);
      if (a instanceof Uint8Array) {
        const af = f32Fields(a);
        frames.ax[i] = af.get(2) ?? NaN;
        frames.ay[i] = af.get(3) ?? NaN;
        frames.az[i] = af.get(4) ?? NaN;
      }
    }
  });
  frames.quaternionCoverage = n ? withQ / n : 0;

  const firstTs = frames.tsUs.find((v) => !Number.isNaN(v));
  if (firstTs !== undefined) {
    for (let i = 0; i < n; i++) frames.t[i] = (frames.tsUs[i] - firstTs) / 1e6;
  } else {
    for (let i = 0; i < n; i++) frames.t[i] = i / FALLBACK_FPS;
  }
  return { header, frames };
}
