/**
 * The parts of every video in the project: the open video's from the editor (live), the others
 * loaded once and dropped when their counts change. Shared by the ride outline and the movie panel.
 */
import { computed, ref, watch, type ComputedRef } from 'vue';
import { api } from '@renderer/api';
import type { Part } from '@core/types';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';

const cache = ref<Record<string, Part[]>>({});
let wired = false;

export interface RideParts {
  /** parts per stem, sorted by start; the open video's list is live */
  partsOf: (stem: string) => Part[];
  /** every part of the project in movie order (video order, then time) */
  all: ComputedRef<{ stem: string; part: Part }[]>;
  /** drop the cache; it refills on demand */
  invalidate: () => void;
}

export function useRideParts(): RideParts {
  const editor = useEditorStore();
  const library = useLibraryStore();
  const jobs = useJobsStore();

  async function load(stem: string): Promise<void> {
    const tl = await api.analysis.timeline(stem);
    cache.value[stem] = [...tl.parts].sort((a, b) => a.start_s - b.start_s);
  }
  function invalidate(): void {
    cache.value = {};
  }
  function partsOf(stem: string): Part[] {
    if (stem === editor.stem) return [...editor.parts].sort((a, b) => a.start_s - b.start_s);
    const hit = cache.value[stem];
    if (!hit) {
      cache.value[stem] = [];
      if (library.clips.find((c) => c.stem === stem)?.analyzed) load(stem);
    }
    return hit ?? [];
  }
  const all = computed(() =>
    library.analyzed.flatMap((c) => partsOf(c.stem).map((part) => ({ stem: c.stem, part }))),
  );

  if (!wired) {
    wired = true;
    // any change in what is picked (per-video counts) or a finished job invalidates the cache
    watch(
      () => library.clips.map((c) => `${c.stem}:${c.nEnabled}:${c.nParts}:${c.highlightS}`).join(),
      invalidate,
    );
    jobs.onUpdate((j) => {
      if (j.kind !== 'export' && j.kind !== 'extract' && j.status === 'done') invalidate();
    });
  }
  return { partsOf, all, invalidate };
}
