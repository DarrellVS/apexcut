import { describe, expect, it } from 'vitest';
import {
  barFill,
  drawOverlayFrame,
  overlayCommands,
  overlayLayout,
  resample,
  type Ctx2D,
  type OverlaySpec,
} from '@core/overlay';

const spec = (s: Partial<OverlaySpec> = {}): OverlaySpec => ({
  style: 'dashboard',
  corner: 'bottom-left',
  size: 'M',
  ...s,
});

/** a context that records what was called, enough to prove drawing happened without a DOM */
function mockCtx(): Ctx2D & { calls: string[] } {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...a: unknown[]): void => {
      calls.push(`${name}(${a.map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(',')})`);
    };
  return {
    calls,
    save: rec('save'),
    restore: rec('restore'),
    translate: rec('translate'),
    rotate: rec('rotate'),
    beginPath: rec('beginPath'),
    arc: rec('arc'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    closePath: rec('closePath'),
    stroke: rec('stroke'),
    fill: rec('fill'),
    fillRect: rec('fillRect'),
    fillText: rec('fillText'),
    lineWidth: 1,
    lineCap: 'butt',
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
  };
}

describe('overlay layout', () => {
  it('stays inside the frame in every corner and size, 16:9 and 9:16', () => {
    for (const [w, h] of [
      [3840, 2160],
      [2160, 3840],
      [3840, 3840],
    ]) {
      for (const corner of ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const) {
        for (const size of ['S', 'M', 'L'] as const) {
          const L = overlayLayout(spec({ corner, size }), w, h);
          expect(L.x).toBeGreaterThanOrEqual(0);
          expect(L.y).toBeGreaterThanOrEqual(0);
          expect(L.x + L.box + (L.bar ? L.bar.w + L.bar.x - (L.x + L.box) : 0)).toBeLessThanOrEqual(
            w,
          );
          expect(L.numY).toBeLessThanOrEqual(h);
        }
      }
    }
  });
  it('grows with the size and has no bar in the minimal style', () => {
    const s = overlayLayout(spec({ size: 'S' }), 3840, 2160).box;
    const l = overlayLayout(spec({ size: 'L' }), 3840, 2160).box;
    expect(l).toBeGreaterThan(s);
    expect(overlayLayout(spec({ style: 'minimal' }), 3840, 2160).bar).toBeNull();
  });
});

describe('overlay drawing', () => {
  it('draws the number of the lean and rotates the bike', () => {
    const ctx = mockCtx();
    drawOverlayFrame(ctx, spec(), overlayLayout(spec(), 1920, 1080), {
      leanDeg: -27.4,
      aLonG: -0.3,
    });
    expect(ctx.calls.some((c) => c.startsWith('fillText(27°'))).toBe(true);
    expect(ctx.calls.filter((c) => c.startsWith('rotate(')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('g bar', () => {
  it('fills up for acceleration, down for braking, from the middle', () => {
    const bar = { y: 100, h: 200 };
    const up = barFill(0.4, bar);
    const down = barFill(-0.4, bar);
    expect(up.brake).toBe(false);
    expect(up.y + up.h).toBe(200);
    expect(down.brake).toBe(true);
    expect(down.y).toBe(200);
    expect(barFill(5, bar).h).toBe(100);
  });
});

describe('resample + commands', () => {
  const imuT = [0, 0.5, 1.0, 1.5, 2.0];
  const lean = [0, 10, 20, 20, 20];
  const aLon = [0, 0, -0.5, -0.5, 0];
  it('takes the latest 30 Hz value per frame', () => {
    const s = resample(imuT, lean, aLon, 0, 2, 2);
    expect(s.map((x) => x.leanDeg)).toEqual([0, 10, 20, 20]);
  });
  it('emits a command only when something changes and names the filters', () => {
    const L = overlayLayout(spec(), 1920, 1080);
    const s = resample(imuT, lean, aLon, 0, 2, 2);
    const cmd = overlayCommands(s, 2, spec(), L);
    expect(cmd).toContain('rotate@bike a');
    expect(cmd).toContain('rotate@needle a');
    expect(cmd).toContain('drawtext@num reinit text=20°');
    expect(cmd).toContain('drawbox@bar');
    // lean stays 20 from frame 2 on: no bike/needle/number lines for frame 3
    expect(cmd.split('\n').filter((l) => l.startsWith('1.5000 rotate')).length).toBe(0);
  });
  it('minimal style has no needle and no bar', () => {
    const sp = spec({ style: 'minimal' });
    const cmd = overlayCommands(
      resample(imuT, lean, aLon, 0, 2, 2),
      2,
      sp,
      overlayLayout(sp, 1920, 1080),
    );
    expect(cmd).not.toContain('needle');
    expect(cmd).not.toContain('drawbox');
  });
});
