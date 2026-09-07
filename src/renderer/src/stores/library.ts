/**
 * Known videos and which one is open. Refreshed after every job update.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ClipInfo } from '@shared/ipc';
import { logger } from '@renderer/utils/logger';

export const useLibraryStore = defineStore('library', () => {
  const clips = ref<ClipInfo[]>([]);
  const current = ref<string | null>(null);

  const analyzed = computed(() => clips.value.filter((c) => c.analyzed));
  const currentClip = computed(() => clips.value.find((c) => c.stem === current.value) ?? null);

  async function refresh(): Promise<void> {
    clips.value = await window.apexcut.library.list();
    if (current.value && !clips.value.some((c) => c.stem === current.value)) current.value = null;
  }

  /** File/folder dialog; returns the picked paths (nothing added yet — see App.importPaths). */
  async function pick(kind: 'files' | 'dir'): Promise<string[]> {
    const r = await window.apexcut.library.pick(kind);
    logger.info('picked', r);
    return r.paths;
  }

  async function add(paths: string[]): Promise<string[]> {
    const r = await window.apexcut.library.add(paths);
    await refresh();
    return r.added;
  }

  async function remove(stem: string): Promise<void> {
    await window.apexcut.library.remove(stem);
    await refresh();
  }

  /** Move `stem` before `beforeStem` (or to the end when null). Order = order in the movie. */
  async function move(stem: string, beforeStem: string | null): Promise<void> {
    const order = clips.value.map((c) => c.stem).filter((s) => s !== stem);
    const idx = beforeStem ? order.indexOf(beforeStem) : -1;
    if (idx < 0) order.push(stem);
    else order.splice(idx, 0, stem);
    clips.value = order.map((s) => clips.value.find((c) => c.stem === s)!);
    await window.apexcut.library.reorder(order);
  }

  return { clips, current, analyzed, currentClip, refresh, pick, add, remove, move };
});
