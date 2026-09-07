<script setup lang="ts">
/** Parts tab: amount slider, add part, scrollable list synced with the timeline selection, bring back. */
import { computed } from 'vue';
import { PhPlus } from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { AMOUNT_LEVELS, useEditorStore } from '@renderer/stores/editor';
import { fmtDuration, fmtTime } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const emit = defineEmits<{ seek: [t: number]; play: [t: number] }>();
const editor = useEditorStore();

const sorted = computed(() => [...editor.parts].sort((a, b) => a.start_s - b.start_s));
const colorOf = (p: Part): string =>
  ({
    bochten: 'var(--corner)',
    'accel/rem': 'var(--brake)',
    beide: 'var(--both)',
    handmatig: 'var(--manual)',
    samengeplakt: 'var(--manual)',
  })[reasonOf(p)];

function onAmount(e: Event): void {
  const idx = Number((e.target as HTMLInputElement).value);
  const before = editor.parts.length;
  editor
    .rescore({ threshold_pct: AMOUNT_LEVELS[idx] })
    .then(() => toast(`${editor.parts.length} parts (was ${before})`));
}
function addHere(): void {
  editor.addAt(editor.time);
  toast('Part added — drag the edges to fit');
}
function clickRow(p: Part, e: MouseEvent): void {
  editor.select(p.id, e.shiftKey || e.ctrlKey);
  emit('seek', p.start_s);
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="card">
      <div class="flex justify-between text-xs text-muted">
        <span>Fewer parts</span><span>More parts</span>
      </div>
      <input
        type="range"
        class="w-full"
        min="0"
        max="4"
        step="1"
        :value="editor.amountIndex"
        @change="onAmount"
      />
      <button class="btn mt-2 flex w-full items-center justify-center gap-1.5" @click="addHere">
        <PhPlus :size="14" /> Add part at {{ fmtTime(editor.time) }}
      </button>
    </div>
    <h4 class="label-caps m-0">
      {{ editor.enabledParts.length }} parts · movie {{ fmtDuration(editor.movieLength) }}
    </h4>
    <div class="flex flex-col gap-0.5">
      <div
        v-for="p in sorted"
        :key="p.id"
        class="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors hover:bg-s2"
        :class="[
          editor.selection.includes(p.id) ? 'border-sel bg-s2' : 'border-transparent',
          { 'opacity-45': !p.enabled },
        ]"
        @click="clickRow(p, $event)"
        @dblclick="emit('play', p.start_s)"
        @mouseenter="editor.hoverId = p.id"
        @mouseleave="editor.hoverId = null"
      >
        <input
          type="checkbox"
          class="m-0"
          :checked="p.enabled"
          @click.stop
          @change="editor.setEnabled([p], ($event.target as HTMLInputElement).checked)"
        />
        <span class="h-2 w-2 flex-none rounded-sm" :style="{ background: colorOf(p) }" />
        <span class="num">{{ fmtTime(p.start_s) }}</span>
        <span class="flex-1 truncate">{{ REASON_LABEL[reasonOf(p)] }}</span>
        <span class="text-muted">{{ fmtDuration(p.end_s - p.start_s) }}</span>
      </div>
    </div>
    <template v-if="editor.deletedAuto.length">
      <h4 class="label-caps m-0 mt-2">Deleted or merged</h4>
      <div
        v-for="a in editor.deletedAuto"
        :key="a.start_s"
        class="flex items-center gap-2 px-2 py-1.5 text-xs"
      >
        <span class="num text-muted">{{ fmtTime(a.start_s) }} – {{ fmtTime(a.end_s) }}</span>
        <span class="flex-1">{{ REASON_LABEL[a.reden] }}</span>
        <button
          class="btn btn-mini"
          @click="
            editor.restore(a);
            emit('play', a.start_s);
            toast('Part brought back');
          "
        >
          Bring back
        </button>
      </div>
    </template>
  </div>
</template>
