/**
 * What the Movie panel is about to make: which parts go in, how long that becomes, and the request
 * that starts the export. The parts of the videos that are not open come from `useRideParts`, so the
 * rail and the movie always agree on what is in the movie.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { api } from '@renderer/api';
import { isNeutral, type Grade } from '@core/grade';
import type { Part } from '@core/types';
import {
  DEFAULT_MUSIC,
  FORMAT_SPEC,
  XFADE_S,
  type ExportRequest,
  type OverlaySpecDto,
  type Transition,
} from '@shared/ipc';
import { useFraming } from '@renderer/composables/useFraming';
import { useRideParts } from '@renderer/composables/useRideParts';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { friendlyError } from '@renderer/utils/errors';
import { fmtDuration, plural } from '@renderer/utils/format';
import { renderOverlaySprites } from '@renderer/utils/overlaySprites';
import type { ClipInfo } from '@shared/ipc';

/** an export item plus the two things the panel itself wants to know about a part */
export type ExportItem = ExportRequest['items'][number] & { starred?: boolean; maxLean?: number };

export interface MovieExport {
  /** all videos of the project, or only the open one */
  scope: Ref<'all' | 'current'>;
  /** one movie, or a file per part */
  separate: Ref<boolean>;
  onlyStarred: Ref<boolean>;
  name: Ref<string>;
  items: ComputedRef<ExportItem[]>;
  /** videos in scope whose files are not on this computer right now */
  missing: ComputedRef<ClipInfo[]>;
  nStarred: ComputedRef<number>;
  /** length of the movie these items make, crossfades taken off */
  movieLength: ComputedRef<number>;
  summary: ComputedRef<string>;
  transition: ComputedRef<Transition>;
  /** start the export job */
  go: () => Promise<void>;
}

export function useMovieExport(): MovieExport {
  const library = useLibraryStore();
  const jobs = useJobsStore();
  const projects = useProjectsStore();
  const settings = useSettingsStore();
  const framing = useFraming();
  const ride = useRideParts();

  const scope = ref<'all' | 'current'>('all');
  const separate = ref(false);
  const onlyStarred = ref(false);
  const name = ref(settings.settings?.lastName ?? 'my-ride');
  watch(
    () => settings.settings?.lastName,
    (n) => n && (name.value = n),
  );

  const inScope = (c: ClipInfo): boolean => scope.value === 'all' || c.stem === library.current;
  /** a part's own colours, else the movie's, else nothing */
  const gradeFor = (p: Part): Grade | undefined => {
    const g = p.grade ?? projects.active?.grade ?? undefined;
    return g && !isNeutral(g) ? { ...g } : undefined;
  };
  const toItem = (stem: string, p: Part): ExportItem => ({
    stem,
    startS: p.start_s,
    endS: p.end_s,
    reden: p.reden,
    starred: p.starred,
    maxLean: p.max_lean_deg,
    grade: gradeFor(p),
  });

  const missing = computed(() => library.analyzed.filter((c) => !c.exists && inScope(c)));
  const items = computed(() => {
    const out: ExportItem[] = [];
    for (const c of library.analyzed.filter((c) => c.exists && inScope(c))) {
      for (const p of ride.partsOf(c.stem)) if (p.enabled) out.push(toItem(c.stem, p));
    }
    return onlyStarred.value ? out.filter((i) => i.starred) : out;
  });
  const nStarred = computed(() =>
    library.analyzed
      .filter(inScope)
      .reduce((n, c) => n + ride.partsOf(c.stem).filter((p) => p.enabled && p.starred).length, 0),
  );

  /** how parts are joined: per project; crossfades overlap ½ s, so the movie is that much shorter */
  const transition = computed<Transition>(() => projects.active?.transition ?? 'crossfade');
  const movieLength = computed(() => {
    const it = items.value;
    const raw = it.reduce((a, i) => a + i.endS - i.startS, 0);
    return transition.value === 'crossfade' && !separate.value
      ? Math.max(0, raw - XFADE_S * Math.max(0, it.length - 1))
      : raw;
  });
  const summary = computed(() => {
    const it = items.value;
    if (!it.length) return 'no parts selected yet';
    const n = new Set(it.map((i) => i.stem)).size;
    return `${plural(it.length, 'part')}${n > 1 ? ` from ${plural(n, 'video')}` : ''} · ${fmtDuration(movieLength.value)}`;
  });

  /** export resolution of the current format, for drawing the overlay sprites at the right size */
  function exportSize(): { w: number; h: number } {
    const spec = FORMAT_SPEC[framing.format.value];
    const clip = library.currentClip;
    const w = clip?.width ?? 3840;
    const h = clip?.height ?? 3840;
    return spec ? { w: Math.min(spec.w, w), h: Math.min(spec.h, h) } : { w, h };
  }

  async function go(): Promise<void> {
    // an empty name is not an error, it is "my-ride"
    const movieName = name.value.trim().slice(0, 80) || 'my-ride';
    name.value = movieName;
    const overlay = projects.active?.overlay ?? null;
    try {
      await ride.ready();
      await settings.update({ lastName: movieName });
      const id = await api.exporter.start({
        items: items.value,
        separate: separate.value,
        format: framing.format.value,
        framePos: framing.framePos.value,
        name: movieName,
        transition: transition.value,
        // plain copy: reactive proxies cannot cross the IPC bridge
        music: separate.value
          ? DEFAULT_MUSIC
          : JSON.parse(JSON.stringify(projects.active?.music ?? DEFAULT_MUSIC)),
        overlay: overlay
          ? {
              spec: { ...overlay } as OverlaySpecDto,
              sprites: renderOverlaySprites(overlay, exportSize().w, exportSize().h),
            }
          : null,
      });
      jobs.exportJobId = id;
    } catch (e) {
      // the request never became a job (a missing file, a rejected value): say so, no error card
      const f = friendlyError((e as Error).message);
      toast(`${f.title}. ${f.hint}`, 8000);
    }
  }

  return {
    scope,
    separate,
    onlyStarred,
    name,
    items,
    missing,
    nStarred,
    movieLength,
    summary,
    transition,
    go,
  };
}
