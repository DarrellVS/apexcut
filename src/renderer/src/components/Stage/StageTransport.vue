<script setup lang="ts">
/** The transport over the video: previous part, play, next part, the clock, and Preview. */
import { PhPause, PhPlay, PhSkipBack, PhSkipForward } from '@phosphor-icons/vue';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { fmtTime } from '@renderer/utils/format';

defineProps<{ previewOn: boolean }>();
defineEmits<{
  seekPart: [dir: 1 | -1];
  togglePlay: [];
  togglePreview: [];
}>();
const editor = useEditorStore();
const jobs = useJobsStore();
</script>

<template>
  <!-- z-30: above the crop frame (z-20), which otherwise covers the buttons and swallows clicks -->
  <div class="chip absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 p-1">
    <button
      class="chip-btn w-8 justify-center"
      title="Previous part ["
      aria-label="Previous part"
      @click="$emit('seekPart', -1)"
    >
      <PhSkipBack :size="14" weight="fill" />
    </button>
    <button
      class="chip-btn w-9 justify-center bg-white text-black hover:bg-white/90"
      title="Play / pause (space)"
      :aria-label="editor.playing ? 'Pause' : 'Play'"
      @click="$emit('togglePlay')"
    >
      <PhPause v-if="editor.playing" :size="14" weight="fill" />
      <PhPlay v-else :size="14" weight="fill" />
    </button>
    <button
      class="chip-btn w-8 justify-center"
      title="Next part ]"
      aria-label="Next part"
      @click="$emit('seekPart', 1)"
    >
      <PhSkipForward :size="14" weight="fill" />
    </button>
    <span class="num min-w-[112px] px-2 text-center text-[13px] font-semibold">
      {{ fmtTime(editor.time, true) }}
      <span class="font-normal opacity-50">/ {{ fmtTime(editor.duration) }}</span>
    </span>
    <button
      class="chip-btn"
      :class="{ 'bg-white/15': previewOn }"
      :aria-pressed="previewOn"
      title="Play only the selected parts back to back"
      data-tour="preview"
      @click="$emit('togglePreview')"
    >
      Preview
    </button>
    <span v-if="jobs.exporting" class="px-2 text-xs opacity-60">exporting…</span>
  </div>
</template>
