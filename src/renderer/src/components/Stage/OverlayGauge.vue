<script setup lang="ts">
/**
 * The telemetry overlay as it will look in the movie: the same drawing code as the export, on a
 * canvas over the video box, and inside the same crop the chosen format will make.
 */
import { ref, watch } from 'vue';
import { drawOverlayFrame, overlayLayout, type Ctx2D, type Sample } from '@core/overlay';
import type { Box } from '@renderer/composables/useStageBox';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';

const props = defineProps<{
  box: Box;
  /** how much of the frame the format keeps, and where that window sits */
  winFrac: number;
  framePos: number;
  isVertical: boolean;
}>();
const editor = useEditorStore();
const projects = useProjectsStore();
const gauge = ref<HTMLCanvasElement | null>(null);

/** the 10 Hz signals are on a fixed grid: index straight into them */
function sampleAt(t: number): Sample | null {
  const ts = editor.data.t as number[] | undefined;
  const lean = editor.data.leanDeg as (number | null)[] | undefined;
  const aLon = editor.data.aLonG as (number | null)[] | undefined;
  if (!ts?.length || !lean || !aLon) return null;
  const i = Math.max(0, Math.min(ts.length - 1, Math.round(t * 10)));
  return { leanDeg: lean[i] ?? 0, aLonG: aLon[i] ?? 0 };
}

function draw(): void {
  const c = gauge.value;
  const spec = projects.active?.overlay;
  if (!c) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const w = Math.round(props.box.width);
  const h = Math.round(props.box.height);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  if (!spec || !w || !h) return;
  // the export crops the frame: preview the gauge inside the same crop so it lands where it will be
  const f = props.winFrac;
  const cropW = props.isVertical ? w * f : w;
  const cropH = props.isVertical ? h : h * f;
  const ox = props.isVertical ? props.framePos * (w - cropW) : 0;
  const oy = props.isVertical ? 0 : props.framePos * (h - cropH);
  const L = overlayLayout(spec, cropW, cropH);
  ctx.save();
  ctx.translate(ox, oy);
  drawOverlayFrame(ctx as unknown as Ctx2D, spec, L, sampleAt(editor.time));
  ctx.restore();
}
watch(
  () => [projects.active?.overlay, editor.time, props.box, editor.stem, props.winFrac],
  () => requestAnimationFrame(draw),
  { deep: true, immediate: true },
);
</script>

<template>
  <canvas
    ref="gauge"
    class="pointer-events-none absolute z-10"
    :style="{
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    }"
  />
</template>
