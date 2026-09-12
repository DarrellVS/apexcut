/**
 * Looking for the rider's own mark: two fingers held up to the camera (`core/gesture.ts`). One
 * ffmpeg pass over the small proxy, eight grey frames a second at 256 px, straight into the
 * detector — nothing is written to disk and one frame is 64 kB, so a long recording costs no more
 * memory than a short one. About fifteen seconds for a twenty minute ride.
 */
import { spawn } from 'node:child_process';
import { GESTURE, GestureDetector, type GestureMark } from '@core/gesture';
import { FFMPEG } from '../services/media';

export class GestureScanAction {
  /** Walk `video` and report every moment the rider marked. */
  execute(
    video: string,
    signal?: AbortSignal,
    onProgress?: (f: number) => void,
    durationS?: number,
  ): Promise<GestureMark[]> {
    const size = GESTURE.width * GESTURE.height;
    const detector = new GestureDetector();
    const total = durationS ? Math.max(1, durationS * GESTURE.fps) : 0;
    return new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG, [
        '-v',
        'error',
        '-i',
        video,
        '-an',
        '-vf',
        `fps=${GESTURE.fps},scale=${GESTURE.width}:${GESTURE.height},format=gray`,
        '-f',
        'rawvideo',
        'pipe:1',
      ]);
      const stop = (): void => {
        proc.kill('SIGKILL');
      };
      signal?.addEventListener('abort', stop, { once: true });

      // frames arrive in whatever pieces the pipe gives us; keep what is left over
      let rest: Buffer = Buffer.alloc(0);
      let frames = 0;
      let err = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        const buf: Buffer = rest.length ? Buffer.concat([rest, chunk]) : chunk;
        let at = 0;
        while (buf.length - at >= size) {
          detector.push(new Uint8Array(buf.subarray(at, at + size)));
          at += size;
          frames++;
          if (total && frames % GESTURE.fps === 0) onProgress?.(Math.min(1, frames / total));
        }
        rest = Buffer.from(buf.subarray(at));
      });
      proc.stderr.on('data', (c: Buffer) => (err += c.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => {
        signal?.removeEventListener('abort', stop);
        if (signal?.aborted) reject(new Error('cancelled'));
        else if (code === 0) resolve(detector.marks());
        else reject(new Error(err.trim() || `ffmpeg exited with ${code}`));
      });
    });
  }
}
