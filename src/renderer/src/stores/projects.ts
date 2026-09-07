/**
 * Projects: the list, which one is open, and the actions of the projects screen.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { MusicSettings, OverlaySpecDto, ProjectInfo, Transition } from '@shared/ipc';
import { logger } from '@renderer/utils/logger';

export type ProjectSort = 'edited' | 'name' | 'length';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectInfo[]>([]);
  const activeId = ref<string | null>(null);
  /** the projects screen is shown instead of the editor */
  const showHome = ref(false);
  const query = ref('');
  const sort = ref<ProjectSort>(readSort());

  const active = computed(() => projects.value.find((p) => p.id === activeId.value) ?? null);

  const byQuery = (list: ProjectInfo[]): ProjectInfo[] => {
    const q = query.value.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  };
  const order = (list: ProjectInfo[]): ProjectInfo[] =>
    [...list].sort((a, b) =>
      sort.value === 'name'
        ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        : sort.value === 'length'
          ? b.highlightS - a.highlightS
          : b.updatedAt - a.updatedAt,
    );
  /** open (not archived) projects, filtered and sorted for the grid */
  const sorted = computed(() => order(byQuery(projects.value.filter((p) => !p.archived))));
  const archived = computed(() => order(byQuery(projects.value.filter((p) => p.archived))));

  function readSort(): ProjectSort {
    try {
      const v = localStorage.getItem('apexcut.projects.sort');
      return v === 'name' || v === 'length' ? v : 'edited';
    } catch {
      return 'edited';
    }
  }
  function setSort(s: ProjectSort): void {
    sort.value = s;
    try {
      localStorage.setItem('apexcut.projects.sort', s);
    } catch {
      /* private mode */
    }
  }

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

  async function archive(id: string, on: boolean): Promise<void> {
    await window.apexcut.projects.archive(id, on);
    await refresh();
  }

  async function setTransition(t: Transition): Promise<void> {
    await window.apexcut.projects.setTransition(t);
    await refresh();
  }

  async function setOverlay(o: OverlaySpecDto | null): Promise<void> {
    const p = projects.value.find((x) => x.id === activeId.value);
    if (p) p.overlay = o;
    await window.apexcut.projects.setOverlay(o ? { ...o } : null);
  }

  /** the music lane; optimistic so dragging feels instant, then persisted */
  async function setMusic(m: MusicSettings): Promise<void> {
    const p = projects.value.find((x) => x.id === activeId.value);
    if (p) p.music = m;
    await window.apexcut.projects.setMusic(JSON.parse(JSON.stringify(m)));
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
    query,
    sort,
    active,
    sorted,
    archived,
    setSort,
    refresh,
    open,
    create,
    rename,
    remove,
    archive,
    setTransition,
    setMusic,
    setOverlay,
    exportFile,
    importFile,
  };
});
