/**
 * Sensitivity presets: three ride types instead of percentiles. Sporty = the defaults (and the
 * parity fixture). Relaxed picks fewer, longer parts with gentler gates; Track is strict and short.
 * Values are documented in docs/scoring.md (Presets).
 */
import { DEFAULT_CONFIG } from './score';
import type { ScoreConfig } from './types';

export const PRESET_IDS = ['relaxed', 'sporty', 'track'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface PresetInfo {
  id: PresetId;
  label: string;
  hint: string;
  config: Partial<ScoreConfig>;
}

export const PRESETS: Record<PresetId, PresetInfo> = {
  relaxed: {
    id: 'relaxed',
    label: 'Relaxed',
    hint: 'Touring pace: fewer, longer parts, gentle corners count too',
    config: {
      threshold_pct: 65,
      min_dur_s: 8,
      merge_gap_s: 5,
      pad_s: 2,
      speed_gate_lo_mps: 2,
      speed_gate_hi_mps: 5,
      lean_yaw_lo_dps: 1.5,
      lean_yaw_hi_dps: 5,
      accel_near_lean_s: 8,
    },
  },
  sporty: {
    id: 'sporty',
    label: 'Sporty',
    hint: 'Twisty roads: the default balance',
    config: {},
  },
  track: {
    id: 'track',
    label: 'Track',
    hint: 'Only the sharpest corners and hardest braking, short parts',
    config: {
      threshold_pct: 85,
      min_dur_s: 3,
      merge_gap_s: 2,
      pad_s: 1,
      speed_gate_lo_mps: 4,
      speed_gate_hi_mps: 8,
      lean_yaw_lo_dps: 3,
      lean_yaw_hi_dps: 10,
      accel_near_lean_s: 4,
    },
  },
};

/** The keys a preset may set — used to decide whether a config still matches a preset. */
const PRESET_KEYS = [
  'threshold_pct',
  'min_dur_s',
  'merge_gap_s',
  'pad_s',
  'speed_gate_lo_mps',
  'speed_gate_hi_mps',
  'lean_yaw_lo_dps',
  'lean_yaw_hi_dps',
  'accel_near_lean_s',
] as const satisfies readonly (keyof ScoreConfig)[];

/** Full config of a preset (defaults + overrides). */
export function presetConfig(id: PresetId): ScoreConfig {
  return { ...DEFAULT_CONFIG, weights: { ...DEFAULT_CONFIG.weights }, ...PRESETS[id].config };
}

/** Which preset a config equals on the preset keys, or 'custom'. Weights are ignored on purpose. */
export function presetOf(cfg: ScoreConfig | null | undefined): PresetId | 'custom' {
  if (!cfg) return 'sporty';
  for (const id of PRESET_IDS) {
    const p = presetConfig(id);
    if (PRESET_KEYS.every((k) => Math.abs((cfg[k] as number) - (p[k] as number)) < 1e-9)) return id;
  }
  return 'custom';
}
