/**
 * Cutting a list of parts: what each transition asks of a part, and running the cuts (a few at once
 * when they are re-encodes) while the job reports one progress figure for all of them.
 */
import { basename, join } from 'node:path';
import type { Transition } from '@shared/ipc';
import type { JobContext } from '../../services/jobs';
import { CutSegmentAction } from './segment';
import { DIP_S, PARALLEL_CUTS, XFADE_S, type CutItem } from './types';

/** Per-part settings a transition needs: fades for dip, re-encode + keyframes for crossfade. */
export function prepareItems(items: CutItem[], transition: Transition): CutItem[] {
  return items.map((it, k) => {
    const dur = it.endS - it.startS;
    if (transition === 'dip') return { ...it, fade: DIP_S, encode: true };
    if (transition === 'crossfade' && items.length > 1) {
      const kf: number[] = [];
      if (k > 0) kf.push(XFADE_S);
      if (k < items.length - 1) kf.push(Math.max(XFADE_S, dur - XFADE_S));
      return { ...it, fade: 0, encode: true, keyframesAt: kf };
    }
    return { ...it, fade: 0 };
  });
}

/** Cut all items (a few at once for re-encodes), aggregate progress, keep item order. */
export async function cutAll(
  items: CutItem[],
  outDir: string,
  ctx: JobContext,
  range: [number, number] = [0, 0.97],
): Promise<string[]> {
  const total = items.reduce((a, i) => a + (i.endS - i.startS), 0) || 1;
  const fracs = new Array<number>(items.length).fill(0);
  const report = (): void => {
    const done = fracs.reduce((a, f, k) => a + f * (items[k].endS - items[k].startS), 0);
    const finished = fracs.filter((f) => f >= 1).length;
    ctx.progress(
      range[0] + Math.min(1, done / total) * (range[1] - range[0]),
      `Cutting part ${Math.min(items.length, finished + 1)} of ${items.length}`,
    );
  };
  const workers = items.some((i) => i.format !== 'original' || i.encode || i.grade)
    ? PARALLEL_CUTS
    : 1;
  const results = new Array<string>(items.length);
  let next = 0;
  const action = new CutSegmentAction();
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const k = next++;
      const it = items[k];
      if (ctx.signal.aborted) throw new Error('cancelled');
      ctx.log(
        `cut ${k + 1}/${items.length}: ${basename(it.src)} ${it.startS.toFixed(1)}-${it.endS.toFixed(1)}s`,
      );
      results[k] = await action.execute({ ...it, dst: join(outDir, it.name) }, ctx, (f) => {
        fracs[k] = f;
        report();
      });
      fracs[k] = 1;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, worker));
  return results;
}
