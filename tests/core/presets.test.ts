import { describe, expect, it } from 'vitest';
import { PRESET_IDS, PRESETS, presetConfig, presetOf } from '@core/presets';
import { DEFAULT_CONFIG } from '@core/score';

describe('sensitivity presets', () => {
  it('Sporty is exactly the default configuration (keeps the parity fixture valid)', () => {
    expect(presetConfig('sporty')).toEqual(DEFAULT_CONFIG);
    expect(PRESETS.sporty.config).toEqual({});
  });

  it('every preset is recognised from its own config', () => {
    for (const id of PRESET_IDS) expect(presetOf(presetConfig(id))).toBe(id);
  });

  it('a touched slider makes it Custom, weights do not', () => {
    expect(presetOf({ ...presetConfig('sporty'), min_dur_s: 6 })).toBe('custom');
    expect(
      presetOf({
        ...presetConfig('track'),
        weights: { lean: 0.9, yaw: 0.05, accel: 0.05, rpm: 0 },
      }),
    ).toBe('track');
    expect(presetOf(null)).toBe('sporty');
  });

  it('Relaxed is more lenient than Sporty, Track stricter', () => {
    const r = presetConfig('relaxed');
    const s = presetConfig('sporty');
    const t = presetConfig('track');
    expect(r.threshold_pct).toBeLessThan(s.threshold_pct);
    expect(t.threshold_pct).toBeGreaterThan(s.threshold_pct);
    expect(r.min_dur_s).toBeGreaterThan(s.min_dur_s);
    expect(t.min_dur_s).toBeLessThan(s.min_dur_s);
    expect(r.speed_gate_lo_mps).toBeLessThan(s.speed_gate_lo_mps);
    expect(t.speed_gate_lo_mps).toBeGreaterThan(s.speed_gate_lo_mps);
  });
});
