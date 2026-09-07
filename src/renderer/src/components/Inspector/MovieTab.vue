<script setup lang="ts">
/** Movie tab: what (one movie / separate clips), format 2×2, framing hint, name, go, progress, result. */
import { computed, ref, watch } from 'vue';
import { PhFolderOpen, PhPlay } from '@phosphor-icons/vue';
import {
  OVERLAY_CORNERS,
  OVERLAY_SIZES,
  OVERLAY_STYLES,
  type OverlayCorner,
  type OverlayStyle,
} from '@core/overlay';
import { pickByLength } from '@core/pick';
import type { Part } from '@core/types';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { renderOverlaySprites } from '@renderer/utils/overlaySprites';
import { renderRideCard } from '@renderer/utils/rideCard';
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
import { fmtDuration, fmtElapsed, shortName } from '@renderer/utils/format';

const scope = defineModel<'all' | 'current'>('scope', { default: 'all' });
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
const toItem = (stem: string, p: Part): Item => ({
  stem,
  startS: p.start_s,
  endS: p.end_s,
  reden: p.reden,
  starred: p.starred,
  maxLean: p.max_lean_deg,
});

/** Title card text: the project name, and one line with the date and the numbers of the ride. */
const cards = computed<ExportRequest['cards']>(() => {
  const it = items.value;
  const bits: string[] = [];
  const first = [...it].sort((a, b) => a.stem.localeCompare(b.stem))[0];
  const m = first && /_(\d{4})(\d{2})(\d{2})\d{6}_/.exec(first.stem);
  if (m) {
    bits.push(
      new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }
  const lean = Math.max(0, ...it.map((i) => i.maxLean ?? 0));
  if (lean) bits.push(`${Math.round(lean)}° max lean`);
  const corners = it.filter((i) => i.reden !== 'accel/rem').length;
  if (corners) bits.push(`${corners} corner${corners === 1 ? '' : 's'}`);
  bits.push(fmtDuration(movieLength.value));
  return {
    title: settings.settings?.titleCard
      ? { heading: projects.active?.name ?? name.value, subheading: bits.join(' · ') }
      : null,
    end: settings.settings?.endCard ?? false,
  };
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
    const tl = await window.apexcut.analysis.timeline(c.stem);
    otherParts.value[c.stem] = tl.parts.filter((p) => p.enabled).map((p) => toItem(c.stem, p));
  }
}
watch(() => library.clips, loadOthers, { immediate: true });
jobs.onUpdate(
  (j) =>
    j.kind !== 'export' &&
    j.kind !== 'extract' &&
    j.status === 'done' &&
    (otherParts.value = {}) &&
    loadOthers(),
);

// ---- target length: "make me a 3-minute movie"
const allPartsLength = computed(() => {
  let s = editor.parts.reduce((a, p) => a + p.end_s - p.start_s, 0);
  for (const list of Object.values(allParts.value))
    s += list.reduce((a, p) => a + p.end_s - p.start_s, 0);
  return s;
});
/** full part lists of the videos that are not open (enabled or not) */
const allParts = ref<Record<string, Part[]>>({});
async function loadAll(): Promise<Record<string, Part[]>> {
  const out: Record<string, Part[]> = {};
  for (const c of library.analyzed) {
    if (c.stem === editor.stem) continue;
    out[c.stem] = (await window.apexcut.analysis.timeline(c.stem)).parts;
  }
  allParts.value = out;
  return out;
}
watch(() => library.clips, loadAll, { immediate: true });
const targetS = ref(180);
const keepPicks = ref(false);
const picking = ref(false);
const targetMax = computed(() => Math.max(60, Math.ceil(allPartsLength.value / 30) * 30));
const perVideo = computed(() =>
  library.analyzed
    .map((c) => {
      const list = items.value.filter((i) => i.stem === c.stem);
      return {
        stem: c.stem,
        n: list.length,
        s: list.reduce((a, i) => a + i.endS - i.startS, 0),
      };
    })
    .filter((v) => v.n > 0),
);
async function pickBest(): Promise<void> {
  if (!editor.stem || picking.value) return;
  picking.value = true;
  try {
    const others = await loadAll();
    const byVideo: Record<string, Part[]> = { ...others, [editor.stem]: editor.parts };
    const r = pickByLength(byVideo, { targetS: targetS.value, keepPicks: keepPicks.value });
    // the open video goes through the editor (undoable); the others are saved straight away
    const mine = r.enabled[editor.stem] ?? {};
    editor.mutate(() => editor.parts.forEach((p) => (p.enabled = mine[p.id] ?? p.enabled)));
    await editor.flush(); // so the video list below reads the new picks, not the debounced old ones
    for (const [stem, list] of Object.entries(others)) {
      for (const p of list) p.enabled = r.enabled[stem]?.[p.id] ?? p.enabled;
      await window.apexcut.analysis.saveParts(stem, JSON.parse(JSON.stringify(list)));
    }
    otherParts.value = {};
    await Promise.all([loadOthers(), library.refresh(), projects.refresh()]);
    toast(
      r.reached
        ? `${fmtDuration(r.totalS)} · ${r.nParts} parts picked`
        : `Not enough parts for ${fmtDuration(targetS.value)} — everything is in (${fmtDuration(r.totalS)})`,
      5000,
    );
  } finally {
    picking.value = false;
  }
}

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

// ---- ride card: the numbers of the project as a shareable picture (portrait + landscape)
const cardBusy = ref(false);
async function makeRideCard(): Promise<void> {
  if (cardBusy.value) return;
  cardBusy.value = true;
  try {
    const stats = await window.apexcut.projects.rideStats();
    const thumbs = await Promise.all(
      stats.top.map((t) => window.apexcut.analysis.frame(t.stem, t.tS, 960).catch(() => '')),
    );
    const dark = document.documentElement.dataset.theme !== 'light';
    const base = `${stats.name} - ride card`;
    const portrait = await renderRideCard(stats, thumbs, 'portrait', dark);
    const landscape = await renderRideCard(stats, thumbs, 'landscape', dark);
    await window.apexcut.app.saveImage(landscape, `${base} (wide)`);
    const r = await window.apexcut.app.saveImage(portrait, base);
    toast(`Ride card copied to the clipboard and saved next to your movies: ${r.file}`, 8000);
  } catch (e) {
    toast(`Could not make the ride card: ${(e as Error).message}`, 6000);
  } finally {
    cardBusy.value = false;
  }
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
  const id = await window.apexcut.exporter.start({
    items: items.value,
    separate: separate.value,
    format: format.value,
    framePos: settings.settings?.lastFramePos ?? 0.5,
    name: name.value,
    transition: transition.value,
    cards: separate.value ? { title: null, end: false } : cards.value,
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
const cancel = (id: string): Promise<void> => window.apexcut.exporter.cancel(id);
const openFolder = (p: string): Promise<void> => window.apexcut.shell.openFolder(p);
defineExpose({ format });
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="text-xs text-muted">
      {{ summary }}
      <template v-if="library.analyzed.length > 1">
        ·
        <a href="#" class="text-acc2" @click.prevent="scope = scope === 'all' ? 'current' : 'all'">
          {{
            scope === 'all'
              ? 'all videos'
              : `only ${library.current ? shortName(library.current) : ''}`
          }}
          ▾
        </a>
      </template>
    </div>
    <label v-if="nStarred || onlyStarred" class="flex items-center gap-2 text-xs text-fg">
      <input v-model="onlyStarred" type="checkbox" class="m-0" />
      Only the starred parts ({{ nStarred }})
    </label>
    <div v-if="!separate && scope === 'all'" class="card">
      <div class="flex items-baseline justify-between text-xs text-muted">
        <span>How long should it be?</span>
        <b class="num text-sm text-fg">{{ fmtDuration(targetS) }}</b>
      </div>
      <input
        v-model.number="targetS"
        type="range"
        class="mt-1 w-full"
        min="30"
        :max="targetMax"
        step="15"
        aria-label="Target movie length"
      />
      <div class="mt-1.5 flex items-center gap-2">
        <button
          class="btn btn-mini flex-1"
          :disabled="picking || !editor.stem"
          title="Turns parts on and off across all videos: the best-scoring ones until the length is reached. Stars and your own parts always stay in."
          @click="pickBest"
        >
          {{ picking ? 'Picking…' : 'Pick the best parts' }}
        </button>
        <label
          class="flex items-center gap-1.5 text-[11px] text-muted"
          title="Only add or remove parts to reach the length; what you picked stays"
        >
          <input v-model="keepPicks" type="checkbox" class="m-0" /> Keep my picks
        </label>
      </div>
      <div
        v-if="perVideo.length > 1"
        class="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[11px] text-muted"
      >
        <template v-for="v in perVideo" :key="v.stem">
          <span class="truncate">{{ shortName(v.stem) }}</span>
          <span class="num">{{ v.n }} parts</span>
          <span class="num text-right">{{ fmtDuration(v.s) }}</span>
        </template>
      </div>
    </div>
    <input
      v-model="name"
      class="rounded-ctl border border-line bg-s2 px-3 py-2 text-fg"
      placeholder="Name of your movie"
    />
    <div>
      <div class="mb-1.5 text-xs text-muted">What do you want?</div>
      <div class="grid grid-cols-2 gap-2">
        <button
          class="rounded-ctl border-[1.5px] p-2.5 text-center"
          :class="!separate ? 'border-acc2 bg-acc2/10' : 'border-line bg-s2'"
          @click="separate = false"
        >
          <b class="block text-[13px]">One movie</b
          ><span class="text-xs text-muted">all parts back to back</span>
        </button>
        <button
          class="rounded-ctl border-[1.5px] p-2.5 text-center"
          :class="separate ? 'border-acc2 bg-acc2/10' : 'border-line bg-s2'"
          @click="separate = true"
        >
          <b class="block text-[13px]">Separate clips</b
          ><span class="text-xs text-muted">each part as its own file</span>
        </button>
      </div>
    </div>
    <div>
      <div class="mb-1.5 text-xs text-muted">Which format?</div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="t in TILES"
          :key="t.f"
          class="rounded-ctl border-[1.5px] p-2.5 text-center"
          :class="format === t.f ? 'border-acc2 bg-acc2/10' : 'border-line bg-s2'"
          @click="settings.update({ lastFormat: t.f })"
        >
          <div
            class="mx-auto mb-2 rounded bg-muted"
            :style="{ width: `${t.w}px`, height: `${t.h}px`, marginTop: `${(42 - t.h) / 2}px` }"
          />
          <b class="block text-[13px]">{{ t.label }}</b
          ><span class="text-xs text-muted">{{ t.sub }}</span>
        </button>
      </div>
      <div class="mt-2 text-xs text-muted">
        {{
          format === 'original'
            ? 'Ready within a minute, no quality loss.'
            : 'Drag the frame on the video to choose what stays in view. Applies to the whole movie.'
        }}
      </div>
    </div>
    <div v-if="!separate">
      <div class="mb-1.5 text-xs text-muted">Between the parts</div>
      <div class="grid grid-cols-3 gap-1 rounded-ctl bg-s2 p-1" role="radiogroup">
        <button
          v-for="t in TRANSITIONS"
          :key="t"
          class="rounded-lg py-1 text-xs font-semibold transition-colors"
          :class="transition === t ? 'bg-s3 text-fg shadow-sm' : 'text-muted hover:text-fg'"
          role="radio"
          :aria-checked="transition === t"
          :title="TRANSITION_LABEL[t].hint"
          @click="projects.setTransition(t)"
        >
          {{ TRANSITION_LABEL[t].label }}
        </button>
      </div>
      <div class="mt-1.5 text-xs text-muted">
        {{ TRANSITION_LABEL[transition].hint }}.
        <template
          v-if="format === 'original' && (transition !== 'cut' || cards.title || cards.end)"
        >
          Square with a transition or cards is re-encoded at full quality; Cut without cards keeps
          the lossless copy.
        </template>
      </div>
      <div class="mt-3">
        <div class="mb-1.5 text-xs text-muted">Riding data on the picture</div>
        <div class="grid grid-cols-3 gap-1 rounded-ctl bg-s2 p-1" role="radiogroup">
          <button
            class="rounded-lg py-1 text-xs font-semibold transition-colors"
            :class="!overlay ? 'bg-s3 text-fg shadow-sm' : 'text-muted hover:text-fg'"
            role="radio"
            :aria-checked="!overlay"
            @click="setOverlay(null)"
          >
            Off
          </button>
          <button
            v-for="st in OVERLAY_STYLES"
            :key="st"
            class="rounded-lg py-1 text-xs font-semibold transition-colors"
            :class="overlay?.style === st ? 'bg-s3 text-fg shadow-sm' : 'text-muted hover:text-fg'"
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
        <div v-if="overlay" class="mt-1.5 flex items-center gap-1.5 text-xs">
          <select
            class="flex-1 rounded-ctl border border-line bg-s2 px-2 py-1 text-fg"
            :value="overlay.corner"
            aria-label="Corner of the overlay"
            @change="
              setOverlay({ corner: ($event.target as HTMLSelectElement).value as OverlayCorner })
            "
          >
            <option v-for="c in OVERLAY_CORNERS" :key="c" :value="c">{{ CORNER_LABEL[c] }}</option>
          </select>
          <div class="flex rounded-ctl bg-s2 p-0.5" role="radiogroup" aria-label="Size">
            <button
              v-for="sz in OVERLAY_SIZES"
              :key="sz"
              class="rounded-lg px-2 py-0.5 font-semibold"
              :class="overlay.size === sz ? 'bg-s3 text-fg' : 'text-muted hover:text-fg'"
              role="radio"
              :aria-checked="overlay.size === sz"
              @click="setOverlay({ size: sz })"
            >
              {{ sz }}
            </button>
          </div>
        </div>
        <div v-if="overlay" class="mt-1 text-[11px] text-muted">
          Shown live on the video; the export draws it at full resolution.
          <template v-if="format === 'original' && transition === 'cut'">
            Square is re-encoded for it (full quality).
          </template>
        </div>
      </div>
      <div class="mt-2.5 flex flex-col gap-1.5">
        <label class="flex items-start gap-2 text-xs text-fg">
          <input
            type="checkbox"
            class="m-0 mt-0.5"
            :checked="settings.settings?.titleCard ?? true"
            @change="settings.update({ titleCard: ($event.target as HTMLInputElement).checked })"
          />
          <span>
            Title card
            <span v-if="cards.title" class="block text-muted">
              “{{ cards.title.heading }}” · {{ cards.title.subheading }}
            </span>
          </span>
        </label>
        <label class="flex items-center gap-2 text-xs text-fg">
          <input
            type="checkbox"
            class="m-0"
            :checked="settings.settings?.endCard ?? true"
            @change="settings.update({ endCard: ($event.target as HTMLInputElement).checked })"
          />
          End card <span class="text-muted">· “Made with ApexCut”</span>
        </label>
      </div>
    </div>
    <button
      class="btn btn-pri py-3 text-[15px]"
      :disabled="!items.length || jobs.exporting"
      @click="go"
    >
      {{ jobs.exporting ? 'Working…' : separate ? 'Make clips' : 'Make my movie' }}
    </button>
    <div v-if="job && job.status === 'running'" class="card">
      <progress class="h-3 w-full" :value="job.progress" max="1" />
      <div class="mt-1.5 grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 text-xs">
        <span class="row-span-3 self-center text-[22px] font-bold text-fg"
          >{{ Math.round(job.progress * 100) }}%</span
        >
        <span class="text-muted">{{ job.message }}</span>
        <span class="text-muted">Running {{ fmtElapsed(jobs.elapsed(job)) }}</span>
        <span v-if="jobs.eta(job) != null"
          >About <b>{{ fmtElapsed(jobs.eta(job)!) }}</b> left</span
        >
        <span v-else class="text-muted">Estimating time…</span>
      </div>
      <button class="btn btn-mini mt-2" @click="cancel(job.id)">Cancel</button>
    </div>
    <div
      v-else-if="job && job.status === 'done' && job.result"
      class="card border-brake/40 bg-brake/10 text-sm break-all"
    >
      <b class="text-base text-fg"
        >✓ {{ job.result.kind === 'extract' ? 'Your clips are ready!' : 'Your movie is ready!' }}</b
      >
      <div v-if="job.result.kind === 'export'" class="my-1.5 text-xs text-muted">
        {{ job.result.file }} · {{ job.result.sizeMb }} MB
      </div>
      <div v-if="job.result.kind === 'extract'" class="my-1.5 text-xs text-muted">
        {{ job.result.files.length }} files in {{ job.result.folder }}
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-if="job.result.kind === 'export'"
          class="btn btn-pri btn-mini flex items-center gap-1"
          @click="emit('watch', job.result.url)"
        >
          <PhPlay :size="12" weight="fill" /> Watch
        </button>
        <button
          class="btn btn-mini flex items-center gap-1"
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
    <div v-else-if="job && job.status === 'error'" class="card border-play/40 bg-play/10 text-sm">
      <b>{{ friendlyError(job.error).title }}.</b>
      <span class="text-muted">{{ friendlyError(job.error).hint }}</span>
      <details class="mt-1.5">
        <summary class="cursor-pointer text-xs text-muted">Details</summary>
        <pre class="max-h-[160px] overflow-auto text-[11px] whitespace-pre-wrap">{{
          job.error
        }}</pre>
      </details>
    </div>
    <div v-else-if="job && job.status === 'cancelled'" class="text-xs text-muted">
      Export cancelled.
    </div>
    <div v-if="scope === 'all'" class="card">
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <b class="block text-sm text-fg">Ride card</b>
          <span class="text-xs text-muted">
            A picture with the numbers of this ride and its best moments — for Instagram or the
            group chat. Saved next to your movies and copied to the clipboard.
          </span>
        </div>
        <button
          class="btn btn-mini"
          :disabled="cardBusy || !library.analyzed.length"
          @click="makeRideCard"
        >
          {{ cardBusy ? 'Making…' : 'Make ride card' }}
        </button>
      </div>
    </div>
  </div>
</template>
