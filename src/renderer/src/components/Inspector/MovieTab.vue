<script setup lang="ts">
/** Movie tab: what (one movie / separate clips), format 2×2, framing hint, name, go, progress, result. */
import { computed, ref, watch } from 'vue';
import { PhFolderOpen, PhPlay } from '@phosphor-icons/vue';
import type { ExportFormat, ExportRequest } from '@shared/ipc';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { friendlyError } from '@renderer/utils/errors';
import { fmtDuration, fmtElapsed, shortName } from '@renderer/utils/format';

const scope = defineModel<'all' | 'current'>('scope', { default: 'all' });
const editor = useEditorStore();
const library = useLibraryStore();
const jobs = useJobsStore();
const settings = useSettingsStore();

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

const items = computed(() => {
  const out: ExportRequest['items'] = [];
  const clips = library.analyzed.filter((c) => scope.value === 'all' || c.stem === library.current);
  for (const c of clips) {
    if (c.stem === editor.stem) {
      for (const p of editor.enabledParts)
        out.push({ stem: c.stem, startS: p.start_s, endS: p.end_s, reden: p.reden });
    } else out.push(...(otherParts.value[c.stem] ?? []));
  }
  return out;
});
/** parts of the videos that are not open; loaded lazily */
const otherParts = ref<Record<string, ExportRequest['items']>>({});
async function loadOthers(): Promise<void> {
  for (const c of library.analyzed) {
    if (c.stem === editor.stem || otherParts.value[c.stem]) continue;
    const tl = await window.apexcut.analysis.timeline(c.stem);
    otherParts.value[c.stem] = tl.parts
      .filter((p) => p.enabled)
      .map((p) => ({ stem: c.stem, startS: p.start_s, endS: p.end_s, reden: p.reden }));
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

const summary = computed(() => {
  const it = items.value;
  if (!it.length) return 'no parts selected yet';
  const n = new Set(it.map((i) => i.stem)).size;
  return `${it.length} parts${n > 1 ? ` from ${n} videos` : ''} · ${fmtDuration(it.reduce((a, i) => a + i.endS - i.startS, 0))}`;
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
  </div>
</template>
