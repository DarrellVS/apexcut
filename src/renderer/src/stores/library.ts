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

  async function pick(kind: 'files' | 'dir'): Promise<string[]> {
    const r = await window.apexcut.library.pick(kind);
    await refresh();
    logger.info('picked', r);
    return r.added;
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

  return { clips, current, analyzed, currentClip, refresh, pick, add, remove };
});
