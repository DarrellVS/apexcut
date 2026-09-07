import { describe, expect, it } from 'vitest';
import { fmtClock } from '@shared/format';

describe('fmtClock', () => {
  it('shows only the units that are there', () => {
    expect(fmtClock(0)).toBe('0 s');
    expect(fmtClock(30)).toBe('30 s');
    expect(fmtClock(70)).toBe('1:10');
    expect(fmtClock(1406)).toBe('23:26');
    expect(fmtClock(3725)).toBe('1:02:05');
    expect(fmtClock(36000)).toBe('10:00:00');
  });
  it('rounds and never goes negative', () => {
    expect(fmtClock(59.6)).toBe('1:00');
    expect(fmtClock(-5)).toBe('0 s');
    expect(fmtClock(NaN)).toBe('0 s');
  });
});
