/**
 * Getting videos in: from the two buttons, from a drop anywhere in the window, or from the sheet
 * that appears when a pick holds more than one riding day. A drop on the projects screen makes a
 * project per day; a drop in a project adds to it, with music files going under its movie.
 */
import { ref, type Ref } from 'vue';
import { api } from '@renderer/api';
import type { ImportGroup } from '@shared/ipc';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { dayLabel, plural } from '@renderer/utils/format';

const AUDIO = /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i;
const NOTHING_FOUND =
  'No DJI videos found there. On the memory card they are in DCIM › 100MEDIA, as .MP4 with a small .LRF next to each.';

export interface Import {
  /** the days of a pick that needs a decision; the import sheet shows them */
  pendingGroups: Ref<ImportGroup[] | null>;
  /** a drag with files is over the window */
  dropping: Ref<boolean>;
  pickAndScan: (kind: 'files' | 'dir') => Promise<void>;
  confirmImport: (groups: { name: string | null; paths: string[] }[]) => Promise<void>;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => Promise<void>;
}

export function useImport(opts: {
  /** true while the projects screen is showing: a drop makes projects there */
  onProjectsScreen: () => boolean;
  openProject: (id: string) => Promise<void>;
}): Import {
  const library = useLibraryStore();
  const projects = useProjectsStore();
  const pendingGroups = ref<ImportGroup[] | null>(null);
  const dropping = ref(false);

  async function scanNew(added: string[]): Promise<void> {
    const todo = library.clips.filter((c) => !c.analyzed).map((c) => c.stem);
    if (added.length) toast(`${plural(added.length, 'video')} added`);
    if (todo.length) await api.analysis.run(todo);
  }

  /** what a pick or drop holds, per riding day; empty when there are no DJI videos in it */
  async function daysIn(paths: string[]): Promise<ImportGroup[]> {
    if (!paths.length) return [];
    const groups = await api.library.inspect(paths);
    if (!groups.length) toast(NOTHING_FOUND, 7000);
    return groups;
  }

  /** into the open project; more than one day asks first */
  async function importPaths(paths: string[]): Promise<void> {
    const groups = await daysIn(paths);
    if (!groups.length) return;
    if (groups.length > 1) {
      pendingGroups.value = groups;
      return;
    }
    await scanNew(await library.add(paths));
  }

  async function confirmImport(groups: { name: string | null; paths: string[] }[]): Promise<void> {
    pendingGroups.value = null;
    const r = await api.projects.addGroups(JSON.parse(JSON.stringify(groups)));
    if (r.firstProject) await opts.openProject(r.firstProject);
    else await library.refresh();
    const n = groups.filter((g) => g.name !== null).length;
    toast(
      n
        ? `${plural(n, 'project')} created with ${r.stems.length} videos`
        : `${plural(r.stems.length, 'video')} added`,
    );
    if (r.toScan.length) await api.analysis.run(r.toScan);
  }

  /** a drop on the projects screen: one project per day, named after it, the first one opens */
  async function importAsProjects(paths: string[]): Promise<void> {
    const groups = await daysIn(paths);
    if (!groups.length) return;
    await confirmImport(groups.map((g) => ({ name: dayLabel(g.day), paths: [...g.paths] })));
  }

  async function pickAndScan(kind: 'files' | 'dir'): Promise<void> {
    await importPaths(await library.pick(kind));
  }

  function onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      dropping.value = true;
    }
  }
  async function onDrop(e: DragEvent): Promise<void> {
    dropping.value = false;
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    e.preventDefault();
    const paths = Array.from(files).map((f) => api.files.pathOf(f));
    // music files go under the movie, everything else is looked at as video
    const audio = paths.filter((p) => AUDIO.test(p));
    const videos = paths.filter((p) => !audio.includes(p));
    if (opts.onProjectsScreen()) {
      if (audio.length) toast('Open a project first — music goes under its movie', 5000);
      await importAsProjects(videos);
      return;
    }
    if (audio.length && projects.active) {
      const tracks = await api.music.add(audio);
      if (tracks.length) {
        await projects.setMusic({
          ...projects.active.music,
          tracks: [...projects.active.music.tracks, ...tracks],
        });
        toast(
          `${tracks.length === 1 ? tracks[0].name : `${tracks.length} songs`} added under your movie`,
        );
      }
    }
    await importPaths(videos);
  }

  return { pendingGroups, dropping, pickAndScan, confirmImport, onDragOver, onDrop };
}
