import { describe, expect, it } from 'vitest';
import { plain } from '@shared/plain';

describe('plain', () => {
  it('leaves primitives alone', () => {
    expect(plain(3)).toBe(3);
    expect(plain('a')).toBe('a');
    expect(plain(null)).toBeNull();
    expect(plain(undefined)).toBeUndefined();
  });
  it('strips proxies so structured clone accepts the value', () => {
    const proxied = new Proxy({ parts: new Proxy([{ start_s: 1 }], {}) }, {});
    expect(() => structuredClone(proxied)).toThrow();
    const p = plain(proxied);
    expect(() => structuredClone(p)).not.toThrow();
    expect(p).toEqual({ parts: [{ start_s: 1 }] });
  });
  it('passes class instances through untouched (File, Date, …)', () => {
    const d = new Date(0);
    expect(plain(d)).toBe(d);
    const fn = (): number => 1;
    expect(plain(fn)).toBe(fn);
  });
  it('copies nested plain data unchanged', () => {
    const v = { a: [1, 2, { b: 'x' }], c: { d: true, e: null } };
    expect(plain(v)).toEqual(v);
    expect(plain(v)).not.toBe(v);
  });
});
