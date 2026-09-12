<script setup lang="ts">
/** The clock above the lanes: minor and major ticks, times, and the playhead's triangle. */
import { ref } from 'vue';
import { tokens, useCanvasPainter, type Paint } from '@renderer/composables/useCanvasPainter';
import type { TimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtTime } from '@renderer/utils/format';

const props = defineProps<{ view: TimelineView }>();
defineEmits<{ scrub: [e: MouseEvent] }>();
const editor = useEditorStore();
const cv = ref<HTMLCanvasElement | null>(null);

function paint({ ctx, W, H, dpr }: Paint): void {
  const view = props.view;
  const span = view.span.value;
  const step =
    span > 900 ? 120 : span > 400 ? 60 : span > 150 ? 30 : span > 60 ? 10 : span > 20 ? 5 : 1;
  const token = tokens();
  ctx.fillStyle = token('--fg3');
  ctx.font = `${10 * dpr}px ${token('--font-sans')}`;
  ctx.textBaseline = 'middle';
  // minor ticks between the labelled ones
  const minor = step / (step % 3 === 0 ? 3 : step % 2 === 0 ? 2 : 1);
  for (let t = Math.ceil(view.t0.value / minor) * minor; t <= view.t1.value; t += minor) {
    const x = Math.round((view.xPct(t) / 100) * W);
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ctx.fillRect(x, H - (major ? 6 : 3) * dpr, dpr, (major ? 6 : 3) * dpr);
    if (major) ctx.fillText(fmtTime(t), x + 4 * dpr, H / 2 - 1 * dpr);
  }
}
useCanvasPainter(cv, paint, () => [props.view.t0.value, props.view.t1.value]);
</script>

<template>
  <div
    class="relative h-5 cursor-pointer border-b border-line bg-bg0"
    @mousedown="$emit('scrub', $event)"
  >
    <canvas ref="cv" class="block h-full w-full" />
    <!-- playhead head -->
    <div
      class="pointer-events-none absolute top-0 z-[3] -translate-x-1/2"
      :style="{ left: `${view.xPct(editor.time)}%` }"
    >
      <div class="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-play" />
    </div>
  </div>
</template>
