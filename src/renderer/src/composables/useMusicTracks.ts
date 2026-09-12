/**
 * The songs under the movie: adding them, their order, their volumes and fades, and which files
 * have gone missing. The lane and its toolbar only draw what this returns.
 */
import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { api } from '@renderer/api';
import type { MusicSettings, MusicTrack } from '@shared/ipc';
import { useProjectsStore } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';

export interface MusicTracks {
  music: ComputedRef<MusicSettings>;
  /** which songs no longer exist on disk, by id */
  missing: Ref<Record<string, boolean>>;
  save: (next: Partial<MusicSettings>) => Promise<void>;
  patchTrack: (id: string, patch: Partial<MusicTrack>) => MusicTrack[];
  pick: () => Promise<void>;
  add: (tracks: MusicTrack[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (id: string, dir: -1 | 1) => Promise<void>;
}

export function useMusicTracks(selected: Ref<string | null>): MusicTracks {
  const projects = useProjectsStore();
  const missing = ref<Record<string, boolean>>({});

  const music = computed<MusicSettings>(
    () => projects.active?.music ?? { tracks: [], musicGain: 0.8, originalGain: 0.35 },
  );

  async function save(next: Partial<MusicSettings>): Promise<void> {
    await projects.setMusic({ ...music.value, ...next });
  }
  function patchTrack(id: string, patch: Partial<MusicTrack>): MusicTrack[] {
    return music.value.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
  }
  async function add(tracks: MusicTrack[]): Promise<void> {
    if (!tracks.length) return;
    await save({ tracks: [...music.value.tracks, ...tracks] });
    toast(
      `${tracks.length === 1 ? tracks[0].name : `${tracks.length} songs`} added under your movie`,
    );
    selected.value = tracks[0].id;
  }
  async function pick(): Promise<void> {
    await add(await api.music.pick());
  }
  async function remove(id: string): Promise<void> {
    selected.value = null;
    await save({ tracks: music.value.tracks.filter((t) => t.id !== id) });
  }
  async function move(id: string, dir: -1 | 1): Promise<void> {
    const list = [...music.value.tracks];
    const i = list.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await save({ tracks: list });
  }

  onMounted(async () => {
    const out: Record<string, boolean> = {};
    for (const t of music.value.tracks) out[t.id] = !(await api.music.exists(t.path));
    missing.value = out;
  });

  return { music, missing, save, patchTrack, pick, add, remove, move };
}
