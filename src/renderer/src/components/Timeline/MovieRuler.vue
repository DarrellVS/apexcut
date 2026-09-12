<script setup lang="ts">
/** The clock of the movie: how far in each moment is, and where the playhead stands in it. */
import { computed, ref } from 'vue';
import { tokens, useCanvasPainter, type Paint } from '@renderer/composables/useCanvasPainter';
import { useMovieTime } from '@renderer/composables/useMovieTime';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtTime } from '@renderer/utils/format';

const editor = useEditorStore();
const { laneLen, movieTimeOf } = useMovieTime();
const cv = ref<HTMLCanvasElement | null>(null);

function paint({ ctx, W, H, dpr }: Paint): void {
  const span = laneLen.value;
  const step = span > 900 ? 120 : span > 400 ? 60 : span > 150 ? 30 : span > 60 ? 10 : 5;
  const token = tokens();
  ctx.fillStyle = token('--fg3');
  ctx.font = `${10 * dpr}px ${token('--font-sans')}`;
  ctx.textBaseline = 'middle';
  const minor = step / (step % 3 === 0 ? 3 : 2);
  for (let t = 0; t <= span; t += minor) {
    const x = Math.round((t / span) * W);
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ctx.fillRect(x, H - (major ? 6 : 3) * dpr, dpr, (major ? 6 : 3) * dpr);
    if (major) ctx.fillText(fmtTime(t), x + 4 * dpr, H / 2 - 1 * dpr);
  }
}
useCanvasPainter(cv, paint, () => laneLen.value);
const playheadPct = computed(() => (movieTimeOf(editor.time) / laneLen.value) * 100);
</script>

<template>
  <div class="relative h-5 border-b border-line bg-bg0">
    <canvas ref="cv" class="block h-full w-full" />
    <div
      class="pointer-events-none absolute top-0 z-[3] -translate-x-1/2"
      :style="{ left: `${playheadPct}%` }"
    >
      <div class="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-play" />
    </div>
  </div>
</template>
