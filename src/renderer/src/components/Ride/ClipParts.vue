<script setup lang="ts">
/**
 * The parts of one video, under its row: a checkbox for the movie, the colour of the reason, when
 * it happens, what it is and how long. Click one to go there, double-click to play it.
 */
import { nextTick } from 'vue';
import { PhCircleHalf, PhStar } from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { fmtDuration, fmtTime } from '@renderer/utils/format';

const props = defineProps<{ stem: string; parts: Part[] }>();
const emit = defineEmits<{ seek: [t: number]; play: [t: number] }>();
const editor = useEditorStore();
const library = useLibraryStore();

const colorOf = (p: Part): string =>
  ({
    bochten: 'var(--corner)',
    'accel/rem': 'var(--brake)',
    beide: 'var(--both)',
    handmatig: 'var(--manual)',
    samengeplakt: 'var(--manual)',
  })[reasonOf(p)];

/** open the part's video if needed, then select the part and go there */
async function goToPart(p: Part, e: MouseEvent, play = false): Promise<void> {
  if (library.current !== props.stem) {
    library.current = props.stem;
    // the editor sets its stem before the parts arrive: wait for the part itself
    await until(() => editor.stem === props.stem && editor.parts.some((x) => x.id === p.id));
    await nextTick();
  }
  const mine = editor.parts.find((x) => x.id === p.id);
  if (mine) editor.select(mine.id, e.shiftKey || e.ctrlKey);
  if (play) emit('play', p.start_s);
  else emit('seek', p.start_s);
}
function until(ok: () => boolean, ms = 4000): Promise<void> {
  return new Promise((res) => {
    if (ok()) return res();
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (ok() || Date.now() - t0 > ms) {
        clearInterval(iv);
        res();
      }
    }, 30);
  });
}
</script>

<template>
  <div class="mb-1.5 ml-[26px] border-l border-line">
    <div
      v-for="p in parts"
      :key="p.id"
      class="num ml-1.5 flex h-7 cursor-pointer items-center gap-1.5 rounded-ctl border border-transparent px-1.5 text-xs transition-colors hover:bg-bg3"
      :class="[
        stem === editor.stem && editor.selection.includes(p.id) ? 'border-line2 bg-bg2' : '',
        { 'opacity-45': !p.enabled },
      ]"
      data-keep-selection
      @click="goToPart(p, $event)"
      @dblclick="goToPart(p, $event, true)"
      @mouseenter="stem === editor.stem && (editor.hoverId = p.id)"
      @mouseleave="editor.hoverId = null"
    >
      <input
        v-if="stem === editor.stem"
        type="checkbox"
        class="m-0 h-3 w-3"
        :checked="p.enabled"
        :aria-label="`${REASON_LABEL[reasonOf(p)]} at ${fmtTime(p.start_s)} in the movie`"
        @click.stop
        @change="editor.setEnabled([p], ($event.target as HTMLInputElement).checked)"
      />
      <span v-else class="h-3 w-3 flex-none" />
      <span class="h-3 w-[3px] flex-none rounded-[1px]" :style="{ background: colorOf(p) }" />
      <span class="w-9 text-fg2">{{ fmtTime(p.start_s) }}</span>
      <span class="min-w-0 flex-1 truncate">{{ REASON_LABEL[reasonOf(p)] }}</span>
      <span class="text-fg2">{{ fmtDuration(p.end_s - p.start_s) }}</span>
      <PhCircleHalf
        v-if="p.grade"
        :size="11"
        weight="fill"
        class="flex-none text-fg2"
        title="Has its own colours"
      />
      <PhStar v-if="p.starred" :size="11" weight="fill" class="flex-none text-fg" />
    </div>
    <div v-if="!parts.length" class="ml-1.5 flex h-6 items-center px-1.5 text-xs text-fg3">
      no parts
    </div>
  </div>
</template>
