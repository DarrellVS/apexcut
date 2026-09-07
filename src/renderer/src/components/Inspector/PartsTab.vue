<script setup lang="ts">
/** Parts tab: amount slider, add part, scrollable list synced with the timeline selection, bring back. */
import { api } from '@renderer/api';
import { computed, ref } from 'vue';
import { PhPlus, PhStar } from '@phosphor-icons/vue';
import { PRESET_IDS, PRESETS, presetOf, type PresetId } from '@core/presets';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { AMOUNT_LEVELS, useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { fmtDuration, fmtTime, plural } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const emit = defineEmits<{ seek: [t: number]; play: [t: number] }>();
const editor = useEditorStore();
const library = useLibraryStore();
const projects = useProjectsStore();

/** the project's preset, or Custom once the open video's sliders moved away from it */
const preset = computed<PresetId | 'custom'>(() => presetOf(editor.config));
const applying = ref(false);
async function choosePreset(id: PresetId): Promise<void> {
  if (applying.value) return;
  applying.value = true;
  try {
    const before = editor.parts.length;
    await api.projects.setPreset(id);
    if (editor.stem) await editor.open(editor.stem);
    await Promise.all([library.refresh(), projects.refresh()]);
    toast(`${PRESETS[id].label}: ${editor.parts.length} parts in this video (was ${before})`);
  } finally {
    applying.value = false;
  }
}

const onlyStarred = ref(false);
const nStarred = computed(() => editor.parts.filter((p) => p.starred).length);
const sorted = computed(() =>
  [...editor.parts]
    .filter((p) => !onlyStarred.value || p.starred)
    .sort((a, b) => a.start_s - b.start_s),
);

/** "Your ride in numbers": a few facts straight from the 10 Hz signals. */
const ride = computed(() => {
  const lean = editor.data.leanDeg as (number | null)[] | undefined;
  const aLon = editor.data.aLonG as (number | null)[] | undefined;
  const t = editor.data.t as number[] | undefined;
  if (!lean || !aLon || !t || !t.length) return null;
  let maxLean = 0;
  let maxLeanT = 0;
  let maxBrake = 0;
  let maxBrakeT = 0;
  for (let i = 0; i < t.length; i++) {
    const l = Math.abs(lean[i] ?? 0);
    if (l > maxLean) {
      maxLean = l;
      maxLeanT = t[i];
    }
    const b = -(aLon[i] ?? 0);
    if (b > maxBrake) {
      maxBrake = b;
      maxBrakeT = t[i];
    }
  }
  // twistiest minute: 60 s window with the most time above 10° of lean
  const win = 600;
  let best = 0;
  let bestT = 0;
  let run = 0;
  for (let i = 0; i < t.length; i++) {
    run += Math.abs(lean[i] ?? 0) > 10 ? 1 : 0;
    if (i >= win) run -= Math.abs(lean[i - win] ?? 0) > 10 ? 1 : 0;
    if (run > best) {
      best = run;
      bestT = Math.max(0, t[i] - 60);
    }
  }
  const corners = editor.parts.filter((p) => p.reden !== 'accel/rem').length;
  return {
    maxLean,
    maxLeanT,
    maxBrake,
    maxBrakeT,
    twistyT: bestT,
    twistyPct: Math.round((best / win) * 100),
    corners,
  };
});
const colorOf = (p: Part): string =>
  ({
    bochten: 'var(--corner)',
    'accel/rem': 'var(--brake)',
    beide: 'var(--both)',
    handmatig: 'var(--manual)',
    samengeplakt: 'var(--manual)',
  })[reasonOf(p)];

function onAmount(e: Event): void {
  const idx = Number((e.target as HTMLInputElement).value);
  const before = editor.parts.length;
  editor
    .rescore({ threshold_pct: AMOUNT_LEVELS[idx] })
    .then(() => toast(`${editor.parts.length} parts (was ${before})`));
}
function addHere(): void {
  editor.addAt(editor.time);
  toast('Part added — drag the edges to fit');
}
function clickRow(p: Part, e: MouseEvent): void {
  editor.select(p.id, e.shiftKey || e.ctrlKey);
  emit('seek', p.start_s);
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="card">
      <div class="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>How picky?</span>
        <span v-if="preset === 'custom'" title="A slider was moved; pick a preset to go back">
          Custom
        </span>
      </div>
      <div class="mb-2.5 grid grid-cols-3 gap-1 rounded-ctl bg-s2 p-1" role="radiogroup">
        <button
          v-for="id in PRESET_IDS"
          :key="id"
          class="rounded-lg py-1 text-xs font-semibold transition-colors"
          :class="preset === id ? 'bg-s3 text-fg shadow-sm' : 'text-muted hover:text-fg'"
          role="radio"
          :aria-checked="preset === id"
          :title="PRESETS[id].hint"
          :disabled="applying"
          @click="choosePreset(id)"
        >
          {{ PRESETS[id].label }}
        </button>
      </div>
      <div class="flex justify-between text-xs text-muted">
        <span>Fewer parts</span><span>More parts</span>
      </div>
      <input
        type="range"
        class="w-full"
        min="0"
        max="4"
        step="1"
        :value="editor.amountIndex"
        @change="onAmount"
      />
      <button class="btn mt-2 flex w-full items-center justify-center gap-1.5" @click="addHere">
        <PhPlus :size="14" /> Add part at {{ fmtTime(editor.time) }}
      </button>
    </div>
    <details v-if="ride" class="card" open>
      <summary class="label-caps cursor-pointer outline-none select-none">
        Your ride in numbers
      </summary>
      <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
        <button
          class="rounded-lg bg-s2 p-2 text-left hover:bg-s3"
          title="Jump there"
          @click="emit('play', Math.max(0, ride.maxLeanT - 3))"
        >
          <b class="block text-lg text-fg">{{ Math.round(ride.maxLean) }}°</b>sharpest lean ·
          {{ fmtTime(ride.maxLeanT) }}
        </button>
        <button
          class="rounded-lg bg-s2 p-2 text-left hover:bg-s3"
          title="Jump there"
          @click="emit('play', Math.max(0, ride.maxBrakeT - 3))"
        >
          <b class="block text-lg text-fg">{{ ride.maxBrake.toFixed(2) }} g</b>hardest braking ·
          {{ fmtTime(ride.maxBrakeT) }}
        </button>
        <button
          class="rounded-lg bg-s2 p-2 text-left hover:bg-s3"
          title="Jump there"
          @click="emit('play', ride.twistyT)"
        >
          <b class="block text-lg text-fg">{{ fmtTime(ride.twistyT) }}</b
          >twistiest minute · leaning {{ ride.twistyPct }}% of the time
        </button>
        <div class="rounded-lg bg-s2 p-2">
          <b class="block text-lg text-fg">{{ ride.corners }}</b
          >parts with corners
        </div>
      </div>
    </details>
    <div class="flex items-center justify-between">
      <h4 class="label-caps m-0">
        {{ plural(editor.enabledParts.length, 'part') }} · movie
        {{ fmtDuration(editor.movieLength) }}
      </h4>
      <button
        v-if="nStarred"
        class="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] hover:bg-s2"
        :class="onlyStarred ? 'bg-s3 text-fg' : 'text-muted'"
        :aria-pressed="onlyStarred"
        title="Show only starred parts"
        @click="onlyStarred = !onlyStarred"
      >
        <PhStar :size="11" weight="fill" /> {{ nStarred }}
      </button>
    </div>
    <div class="flex flex-col gap-0.5">
      <div
        v-for="p in sorted"
        :key="p.id"
        class="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors hover:bg-s2"
        :class="[
          editor.selection.includes(p.id) ? 'border-sel bg-s2' : 'border-transparent',
          { 'opacity-45': !p.enabled },
        ]"
        data-keep-selection
        @click="clickRow(p, $event)"
        @dblclick="emit('play', p.start_s)"
        @mouseenter="editor.hoverId = p.id"
        @mouseleave="editor.hoverId = null"
      >
        <input
          type="checkbox"
          class="m-0"
          :checked="p.enabled"
          @click.stop
          @change="editor.setEnabled([p], ($event.target as HTMLInputElement).checked)"
        />
        <span class="h-2 w-2 flex-none rounded-sm" :style="{ background: colorOf(p) }" />
        <span class="num">{{ fmtTime(p.start_s) }}</span>
        <span class="flex-1 truncate">{{ REASON_LABEL[reasonOf(p)] }}</span>
        <span class="text-muted">{{ fmtDuration(p.end_s - p.start_s) }}</span>
        <button
          class="rounded p-0.5"
          :class="p.starred ? 'text-corner' : 'text-muted/50 hover:text-fg'"
          :title="p.starred ? 'Remove the star' : 'Star this part (F)'"
          :aria-label="p.starred ? 'Unstar' : 'Star'"
          :aria-pressed="!!p.starred"
          @click.stop="editor.toggleStar([p])"
        >
          <PhStar :size="13" :weight="p.starred ? 'fill' : 'regular'" />
        </button>
      </div>
    </div>
  </div>
</template>
