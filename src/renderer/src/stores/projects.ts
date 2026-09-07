/**
 * Projects: the list, which one is open, and the actions of the projects screen.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ProjectInfo } from '@shared/ipc';
import { logger } from '@renderer/utils/logger';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectInfo[]>([]);
  const activeId = ref<string | null>(null);
  /** the projects screen is shown instead of the editor */
  const showHome = ref(false);

  const active = computed(() => projects.value.find((p) => p.id === activeId.value) ?? null);
  const sorted = computed(() => [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt));

  async function refresh(): Promise<void> {
    [projects.value, activeId.value] = await Promise.all([
      window.apexcut.projects.list(),
      window.apexcut.projects.active(),
    ]);
  }

  async function open(id: string): Promise<void> {
    await window.apexcut.projects.open(id);
    activeId.value = id;
    showHome.value = false;
    logger.info('project opened', id);
  }

  async function create(name: string): Promise<string> {
    const p = await window.apexcut.projects.create(name);
    await refresh();
    return p.id;
  }

  async function rename(id: string, name: string): Promise<void> {
    await window.apexcut.projects.rename(id, name);
    await refresh();
  }

  async function remove(id: string): Promise<void> {
    await window.apexcut.projects.remove(id);
    await refresh();
  }

  async function exportFile(id: string): Promise<string | null> {
    const r = await window.apexcut.projects.exportFile(id);
    return r?.file ?? null;
  }

  async function importFile(): Promise<{ id: string; missing: string[] } | null> {
    const r = await window.apexcut.projects.importFile();
    if (r) await refresh();
    return r;
  }

  return {
    projects,
    activeId,
    showHome,
    active,
    sorted,
    refresh,
    open,
    create,
    rename,
    remove,
    exportFile,
    importFile,
  };
});
