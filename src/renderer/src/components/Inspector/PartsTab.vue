<script setup lang="ts">
/** Parts tab: amount slider, add part, scrollable list synced with the timeline selection, bring back. */
import { computed } from 'vue';
import { PhPlus } from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { AMOUNT_LEVELS, useEditorStore } from '@renderer/stores/editor';
import { fmtDuration, fmtTime } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const emit = defineEmits<{ seek: [t: number]; play: [t: number] }>();
const editor = useEditorStore();

const sorted = computed(() => [...editor.parts].sort((a, b) => a.start_s - b.start_s));

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
    <h4 class="label-caps m-0">
      {{ editor.enabledParts.length }} parts · movie {{ fmtDuration(editor.movieLength) }}
    </h4>
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
      </div>
    </div>
  </div>
</template>
