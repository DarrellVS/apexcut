<script setup lang="ts">
/**
 * The Movie panel (right, always visible): what the movie is made of, name, one movie / clips,
 * format, transition, riding data on the picture, the button to make it, the result.
 */
import { api } from '@renderer/api';
import { computed, ref, watch } from 'vue';
import { PhFolderOpen, PhPlay } from '@phosphor-icons/vue';
import {
  OVERLAY_CORNERS,
  OVERLAY_SIZES,
  OVERLAY_STYLES,
  type OverlayCorner,
  type OverlayStyle,
} from '@core/overlay';
import type { Part } from '@core/types';
import { renderOverlaySprites } from '@renderer/utils/overlaySprites';
import {
  DEFAULT_MUSIC,
  FORMAT_SPEC,
  TRANSITION_LABEL,
  TRANSITIONS,
  type ExportFormat,
  type ExportRequest,
  type OverlaySpecDto,
  type Transition,
} from '@shared/ipc';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';
import { friendlyError } from '@renderer/utils/errors';
import { isNeutral, type Grade } from '@core/grade';
import ColourSection from './ColourSection.vue';
import { fmtDuration, shortName } from '@renderer/utils/format';

const scope = ref<'all' | 'current'>('all');
const editor = useEditorStore();
const library = useLibraryStore();
const jobs = useJobsStore();
const settings = useSettingsStore();
const projects = useProjectsStore();

const separate = ref(false);
const format = computed<ExportFormat>(() => settings.settings?.lastFormat ?? '16x9');
const name = ref(settings.settings?.lastName ?? 'my-ride');
watch(
  () => settings.settings?.lastName,
  (n) => n && (name.value = n),
);

const TILES: { f: ExportFormat; label: string; sub: string; w: number; h: number }[] = [
  { f: 'original', label: 'Square', sub: 'as recorded', w: 40, h: 40 },
  { f: '16x9', label: 'Widescreen 16:9', sub: 'YouTube, TV', w: 56, h: 32 },
  { f: '4x3', label: 'Classic 4:3', sub: 'a bit more sky and road', w: 48, h: 36 },
  { f: '9x16', label: 'Vertical 9:16', sub: 'phone, reels', w: 24, h: 42 },
];

/** export only the starred parts */
const onlyStarred = ref(false);
type Item = ExportRequest['items'][number] & { starred?: boolean; maxLean?: number };
/** a part's own colours, else the movie's, else nothing */
const gradeFor = (p: Part): Grade | undefined => {
  const g = p.grade ?? projects.active?.grade ?? undefined;
  return g && !isNeutral(g) ? { ...g } : undefined;
};
const toItem = (stem: string, p: Part): Item => ({
  stem,
  startS: p.start_s,
  endS: p.end_s,
  reden: p.reden,
  starred: p.starred,
  maxLean: p.max_lean_deg,
  grade: gradeFor(p),
});

const items = computed(() => {
  const out: Item[] = [];
  const clips = library.analyzed.filter((c) => scope.value === 'all' || c.stem === library.current);
  for (const c of clips) {
    if (c.stem === editor.stem) {
      for (const p of editor.enabledParts) out.push(toItem(c.stem, p));
    } else out.push(...(otherParts.value[c.stem] ?? []));
  }
  return onlyStarred.value ? out.filter((i) => i.starred) : out;
});
const nStarred = computed(() => {
  let n = editor.parts.filter((p) => p.enabled && p.starred).length;
  for (const list of Object.values(otherParts.value)) n += list.filter((i) => i.starred).length;
  return n;
});
/** parts of the videos that are not open; loaded lazily */
const otherParts = ref<Record<string, Item[]>>({});
async function loadOthers(): Promise<void> {
  for (const c of library.analyzed) {
    if (c.stem === editor.stem || otherParts.value[c.stem]) continue;
    const tl = await api.analysis.timeline(c.stem);
    otherParts.value[c.stem] = tl.parts.filter((p) => p.enabled).map((p) => toItem(c.stem, p));
  }
}
// any change in what is picked (per-video counts) or which video is open invalidates the cache
watch(
  () => [
    editor.stem,
    JSON.stringify(projects.active?.grade ?? null),
    library.clips.map((c) => `${c.stem}:${c.nEnabled}:${c.highlightS}`).join(),
  ],
  () => {
    otherParts.value = {};
    loadOthers();
  },
  { immediate: true },
);
jobs.onUpdate(
  (j) =>
    j.kind !== 'export' &&
    j.kind !== 'extract' &&
    j.status === 'done' &&
    (otherParts.value = {}) &&
    loadOthers(),
);

// ---- telemetry overlay: per project; off, or a style + corner + size
const overlay = computed<OverlaySpecDto | null>(() => projects.active?.overlay ?? null);
const OVERLAY_STYLE_LABEL: Record<OverlayStyle, string> = {
  minimal: 'Lean angle',
  dashboard: 'Dashboard',
};
const CORNER_LABEL: Record<OverlayCorner, string> = {
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  'top-left': 'Top left',
  'top-right': 'Top right',
};
function setOverlay(patch: Partial<OverlaySpecDto> | null): void {
  if (patch === null) {
    projects.setOverlay(null);
    return;
  }
  const cur = overlay.value ?? { style: 'minimal', corner: 'bottom-left', size: 'M' };
  projects.setOverlay({ ...cur, ...patch });
}
/** export resolution of the current format, for drawing the sprites at the right size */
function exportSize(): { w: number; h: number } {
  const spec = FORMAT_SPEC[format.value];
  const clip = library.currentClip;
  const w = clip?.width ?? 3840;
  const h = clip?.height ?? 3840;
  return spec ? { w: Math.min(spec.w, w), h: Math.min(spec.h, h) } : { w, h };
}

/** how parts are joined: per project; crossfades overlap ½ s, so the movie is that much shorter */
const transition = computed<Transition>(() => projects.active?.transition ?? 'crossfade');
const XFADE_S = 0.5;
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
  return `${it.length} parts${n > 1 ? ` from ${n} videos` : ''} · ${fmtDuration(movieLength.value)}`;
});

async function go(): Promise<void> {
  await loadOthers();
  await settings.update({ lastName: name.value });
  const id = await api.exporter.start({
    items: items.value,
    separate: separate.value,
    format: format.value,
    framePos: settings.settings?.lastFramePos ?? 0.5,
    name: name.value,
    transition: transition.value,
    // plain copy: reactive proxies cannot cross the IPC bridge
    music: separate.value
      ? DEFAULT_MUSIC
      : JSON.parse(JSON.stringify(projects.active?.music ?? DEFAULT_MUSIC)),
    overlay: overlay.value
      ? {
          spec: { ...overlay.value },
          sprites: renderOverlaySprites(overlay.value, exportSize().w, exportSize().h),
        }
      : null,
  });
  jobs.exportJobId = id;
}
const job = computed(() => jobs.exportJob);
const emit = defineEmits<{ watch: [url: string] }>();
const openFolder = (p: string): Promise<void> => api.shell.openFolder(p);
/** the title bar's split button picks what to make */
function openMovie(s: 'all' | 'current'): void {
  scope.value = s;
}
/** the crop frame shows on the video whenever the movie is not square */
const framingActive = computed(() => format.value !== 'original');
defineExpose({ format, openMovie, framingActive });
</script>

<template>
  <aside class="panel flex min-h-0 flex-col">
    <div class="panel-head justify-between">
      <span>Movie</span>
      <span class="num font-normal tracking-normal normal-case text-fg3">{{ summary }}</span>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-3">
      <section class="flex flex-col gap-2">
        <input v-model="name" class="input w-full" placeholder="Name of your movie" />
        <div class="seg" role="radiogroup" aria-label="What to make">
          <button
            class="seg-item"
            role="radio"
            :aria-checked="!separate"
            title="All parts back to back"
            @click="separate = false"
          >
            One movie
          </button>
          <button
            class="seg-item"
            role="radio"
            :aria-checked="separate"
            title="Each part as its own file"
            @click="separate = true"
          >
            Separate clips
          </button>
        </div>
        <div
          v-if="library.analyzed.length > 1 || nStarred || onlyStarred"
          class="num flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg2"
        >
          <template v-if="library.analyzed.length > 1">
            From
            <button
              class="text-fg underline decoration-fg3 underline-offset-2"
              @click="scope = scope === 'all' ? 'current' : 'all'"
            >
              {{
                scope === 'all'
                  ? 'all videos'
                  : `only ${library.current ? shortName(library.current) : ''}`
              }}
            </button>
          </template>
          <label v-if="nStarred || onlyStarred" class="flex items-center gap-1.5 text-fg2">
            <input v-model="onlyStarred" type="checkbox" class="m-0 h-3 w-3" />
            Starred only ({{ nStarred }})
          </label>
        </div>
      </section>

      <section>
        <div class="label-caps mb-2">Format</div>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="t in TILES"
            :key="t.f"
            class="tile flex h-[68px] flex-col items-center justify-center gap-1.5"
            :aria-pressed="format === t.f"
            :title="t.sub"
            @click="settings.update({ lastFormat: t.f })"
          >
            <div
              class="rounded-[2px] border border-fg2 bg-fg3/30"
              :style="{ width: `${t.w * 0.7}px`, height: `${t.h * 0.7}px` }"
            />
            <b class="text-xs font-semibold">{{ t.label }}</b>
          </button>
        </div>
        <div class="mt-2 text-xs text-fg3">
          {{
            format === 'original'
              ? 'As recorded: ready within a minute, no quality loss.'
              : 'Drag the frame on the video to choose what stays in view.'
          }}
        </div>
      </section>

      <ColourSection />

      <section v-if="!separate" class="flex flex-col gap-4">
        <div>
          <div class="label-caps mb-2">Between the parts</div>
          <div class="seg" role="radiogroup">
            <button
              v-for="t in TRANSITIONS"
              :key="t"
              class="seg-item"
              role="radio"
              :aria-checked="transition === t"
              :title="TRANSITION_LABEL[t].hint"
              @click="projects.setTransition(t)"
            >
              {{ TRANSITION_LABEL[t].label }}
            </button>
          </div>
          <div v-if="format === 'original' && transition !== 'cut'" class="mt-2 text-xs text-fg3">
            With a transition the square movie is re-encoded (full quality).
          </div>
        </div>
        <div>
          <div class="label-caps mb-2">Riding data on the picture</div>
          <div class="seg" role="radiogroup">
            <button
              class="seg-item"
              role="radio"
              :aria-checked="!overlay"
              @click="setOverlay(null)"
            >
              Off
            </button>
            <button
              v-for="st in OVERLAY_STYLES"
              :key="st"
              class="seg-item"
              role="radio"
              :aria-checked="overlay?.style === st"
              :title="
                st === 'minimal'
                  ? 'A leaning bike and the angle in degrees'
                  : 'Lean gauge with a needle plus a braking / acceleration bar'
              "
              @click="setOverlay({ style: st })"
            >
              {{ OVERLAY_STYLE_LABEL[st] }}
            </button>
          </div>
          <div v-if="overlay" class="mt-2 flex items-center gap-1.5 text-xs">
            <select
              class="input h-6 flex-1 text-xs"
              :value="overlay.corner"
              aria-label="Corner of the overlay"
              @change="
                setOverlay({ corner: ($event.target as HTMLSelectElement).value as OverlayCorner })
              "
            >
              <option v-for="c in OVERLAY_CORNERS" :key="c" :value="c">
                {{ CORNER_LABEL[c] }}
              </option>
            </select>
            <div class="seg" role="radiogroup" aria-label="Size">
              <button
                v-for="sz in OVERLAY_SIZES"
                :key="sz"
                class="seg-item px-2.5"
                role="radio"
                :aria-checked="overlay.size === sz"
                @click="setOverlay({ size: sz })"
              >
                {{ sz }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div v-if="job && job.status === 'done' && job.result" class="card text-xs break-all">
        <b class="block text-[13px] font-semibold text-fg">
          {{ job.result.kind === 'extract' ? 'Your clips are ready' : 'Your movie is ready' }}
        </b>
        <div v-if="job.result.kind === 'export'" class="num my-1.5 text-fg2">
          {{ job.result.file }} · {{ job.result.sizeMb }} MB
        </div>
        <div v-if="job.result.kind === 'extract'" class="num my-1.5 text-fg2">
          {{ job.result.files.length }} files in {{ job.result.folder }}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-if="job.result.kind === 'export'"
            class="btn btn-pri btn-mini"
            @click="emit('watch', job.result.url)"
          >
            <PhPlay :size="12" weight="fill" /> Watch
          </button>
          <button
            class="btn btn-mini"
            @click="
              openFolder(
                job.result.kind === 'export'
                  ? job.result.file
                  : job.result.kind === 'extract'
                    ? job.result.folder
                    : '',
              )
            "
          >
            <PhFolderOpen :size="12" /> Open folder
          </button>
        </div>
      </div>
      <div v-else-if="job && job.status === 'error'" class="card border-danger/40 text-xs">
        <b class="text-fg">{{ friendlyError(job.error).title }}.</b>
        <span class="text-fg2">{{ friendlyError(job.error).hint }}</span>
        <details class="mt-1.5">
          <summary class="cursor-pointer text-fg2">Details</summary>
          <pre class="max-h-[160px] overflow-auto text-[11px] whitespace-pre-wrap">{{
            job.error
          }}</pre>
        </details>
      </div>
      <div v-else-if="job && job.status === 'cancelled'" class="text-xs text-fg2">
        Export cancelled.
      </div>
    </div>
    <div class="flex-none border-t border-line p-3">
      <button
        class="btn btn-pri h-8 w-full"
        :disabled="!items.length || jobs.exporting"
        @click="go"
      >
        {{ jobs.exporting ? 'Working…' : separate ? 'Make clips' : 'Make my movie' }}
      </button>
    </div>
  </aside>
</template>
