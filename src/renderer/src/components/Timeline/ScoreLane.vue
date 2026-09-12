<script setup lang="ts">
/**
 * The score lane: the overall score with a faint fill, the leaning and braking curves, the dashed
 * "fun enough" line, the playhead, and a readout of the numbers under the mouse.
 */
import { computed, ref } from 'vue';
import { tokens, useCanvasPainter, type Paint } from '@renderer/composables/useCanvasPainter';
import type { TimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtTime } from '@renderer/utils/format';

const props = defineProps<{ view: TimelineView }>();
defineEmits<{ scrub: [e: MouseEvent] }>();
const editor = useEditorStore();
const cv = ref<HTMLCanvasElement | null>(null);
const lane = ref<HTMLElement | null>(null);
const hoverT = ref<number | null>(null);

function paint({ ctx, W, H, dpr }: Paint): void {
  const view = props.view;
  if (!editor.data.t) return;
  const T = editor.data.t as number[];
  const n = T.length;
  const d = editor.duration || 1;
  const i0 = Math.max(0, Math.floor((view.t0.value / d) * (n - 1)) - 1);
  const i1 = Math.min(n - 1, Math.ceil((view.t1.value / d) * (n - 1)) + 1);
  const stride = Math.max(1, Math.floor((i1 - i0) / W));
  const yOf = (v: number): number => H - Math.min(1, v / 3.5) * H * 0.95;
  const token = tokens();
  ctx.strokeStyle = token('--fg3');
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(0, yOf(editor.threshold));
  ctx.lineTo(W, yOf(editor.threshold));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const score = editor.data.score;
  if (score) {
    ctx.beginPath();
    ctx.moveTo((view.xPct(T[i0]) / 100) * W, H);
    for (let i = i0; i <= i1; i += stride)
      ctx.lineTo((view.xPct(T[i]) / 100) * W, yOf(score[i] ?? 0));
    ctx.lineTo((view.xPct(T[i1]) / 100) * W, H);
    ctx.closePath();
    ctx.fillStyle = token('--fg') + '10';
    ctx.fill();
  }
  const series: [string, string, number][] = [
    ['score', token('--fg'), 1.25],
    ['nLean', token('--corner'), 1],
    ['nAccel', token('--brake'), 1],
  ];
  // what the picture added to the score, when the rider let it vote: its own line under the rest
  if (editor.picture) series.push(['picture', token('--picture'), 1.25]);
  for (const [key, color, w] of series) {
    const arr = editor.data[key];
    if (!arr) continue;
    ctx.strokeStyle = color;
    ctx.globalAlpha = key === 'score' ? 0.7 : 0.75;
    ctx.lineWidth = w * dpr;
    ctx.beginPath();
    let started = false;
    for (let i = i0; i <= i1; i += stride) {
      const v = arr[i];
      if (v === null) {
        started = false;
        continue;
      }
      const x = (view.xPct(T[i]) / 100) * W;
      const y = yOf(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
useCanvasPainter(cv, paint, () => [
  props.view.t0.value,
  props.view.t1.value,
  editor.threshold,
  editor.data,
]);

/** the numbers under the mouse, or null where the scan has no data */
const hoverVals = computed(() => {
  if (hoverT.value === null || !editor.data.t) return null;
  const i = Math.max(0, Math.min(editor.data.t.length - 1, Math.round(hoverT.value * 10)));
  const lean = editor.data.leanDeg?.[i];
  const acc = editor.data.aLonG?.[i] ?? 0;
  const sc = editor.data.score?.[i] ?? 0;
  if (lean === null || lean === undefined) return null;
  return {
    lean: Math.abs(lean).toFixed(0),
    acc: Math.abs(acc ?? 0).toFixed(2),
    accLabel: (acc ?? 0) < -0.05 ? 'braking' : (acc ?? 0) > 0.05 ? 'accelerating' : 'steady',
    score: (sc ?? 0).toFixed(2),
  };
});
function onMove(e: MouseEvent): void {
  if (lane.value) hoverT.value = props.view.tOfEvent(e, lane.value);
}
</script>

<template>
  <div
    ref="lane"
    class="relative h-10 border-b border-line bg-bg1"
    @mousedown="$emit('scrub', $event)"
    @mousemove="onMove"
    @mouseleave="hoverT = null"
  >
    <canvas ref="cv" class="block h-full w-full" />
    <div
      class="pointer-events-none absolute inset-y-0 w-px bg-play"
      :style="{ left: `${view.xPct(editor.time)}%` }"
    />
    <template v-if="hoverT !== null && hoverVals">
      <div
        class="pointer-events-none absolute inset-y-0 w-px bg-fg/40"
        :style="{ left: `${view.xPct(hoverT)}%` }"
      />
      <div
        class="chip num pointer-events-none absolute top-[calc(100%+6px)] z-10 -translate-x-1/2 px-2 py-1 text-[11px] leading-[1.5] whitespace-nowrap"
        :style="{ left: `${Math.min(85, Math.max(8, view.xPct(hoverT)))}%` }"
      >
        <b>{{ fmtTime(hoverT) }}</b> · score {{ hoverVals.score }}<br />
        <span class="mr-1 inline-block h-2 w-2 rounded-[1px] bg-corner align-[-1px]" />lean
        {{ hoverVals.lean }}°
        <span class="mr-1 ml-2 inline-block h-2 w-2 rounded-[1px] bg-brake align-[-1px]" />{{
          hoverVals.accLabel
        }}
        {{ hoverVals.acc }} g
      </div>
    </template>
  </div>
</template>
