/**
 * Worker thread for the heavy part of a scan: reading the camera's motion track, IMU maths and
 * scoring. Keeps the main process (IPC, window) responsive while several videos are scanned. Pure
 * `src/core` code only. DJI hands over an attitude of its own; GoPro is fused from its
 * accelerometer and gyroscope first (`core/gopro`), and both end up as the same frames.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { parseDjmd } from '@core/dji/djmd';
import type { FrameMeta } from '@core/frames';
import { parseGopro } from '@core/gopro';
import { derive } from '@core/imu';
import { compute } from '@core/score';
import type { ScoreConfig } from '@core/types';

export interface AnalyzeInput {
  raw: Uint8Array;
  cfg?: Partial<ScoreConfig>;
  /** which camera wrote the track, and how long the recording is (GoPro stamps per payload) */
  camera: 'dji' | 'gopro';
  durationS: number;
}

const { raw, cfg, camera, durationS } = workerData as AnalyzeInput;
try {
  const read = (): { header: object; frames: FrameMeta } =>
    camera === 'gopro' ? parseGopro(raw, durationS) : parseDjmd(raw);
  const { header, frames } = read();
  if (frames.quaternionCoverage < 0.9) {
    parentPort?.postMessage({
      error: 'This video has no motion data (attitude missing in the camera track).',
    });
  } else {
    const imu = derive(frames);
    const result = compute(imu, cfg);
    // Float64Arrays travel by structured clone; transferring their buffers avoids the copy
    const buffers = [
      ...Object.values(imu).filter((v): v is Float64Array => v instanceof Float64Array),
      ...Object.values(result.signals).filter((v): v is Float64Array => v instanceof Float64Array),
    ].map((a) => a.buffer as ArrayBuffer);
    parentPort?.postMessage({ header, imu, result }, [...new Set(buffers)]);
  }
} catch (e) {
  parentPort?.postMessage({ error: (e as Error).message });
}
