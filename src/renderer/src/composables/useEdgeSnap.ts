/**
 * Snapping while an edge is dragged (Settings → Editing; Alt inverts it). An edge clicks onto the
 * boundaries the scan found, the quiet moments in the score, the edges of other parts and whole
 * seconds — whichever is nearest within 8 px.
 */
import { computed, ref, type Ref } from 'vue';
import type { Part } from '@core/types';
import type { TimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { useSettingsStore } from '@renderer/stores/settings';

const SNAP_PX = 8;

export interface EdgeSnap {
  /** the time the dragged edge snapped to, for the guide line; null when it is free */
  snapT: Ref<number | null>;
  /** the time to use for this edge, snapped or not */
  snap: (t: number, ev: MouseEvent, exclude: Part, laneWidth: number) => number;
  clear: () => void;
}

export function useEdgeSnap(view: TimelineView): EdgeSnap {
  const editor = useEditorStore();
  const settings = useSettingsStore();
  const snapT = ref<number | null>(null);

  /** candidate times: auto segment boundaries, score valleys under the threshold, other parts' edges */
  const targets = computed<number[]>(() => {
    const out: number[] = [];
    for (const a of editor.auto) out.push(a.start_s, a.end_s);
    for (const p of editor.parts) out.push(p.start_s, p.end_s);
    const t = editor.data.t as number[] | undefined;
    const score = editor.data.score as (number | null)[] | undefined;
    if (t && score) {
      for (let i = 1; i < score.length - 1; i++) {
        const s = score[i];
        if (s === null || s >= editor.threshold) continue;
        if (s <= (score[i - 1] ?? Infinity) && s < (score[i + 1] ?? Infinity)) out.push(t[i]);
      }
    }
    return out;
  });

  function snap(t: number, ev: MouseEvent, exclude: Part, laneWidth: number): number {
    const on = (settings.settings?.snapping ?? false) !== ev.altKey;
    if (!on || !laneWidth) {
      snapT.value = null;
      return t;
    }
    const tol = SNAP_PX * (view.span.value / laneWidth);
    let best = t;
    let bestD = tol;
    const consider = (c: number): void => {
      const d = Math.abs(c - t);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    };
    for (const c of targets.value) if (c !== exclude.start_s && c !== exclude.end_s) consider(c);
    consider(Math.round(t));
    snapT.value = best === t ? null : best;
    return best;
  }

  return { snapT, snap, clear: () => (snapT.value = null) };
}
