<script setup lang="ts">
/**
 * The crop window on the video while a format other than square is chosen: drag it to say what
 * stays in view, double-click (or right-click) to put it back in the middle. The position belongs
 * to the project (composables/useFraming.ts).
 */
import { computed } from 'vue';
import { startDrag } from '@renderer/composables/useDrag';
import { useFollowFrame } from '@renderer/composables/useFollowFrame';
import { useFraming } from '@renderer/composables/useFraming';
import type { Box } from '@renderer/composables/useStageBox';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const props = defineProps<{ box: Box }>();
const frame = useFraming();
const framePos = frame.framePos;
const follow = useFollowFrame();

// which way the window slides, and how much it keeps, depend on the shape of this recording too
const isVertical = computed(() => frame.window.value.horizontal);
const winFrac = computed(() => frame.window.value.frac);
/** where the window is drawn: its resting place, or where the corner has taken it */
const shownPos = computed(() => (follow.on.value ? follow.pos.value : framePos.value));
const winStyle = computed(() => {
  const f = winFrac.value * 100;
  const free = 100 - f;
  return isVertical.value
    ? { top: 0, height: '100%', width: `${f}%`, left: `${shownPos.value * free}%` }
    : { left: 0, width: '100%', height: `${f}%`, top: `${framePos.value * free}%` };
});
defineExpose({ winFrac, isVertical });

function frameDrag(e: MouseEvent): void {
  const free = 1 - winFrac.value;
  const posOf = (ev: MouseEvent, from: { pos: number; x: number; y: number }): number => {
    const d = isVertical.value
      ? (ev.clientX - from.x) / (props.box.width * free)
      : (ev.clientY - from.y) / (props.box.height * free);
    return Math.min(1, Math.max(0, from.pos + d));
  };
  // live while dragging, written once on release (one IPC call, one undo-free change)
  startDrag(e, {
    start: (ev) => ({ pos: framePos.value, x: ev.clientX, y: ev.clientY }),
    move: (ev, from) => void frame.setFramePos(posOf(ev, from), false),
    end: (ev, from) => void frame.setFramePos(posOf(ev, from), true),
  });
}
function resetFrame(): void {
  frame.setFramePos(0.5);
  toast('Frame centered');
}
</script>

<template>
  <div
    class="pointer-events-none absolute z-20 overflow-hidden"
    :style="{
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    }"
  >
    <div
      class="group pointer-events-auto absolute border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,.55)]"
      :class="isVertical ? 'cursor-ew-resize' : 'cursor-ns-resize'"
      :style="winStyle"
      @mousedown="frameDrag"
      @dblclick.prevent="resetFrame"
      @contextmenu.prevent="resetFrame"
    >
      <div
        class="chip absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 text-center text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100"
      >
        {{ isVertical ? 'Drag left or right' : 'Drag to place the horizon' }}
        <small class="block text-[11px] opacity-70">
          {{ follow.on.value ? 'It leans into the corners from here' : 'Double-click to reset' }}
        </small>
      </div>
    </div>
  </div>
</template>
