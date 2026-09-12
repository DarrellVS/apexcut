<script setup lang="ts">
/**
 * The timeline: ruler · score lane · parts lane (the filmstrip behind the blocks, the blocks with
 * their edge grips, join suggestions and the floating toolbar) · music lane · legend.
 *
 * Each lane is its own component; this file owns the shared view (zoom and pan), the selection and
 * the dragging of edges.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Part } from '@core/types';
import { startDrag } from '@renderer/composables/useDrag';
import { useEdgeSnap } from '@renderer/composables/useEdgeSnap';
import { useCanvasPainter } from '@renderer/composables/useCanvasPainter';
import { useTimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtDuration } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import MovieLane from './MovieLane.vue';
import MovieRuler from './MovieRuler.vue';
import MarkFlags from './MarkFlags.vue';
import MusicLane from './MusicLane.vue';
import PartBlock from './PartBlock.vue';
import PartToolbar from './PartToolbar.vue';
import ScoreLane from './ScoreLane.vue';
import TimelineLegend from './TimelineLegend.vue';
import TimelineRuler from './TimelineRuler.vue';

const emit = defineEmits<{
  seek: [t: number];
  play: [t: number];
  open: [stem: string, t: number];
}>();
/** the lane shows the open video's own time, or the movie from end to end */
const mode = ref<'video' | 'movie'>('video');
const editor = useEditorStore();
const duration = computed(() => editor.duration);
const view = useTimelineView(duration);
const edgeSnap = useEdgeSnap(view);

const lane = ref<HTMLElement | null>(null);
const stripCv = ref<HTMLCanvasElement | null>(null);
const dragging = ref(false);
const stripImg = ref<HTMLImageElement | null>(null);
/** lane width in px, for deciding how much label fits in a block */
const laneW = ref(0);

// ---- the filmstrip behind the blocks
useCanvasPainter(
  stripCv,
  ({ ctx, W, H }) => {
    const img = stripImg.value;
    const meta = editor.filmstrip;
    if (!img || !meta || !img.complete) return;
    const pxPerSec = W / view.span.value;
    const thumbW = H;
    const secPerThumb = thumbW / pxPerSec;
    for (
      let t = Math.floor(view.t0.value / secPerThumb) * secPerThumb;
      t < view.t1.value;
      t += secPerThumb
    ) {
      const i = Math.min(meta.n - 1, Math.max(0, Math.round((t + secPerThumb / 2) / meta.step)));
      ctx.drawImage(
        img,
        i * meta.size,
        0,
        meta.size,
        meta.size,
        (view.xPct(t) / 100) * W,
        0,
        thumbW + 1,
        H,
      );
    }
  },
  () => [view.t0.value, view.t1.value, stripImg.value],
);
watch(
  () => editor.filmstrip,
  (f) => {
    stripImg.value = null;
    if (!f) return;
    const img = new Image();
    img.onload = () => (stripImg.value = img);
    img.src = f.url;
  },
);

// ---- the view follows the video and the ride
watch(
  () => editor.stem,
  () => view.fit(),
);
watch(
  () => editor.duration,
  () => view.fit(),
  { immediate: true },
);
watch(
  () => editor.time,
  (t) => editor.playing && view.follow(t),
);

/** Clicking anywhere that is not a block, the toolbar, or a part row clears the selection. */
function onGlobalDown(e: MouseEvent): void {
  if (!editor.selection.length) return;
  const t = e.target as HTMLElement;
  if (t.closest('[data-keep-selection]')) return;
  editor.clearSelection();
}
let laneResize: ResizeObserver | null = null;
onMounted(() => {
  document.addEventListener('mousedown', onGlobalDown);
  laneResize = new ResizeObserver(() => (laneW.value = lane.value?.clientWidth ?? 0));
  if (lane.value) laneResize.observe(lane.value);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', onGlobalDown);
  laneResize?.disconnect();
});

// ---- interaction
function scrub(e: MouseEvent): void {
  const el = lane.value;
  if (!el) return;
  const seekTo = (ev: MouseEvent): void =>
    emit('seek', Math.max(0, Math.min(duration.value, view.tOfEvent(ev, el))));
  seekTo(e);
  startDrag(e, { start: () => null, move: (ev) => seekTo(ev) });
}
function laneDown(e: MouseEvent): void {
  editor.clearSelection();
  scrub(e);
}
function blockDown(e: MouseEvent, p: Part): void {
  editor.select(p.id, e.shiftKey || e.ctrlKey);
}
/** Keyboard on a focused block: arrows move to the neighbour, Enter plays, Space toggles, Delete removes. */
function blockKey(e: KeyboardEvent, p: Part): void {
  const sorted = [...editor.parts].sort((a, b) => a.start_s - b.start_s);
  const i = sorted.findIndex((x) => x.id === p.id);
  const focusPart = (q: Part | undefined): void => {
    if (!q) return;
    editor.select(q.id);
    (lane.value?.querySelector(`[data-part="${q.id}"]`) as HTMLElement | null)?.focus();
  };
  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      focusPart(sorted[i + 1]);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      focusPart(sorted[i - 1]);
      break;
    case 'Enter':
      e.preventDefault();
      emit('play', p.start_s);
      break;
    case ' ':
      e.preventDefault();
      editor.setEnabled([p], !p.enabled);
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      editor.remove([p]);
      toast('Part deleted — Ctrl+Z brings it back');
      break;
  }
}
function dragEdge(e: MouseEvent, p: Part, edge: 'start_s' | 'end_s'): void {
  const el = lane.value;
  if (!el) return;
  editor.select(p.id);
  editor.snapshot();
  dragging.value = true;
  startDrag(e, {
    start: () => null,
    move: (ev) =>
      editor.setEdge(p, edge, edgeSnap.snap(view.tOfEvent(ev, el), ev, p, el.clientWidth)),
    end: () => {
      dragging.value = false;
      edgeSnap.clear();
      editor.save();
    },
  });
}

// ---- what the toolbar acts on
const sel = computed(() => editor.selectedParts);
const allOn = computed(() => sel.value.every((p) => p.enabled));
/** middle of the selection in lane pixels; the toolbar clamps itself to the lane from there */
const selCentre = computed(() => {
  if (!sel.value.length) return 0;
  const a = Math.min(...sel.value.map((p) => p.start_s));
  const b = Math.max(...sel.value.map((p) => p.end_s));
  return (view.xPct((a + b) / 2) / 100) * laneW.value;
});
function joinSel(): void {
  const merged = editor.join(sel.value);
  if (merged) toast(`Joined into one part of ${fmtDuration(merged.end_s - merged.start_s)}`);
}
function joinNext(p: Part): void {
  const n = editor.nextOf(p);
  if (n) {
    const merged = editor.join([p, n]);
    if (merged) toast(`Joined into one part of ${fmtDuration(merged.end_s - merged.start_s)}`);
  }
}
function del(): void {
  editor.remove(sel.value);
  toast('Part deleted — Ctrl+Z brings it back');
}
</script>

<template>
  <footer
    class="panel flex h-[300px] flex-none flex-col overflow-hidden border-t border-line select-none"
  >
    <template v-if="mode === 'video'">
      <TimelineRuler :view="view" @scrub="scrub" />
      <ScoreLane :view="view" @scrub="scrub" />
    </template>
    <template v-if="mode === 'movie'">
      <MovieRuler />
      <MovieLane @play="(stem, t) => emit('open', stem, t)" />
    </template>
    <!-- parts lane -->
    <div
      v-if="mode === 'video'"
      ref="lane"
      class="relative flex-1 bg-bg1"
      data-tour="parts"
      @mousedown.self="laneDown"
      @wheel="view.onWheel($event, lane!)"
    >
      <canvas
        ref="stripCv"
        class="strip pointer-events-none absolute inset-0 h-full w-full saturate-[.6]"
      />
      <MarkFlags :view="view" @seek="emit('seek', $event)" />
      <PartBlock
        v-for="p in editor.parts"
        :key="p.id"
        :part="p"
        :view="view"
        :lane-w="laneW"
        :selected="editor.selection.includes(p.id)"
        @select="blockDown($event, p)"
        @play="emit('play', $event)"
        @keys="blockKey($event, p)"
        @hover="editor.hoverId = $event"
        @drag-edge="(e, edge) => dragEdge(e, p, edge)"
      />
      <div
        v-for="g in editor.suggestions"
        :key="g.id"
        class="absolute top-0.5 z-[4] flex h-[10px] cursor-pointer items-center justify-center overflow-hidden rounded-[2px] border border-dashed border-corner/70 text-[10px] leading-none whitespace-nowrap text-fg2 transition-colors hover:bg-corner hover:text-black"
        :style="{
          left: `${view.xPct(g.from)}%`,
          width: `${Math.max(0.3, view.xPct(g.to) - view.xPct(g.from))}%`,
        }"
        :title="`These ${g.parts.length} parts probably belong together. Click to join them into one continuous part.`"
        @mousedown.stop
        @click.stop="editor.join(g.parts) && toast(`Joined ${g.parts.length} parts`)"
      >
        Join {{ g.parts.length }}
      </div>
      <div
        class="pointer-events-none absolute inset-y-0 z-[3] w-px bg-play"
        :style="{ left: `${view.xPct(editor.time)}%` }"
      />
      <!-- snap guide: where the dragged edge clicked into place -->
      <div
        v-if="edgeSnap.snapT.value !== null"
        class="pointer-events-none absolute inset-y-0 z-[3] w-px bg-fg/70"
        :style="{ left: `${view.xPct(edgeSnap.snapT.value)}%` }"
      />
      <PartToolbar
        v-if="sel.length && !dragging"
        :parts="sel"
        :centre="selCentre"
        :lane-w="laneW"
        :has-next="sel.length === 1 && !!editor.nextOf(sel[0])"
        @play="emit('play', Math.min(...sel.map((p) => p.start_s)))"
        @toggle="editor.setEnabled(sel, !allOn)"
        @star="editor.toggleStar(sel)"
        @join="joinSel"
        @join-next="joinNext(sel[0])"
        @remove="del"
      />
    </div>
    <MusicLane />
    <TimelineLegend :view="view" :mode="mode" @mode="mode = $event" />
  </footer>
</template>
