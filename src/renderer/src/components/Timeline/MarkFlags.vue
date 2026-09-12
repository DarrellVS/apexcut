<script setup lang="ts">
/**
 * The exact moments the rider marked: a flag on the parts lane where the two fingers went up. The
 * part around it says what is kept; this says where the mark itself was, so you can see whether the
 * part sits where you meant it.
 */
import { computed } from 'vue';
import { PhHandPeace } from '@phosphor-icons/vue';
import type { TimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtTime } from '@renderer/utils/format';

const props = defineProps<{ view: TimelineView }>();
defineEmits<{ seek: [t: number] }>();
const editor = useEditorStore();

const flags = computed(() =>
  editor.parts
    .filter((p) => p.marked && p.marked_at !== undefined)
    .map((p) => ({
      id: p.id,
      t: p.marked_at as number,
      left: props.view.xPct(p.marked_at as number),
    })),
);
</script>

<template>
  <div
    v-for="f in flags"
    :key="f.id"
    class="absolute top-0 z-[2] flex -translate-x-1/2 cursor-pointer flex-col items-center"
    :style="{ left: `${f.left}%` }"
    :title="`You marked this at ${fmtTime(f.t)}`"
    data-mark-flag
    data-keep-selection
    @click.stop="$emit('seek', f.t)"
  >
    <span
      class="flex h-4 items-center gap-1 rounded-b-[3px] bg-mark px-1 text-[10px] font-semibold text-white"
    >
      <PhHandPeace :size="10" weight="fill" />
    </span>
    <span class="h-2 w-px bg-mark" />
  </div>
</template>
