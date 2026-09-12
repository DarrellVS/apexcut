/**
 * What every camera has to give us before the maths starts: per-sample time, attitude and the
 * accelerometer, in one frame of reference — x forward, y right, z down, acceleration in g, so an
 * upright camera at rest reads az ≈ −1. DJI hands this over directly (`core/dji`); GoPro is fused
 * from its accelerometer and gyroscope first (`core/gopro`). Everything downstream — IMU maths,
 * scoring, the overlay — only ever sees this.
 */
export interface FrameMeta {
  /** seconds since the first sample */
  t: Float64Array;
  tsUs: Float64Array;
  qw: Float64Array;
  qx: Float64Array;
  qy: Float64Array;
  qz: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  az: Float64Array;
  /** fraction of samples that carried an attitude */
  quaternionCoverage: number;
}
