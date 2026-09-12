<script setup lang="ts">
/** The row under the lanes: what the colours mean, the movie so far, zoom, fit and the help note. */
import { computed } from 'vue';
import { PhQuestion } from '@phosphor-icons/vue';
import type { TimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtDuration, plural } from '@renderer/utils/format';

const props = defineProps<{ view: TimelineView }>();
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
    <span><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-fg align-[-1px]" />score</span>
    <span
      ><span
        class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-corner align-[-1px]"
      />leaning</span
    >
    <span
      ><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-brake align-[-1px]" />braking &amp;
      acceleration</span
    >
    <span
      ><span class="mr-1.5 inline-block w-3 border-t border-dashed border-fg3 align-[2px]" />“fun
      enough” line</span
    >
    <span class="flex-1" />
    <b class="font-semibold text-fg"
      >{{ plural(editor.enabledParts.length, 'part') }} · movie
      {{ fmtDuration(editor.movieLength) }}</b
    >
    <label class="flex items-center gap-1.5">
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
    <button class="btn btn-mini" @click="view.fit()">Fit</button>
    <button
      class="btn btn-ghost btn-mini px-1"
      title="click a block = select · shift+click = select more · drag the edges · scroll = zoom · shift+scroll = pan"
      aria-label="Timeline help: click a block to select, shift-click to select more, drag the edges, scroll to zoom, shift-scroll to pan"
    >
      <PhQuestion :size="13" />
    </button>
  </div>
</template>
