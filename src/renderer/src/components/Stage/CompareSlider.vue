<script setup lang="ts">
/**
 * Before and after, in one picture: a second copy of the same frame without the colours, clipped to
 * the left of a divider you can drag. It follows the player, so it works while the movie runs and
 * while it is paused. Only mounted while the comparison is on, so nothing is decoded twice for
 * nothing.
 */
import { onMounted, ref, watch } from 'vue';
import { PhArrowsHorizontal } from '@phosphor-icons/vue';
import { startDrag } from '@renderer/composables/useDrag';
import type { Box } from '@renderer/composables/useStageBox';
import { useEditorStore } from '@renderer/stores/editor';

const props = defineProps<{ box: Box; src: string }>();
const editor = useEditorStore();

/** where the divider stands, 0..1 of the picture's width */
const at = ref(0.5);
const plain = ref<HTMLVideoElement | null>(null);
const root = ref<HTMLElement | null>(null);

/** keep the plain copy on the same frame as the graded one */
function follow(): void {
  const v = plain.value;
  if (!v) return;
  if (Math.abs(v.currentTime - editor.time) > 0.08) v.currentTime = editor.time;
  if (editor.playing && v.paused) v.play().catch(() => undefined);
  if (!editor.playing && !v.paused) v.pause();
}
watch(() => [editor.time, editor.playing], follow);
watch(
  () => props.src,
  (s) => {
    const v = plain.value;
    if (v && s) {
      v.src = s;
      v.load();
    }
  },
);
onMounted(() => {
  const v = plain.value;
  if (v && props.src) v.src = props.src;
  follow();
});

function dragDivider(e: MouseEvent): void {
  const el = root.value;
  if (!el) return;
  const move = (ev: MouseEvent): void => {
    const r = el.getBoundingClientRect();
    at.value = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  };
  move(e);
  startDrag(e, { start: () => null, move: (ev) => move(ev), cursor: 'ew-resize' });
}
</script>

<template>
  <div
    ref="root"
    class="absolute z-[7] overflow-hidden"
    :style="{
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    }"
  >
    <!-- the recording as it is, only on the left of the divider -->
    <video
      ref="plain"
      class="pointer-events-none absolute inset-0 h-full w-full object-contain"
      :style="{ clipPath: `inset(0 ${(1 - at) * 100}% 0 0)` }"
      muted
      preload="metadata"
    />
    <div
      class="absolute inset-y-0 w-px cursor-ew-resize bg-white/90"
      :style="{ left: `${at * 100}%` }"
      @mousedown="dragDivider"
    >
      <div
        class="chip absolute top-1/2 left-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      >
        <PhArrowsHorizontal :size="12" weight="bold" />
      </div>
    </div>
    <span
      class="chip pointer-events-none absolute bottom-4 left-4 px-2 py-1 text-[11px]"
      :style="{ opacity: at > 0.12 ? 1 : 0 }"
    >
      As recorded
    </span>
    <span
      class="chip pointer-events-none absolute right-4 bottom-4 px-2 py-1 text-[11px]"
      :style="{ opacity: at < 0.88 ? 1 : 0 }"
    >
      With your colours
    </span>
  </div>
</template>
