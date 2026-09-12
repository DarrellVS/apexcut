<script setup lang="ts">
/** The row under the lanes: what the colours mean, the movie so far, zoom, fit and the help note. */
import { computed } from 'vue';
import { PhQuestion } from '@phosphor-icons/vue';
import type { TimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtDuration, plural } from '@renderer/utils/format';

const props = defineProps<{ view: TimelineView; mode: 'video' | 'movie' }>();
defineEmits<{ mode: [mode: 'video' | 'movie'] }>();
const editor = useEditorStore();
const zoomInput = computed({
  get: () => props.view.zoom.value,
  set: (z: number) => props.view.setZoom(z, editor.time),
});
</script>

<template>
  <div
    class="num flex h-7 flex-none items-center gap-3.5 border-t border-line px-3 text-[11px] text-fg2"
  >
    <div class="seg" role="radiogroup" aria-label="What the lane shows">
      <button
        class="seg-item"
        role="radio"
        :aria-checked="mode === 'video'"
        title="This video, in its own time"
        @click="$emit('mode', 'video')"
      >
        This video
      </button>
      <button
        class="seg-item"
        role="radio"
        :aria-checked="mode === 'movie'"
        title="The movie: every part of every video, back to back"
        @click="$emit('mode', 'movie')"
      >
        The movie
      </button>
    </div>
    <template v-if="mode === 'video'">
      <span
        ><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-fg align-[-1px]" />score</span
      >
      <span
        ><span
          class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-corner align-[-1px]"
        />leaning</span
      >
      <span
        ><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-brake align-[-1px]" />braking
        &amp; acceleration</span
      >
      <span
        ><span class="mr-1.5 inline-block w-3 border-t border-dashed border-fg3 align-[2px]" />“fun
        enough” line</span
      >
      <span v-if="editor.marked" title="The spots you marked yourself, two fingers to the camera"
        ><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-mark align-[-1px]" />your own
        marks</span
      >
      <span v-if="editor.picture" title="What the picture itself voted for, on top of the sensor"
        ><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-picture align-[-1px]" />the
        picture</span
      >
    </template>
    <span v-else class="text-fg3">Drag a part to move it in the movie</span>
    <span class="flex-1" />
    <b class="font-semibold text-fg"
      >{{ plural(editor.enabledParts.length, 'part') }} · movie
      {{ fmtDuration(editor.movieLength) }}</b
    >
    <label v-if="mode === 'video'" class="flex items-center gap-1.5">
      Zoom
      <input
        v-model.number="zoomInput"
        type="range"
        min="0"
        max="0.98"
        step="0.01"
        class="w-[100px]"
        aria-label="Zoom"
      />
    </label>
    <button v-if="mode === 'video'" class="btn btn-mini" @click="view.fit()">Fit</button>
    <button
      class="btn btn-ghost btn-mini px-1"
      title="click a block = select · shift+click = select more · drag the edges · scroll = zoom · shift+scroll = pan"
      aria-label="Timeline help: click a block to select, shift-click to select more, drag the edges, scroll to zoom, shift-scroll to pan"
    >
      <PhQuestion :size="13" />
    </button>
  </div>
</template>
