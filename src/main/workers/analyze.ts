/**
 * Worker thread for the heavy part of a scan: djmd parsing, IMU maths and scoring. Keeps the main
 * process (IPC, window) responsive while several videos are scanned. Pure `src/core` code only.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { parseDjmd } from '@core/dji/djmd';
import { derive } from '@core/imu';
import { compute } from '@core/score';
import type { ScoreConfig } from '@core/types';

export interface AnalyzeInput {
  raw: Uint8Array;
  cfg?: Partial<ScoreConfig>;
}

const { raw, cfg } = workerData as AnalyzeInput;
try {
  const { header, frames } = parseDjmd(raw);
  if (frames.quaternionCoverage < 0.9) {
    parentPort?.postMessage({
      error: 'This video has no motion data (attitude quaternion missing in the djmd track).',
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
