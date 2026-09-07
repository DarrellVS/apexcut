/**
 * Minimal schema-less protobuf wire-format decoder.
 *
 * DJI's `djmd` metadata track is protobuf (dvtm_ac206.proto) without a public schema, so records are
 * decoded by field number and wire type only. Pure TypeScript, no dependencies.
 */

export type WireType = 'varint' | 'f32' | 'f64' | 'bytes';

export interface PbField {
  field: number;
  wireType: WireType;
  /** number for varint/f32/f64 (varints above 2^53 lose precision), Uint8Array for bytes */
  value: number | Uint8Array;
}

function readVarint(b: Uint8Array, i: number): [number, number] {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    if (i >= b.length) throw new RangeError('truncated varint');
    const c = b[i++];
    result |= BigInt(c & 0x7f) << shift;
    shift += 7n;
    if (!(c & 0x80)) return [Number(result), i];
  }
}

/** Decode one message into its list of fields (repeated fields appear multiple times). */
export function parse(b: Uint8Array): PbField[] {
  const out: PbField[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 0;
  while (i < b.length) {
    const [key, next] = readVarint(b, i);
    i = next;
    const field = key >>> 3;
    const wt = key & 7;
    switch (wt) {
      case 0: {
        const [v, n] = readVarint(b, i);
        i = n;
        out.push({ field, wireType: 'varint', value: v });
        break;
      }
      case 1:
        out.push({ field, wireType: 'f64', value: view.getFloat64(i, true) });
        i += 8;
        break;
      case 5:
        out.push({ field, wireType: 'f32', value: view.getFloat32(i, true) });
        i += 4;
        break;
      case 2: {
        const [len, n] = readVarint(b, i);
        i = n;
        out.push({ field, wireType: 'bytes', value: b.subarray(i, i + len) });
        i += len;
        break;
      }
      default:
        throw new RangeError(`unsupported wire type ${wt} at offset ${i}`);
    }
  }
  return out;
}

/** Decode into a field → value map; the last occurrence wins for repeated fields. */
export function asMap(b: Uint8Array): Map<number, number | Uint8Array> {
  const m = new Map<number, number | Uint8Array>();
  for (const f of parse(b)) m.set(f.field, f.value);
  return m;
}

/** Float32 fields of a message keyed by field number. */
export function f32Fields(b: Uint8Array): Map<number, number> {
  const m = new Map<number, number>();
  for (const f of parse(b)) if (f.wireType === 'f32') m.set(f.field, f.value as number);
  return m;
}

export function utf8(v: number | Uint8Array | undefined): string {
  return v instanceof Uint8Array ? new TextDecoder().decode(v) : '';
}
