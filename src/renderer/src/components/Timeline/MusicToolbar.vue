<script setup lang="ts">
/** What you can do to the selected song: its own volume, its fades, its order, and removing it. */
import { PhCaretLeft, PhCaretRight, PhTrash } from '@phosphor-icons/vue';
import type { MusicTrack } from '@shared/ipc';

defineProps<{ track: MusicTrack; left: string }>();
const emit = defineEmits<{
  gain: [v: number];
  fadeIn: [v: number];
  fadeOut: [v: number];
  move: [dir: -1 | 1];
  remove: [];
}>();
const valueOf = (e: Event): number => Number((e.target as HTMLInputElement).value);
</script>

<template>
  <div
    class="chip absolute -top-1 z-[6] flex -translate-y-full items-center gap-2 px-2 py-1 text-xs whitespace-nowrap"
    :style="{ left }"
    data-music-keep
    @mousedown.stop
  >
    <b class="max-w-[120px] truncate">{{ track.name }}</b>
    <label class="flex items-center gap-1" title="Volume of this song">
      Vol
      <input
        type="range"
        class="w-16"
        min="0"
        max="1"
        step="0.05"
        :value="track.gain"
        aria-label="Song volume"
        @change="emit('gain', valueOf($event))"
      />
    </label>
    <label class="flex items-center gap-1" title="Fade in, seconds">
      In
      <input
        type="number"
        class="num h-5 w-11 rounded-[3px] border border-white/20 bg-transparent px-1 text-xs text-white"
        min="0"
        max="10"
        step="0.5"
        :value="track.fadeInS"
        aria-label="Fade in seconds"
        @change="emit('fadeIn', valueOf($event))"
      />
    </label>
    <label class="flex items-center gap-1" title="Fade out, seconds">
      Out
      <input
        type="number"
        class="num h-5 w-11 rounded-[3px] border border-white/20 bg-transparent px-1 text-xs text-white"
        min="0"
        max="10"
        step="0.5"
        :value="track.fadeOutS"
        aria-label="Fade out seconds"
        @change="emit('fadeOut', valueOf($event))"
      />
    </label>
    <button
      class="chip-btn px-1.5"
      title="Play earlier"
      aria-label="Move song earlier"
      @click="emit('move', -1)"
    >
      <PhCaretLeft :size="12" weight="bold" />
    </button>
    <button
      class="chip-btn px-1.5"
      title="Play later"
      aria-label="Move song later"
      @click="emit('move', 1)"
    >
      <PhCaretRight :size="12" weight="bold" />
    </button>
    <button class="chip-btn text-chip-danger" @click="emit('remove')">
      <PhTrash :size="12" /> Remove
    </button>
  </div>
</template>
