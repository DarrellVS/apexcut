import { describe, expect, it } from 'vitest';
import { joinParts } from '@core/selection';
import type { Part } from '@core/types';

const part = (id: string, start: number, end: number, extra: Partial<Part> = {}): Part => ({
  id,
  start_s: start,
  end_s: end,
  reden: 'bochten',
  enabled: true,
  manual: false,
  ...extra,
});

describe('favourites', () => {
  it('a joined part is starred when any member was', () => {
    expect(joinParts([part('a', 0, 5, { starred: true }), part('b', 6, 10)]).starred).toBe(true);
  });
  it('a joined part of unstarred members carries no star', () => {
    expect(joinParts([part('a', 0, 5), part('b', 6, 10)]).starred).toBeUndefined();
  });
});
