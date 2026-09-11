<script setup lang="ts">
/** Parts tab: amount slider, add part, scrollable list synced with the timeline selection, bring back. */
import { api } from '@renderer/api';
import { computed, ref } from 'vue';
import { PhCaretRight, PhPlus, PhStar } from '@phosphor-icons/vue';
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
const pulls = computed(() => projects.active?.pulls ?? false);
const togglingPulls = ref(false);
async function togglePulls(on: boolean): Promise<void> {
  if (togglingPulls.value) return;
  togglingPulls.value = true;
  try {
    const before = editor.parts.length;
    await projects.setPulls(on);
    if (editor.stem) await editor.open(editor.stem);
    await Promise.all([library.refresh(), projects.refresh()]);
    toast(
      on
        ? `Pulls count too: ${editor.parts.length} parts in this video (was ${before})`
        : `Pulls left out: ${editor.parts.length} parts in this video (was ${before})`,
    );
  } finally {
    togglingPulls.value = false;
  }
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
  <div class="flex flex-col gap-3">
    <section>
      <div class="mb-1.5 flex items-center justify-between">
        <span class="label-caps">How picky?</span>
        <span
          v-if="preset === 'custom'"
          class="text-[11px] text-fg3"
          title="A slider was moved; pick a preset to go back"
        >
          Custom
        </span>
      </div>
      <div class="seg" role="radiogroup">
        <button
          v-for="id in PRESET_IDS"
          :key="id"
          class="seg-item"
          role="radio"
          :aria-checked="preset === id"
          :title="PRESETS[id].hint"
          :disabled="applying"
          @click="choosePreset(id)"
        >
          {{ PRESETS[id].label }}
        </button>
      </div>
      <div class="mt-2.5 flex justify-between text-[11px] text-fg2">
        <span>Fewer parts</span><span>More parts</span>
      </div>
      <input
        type="range"
        class="w-full"
        min="0"
        max="4"
        step="1"
        :value="editor.amountIndex"
        aria-label="How many parts"
        @change="onAmount"
      />
      <label class="mt-2 flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="pulls"
          :disabled="togglingPulls"
          @change="togglePulls(($event.target as HTMLInputElement).checked)"
        />
        <span>
          <b class="block font-semibold text-fg">Count acceleration pulls too</b>
          <span class="text-fg2">
            Straight-line pulls: opening up for a few seconds and gaining real speed. Normally only
            braking and acceleration near a corner count.
          </span>
        </span>
      </label>
      <button class="btn mt-2.5 w-full" @click="addHere">
        <PhPlus :size="13" /> Add part at <span class="num">{{ fmtTime(editor.time) }}</span>
      </button>
    </section>

    <details v-if="ride" class="group border-t border-line pt-2.5" open>
      <summary class="label-caps flex cursor-pointer items-center gap-1 outline-none select-none">
        <PhCaretRight :size="10" weight="bold" class="transition-transform group-open:rotate-90" />
        This ride
      </summary>
      <dl class="num m-0 mt-2 grid grid-cols-[1fr_auto] gap-x-3 text-xs">
        <button
          class="col-span-2 grid grid-cols-subgrid items-baseline rounded-ctl px-1.5 py-1 text-left hover:bg-bg3"
          title="Jump there"
          @click="emit('play', Math.max(0, ride.maxLeanT - 3))"
        >
          <dt class="text-fg2">Sharpest lean · {{ fmtTime(ride.maxLeanT) }}</dt>
          <dd class="m-0 font-semibold text-fg">{{ Math.round(ride.maxLean) }}°</dd>
        </button>
        <button
          class="col-span-2 grid grid-cols-subgrid items-baseline rounded-ctl px-1.5 py-1 text-left hover:bg-bg3"
          title="Jump there"
          @click="emit('play', Math.max(0, ride.maxBrakeT - 3))"
        >
          <dt class="text-fg2">Hardest braking · {{ fmtTime(ride.maxBrakeT) }}</dt>
          <dd class="m-0 font-semibold text-fg">{{ ride.maxBrake.toFixed(2) }} g</dd>
        </button>
        <button
          class="col-span-2 grid grid-cols-subgrid items-baseline rounded-ctl px-1.5 py-1 text-left hover:bg-bg3"
          title="Jump there"
          @click="emit('play', ride.twistyT)"
        >
          <dt class="text-fg2">Twistiest minute · leaning {{ ride.twistyPct }}% of the time</dt>
          <dd class="m-0 font-semibold text-fg">{{ fmtTime(ride.twistyT) }}</dd>
        </button>
        <div class="col-span-2 grid grid-cols-subgrid items-baseline px-1.5 py-1">
          <dt class="text-fg2">Parts with corners</dt>
          <dd class="m-0 font-semibold text-fg">{{ ride.corners }}</dd>
        </div>
      </dl>
    </details>

    <section class="border-t border-line pt-2.5">
      <div class="mb-1 flex h-6 items-center justify-between">
        <span class="label-caps num normal-case tracking-normal">
          {{ plural(editor.enabledParts.length, 'part') }} · movie
          {{ fmtDuration(editor.movieLength) }}
        </span>
        <button
          v-if="nStarred"
          class="btn btn-ghost btn-mini px-1.5"
          :class="{ 'bg-bg3 text-fg': onlyStarred }"
          :aria-pressed="onlyStarred"
          title="Show only starred parts"
          @click="onlyStarred = !onlyStarred"
        >
          <PhStar :size="11" weight="fill" /> {{ nStarred }}
        </button>
      </div>
      <div class="flex flex-col">
        <div
          v-for="p in sorted"
          :key="p.id"
          class="num flex h-7 cursor-pointer items-center gap-2 rounded-ctl border border-transparent px-1.5 text-xs transition-colors hover:bg-bg3"
          :class="[
            editor.selection.includes(p.id) ? 'border-line2 bg-bg2' : '',
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
            :aria-label="`${REASON_LABEL[reasonOf(p)]} at ${fmtTime(p.start_s)} in the movie`"
            @click.stop
            @change="editor.setEnabled([p], ($event.target as HTMLInputElement).checked)"
          />
          <span class="h-3 w-[3px] flex-none rounded-[1px]" :style="{ background: colorOf(p) }" />
          <span class="w-9 text-fg2">{{ fmtTime(p.start_s) }}</span>
          <span class="flex-1 truncate">{{ REASON_LABEL[reasonOf(p)] }}</span>
          <span class="text-fg2">{{ fmtDuration(p.end_s - p.start_s) }}</span>
          <button
            class="rounded-[3px] p-0.5"
            :class="p.starred ? 'text-fg' : 'text-fg3/50 hover:text-fg'"
            :title="p.starred ? 'Remove the star' : 'Star this part (F)'"
            :aria-label="p.starred ? 'Unstar' : 'Star'"
            :aria-pressed="!!p.starred"
            @click.stop="editor.toggleStar([p])"
          >
            <PhStar :size="12" :weight="p.starred ? 'fill' : 'regular'" />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
