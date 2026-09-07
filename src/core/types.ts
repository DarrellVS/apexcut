/** Reason keys are stored on disk; the UI maps them to English labels. */
export type Reason = 'bochten' | 'accel/rem' | 'beide' | 'handmatig' | 'samengeplakt';

export interface ScoreConfig {
  fs: number;
  window_s: number;
  weights: { lean: number; yaw: number; accel: number; rpm?: number };
  yaw_gate_lean_deg: number;
  yaw_sustain_s: number;
  speed_window_s: number;
  speed_min_yaw_dps: number;
  speed_gate_lo_mps: number;
  speed_gate_hi_mps: number;
  lean_yaw_lo_dps: number;
  lean_yaw_hi_dps: number;
  accel_near_lean_s: number;
  accel_lean_lo_deg: number;
  accel_lean_hi_deg: number;
  smooth_s: number;
  threshold_pct: number;
  threshold_abs: number | null;
  merge_gap_s: number;
  min_dur_s: number;
  pad_s: number;
  norm_clip: number;
}

/** An automatically detected highlight (before user editing). */
export interface Segment {
  start_s: number;
  end_s: number;
  core_start_s: number;
  core_end_s: number;
  score: number;
  peak: number;
  max_lean_deg: number;
  max_brake_g: number;
  max_accel_g: number;
  reden: Reason;
}

/** A part as the user sees and edits it. */
export interface Part extends Partial<Omit<Segment, 'start_s' | 'end_s' | 'reden'>> {
  id: string;
  start_s: number;
  end_s: number;
  reden: Reason;
  enabled: boolean;
  manual: boolean;
  /** for joined parts: the original pieces */
  parts?: [number, number][];
  /** a favourite: always kept by automatic picks, exportable on its own */
  starred?: boolean;
}
