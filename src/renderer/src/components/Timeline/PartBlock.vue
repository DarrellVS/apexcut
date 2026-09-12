<script setup lang="ts">
/**
 * One part on the timeline: a coloured block with a stripe in its reason's colour, as much label as
 * fits, a star and a half-circle for parts with their own colours, and a grip on each edge.
 */
import { computed } from 'vue';
import { PhCircleHalf, PhStar } from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import type { TimelineView } from '@renderer/composables/useTimelineView';
import { fmtDuration, fmtTime } from '@renderer/utils/format';

const props = defineProps<{
  part: Part;
  view: TimelineView;
  /** width of the parts lane in px, which decides how much label fits */
  laneW: number;
  selected: boolean;
}>();
defineEmits<{
  select: [e: MouseEvent];
  play: [t: number];
  keys: [e: KeyboardEvent];
  hover: [id: string | null];
  dragEdge: [e: MouseEvent, edge: 'start_s' | 'end_s'];
}>();

/** block look per reason: a solid stripe on the left edge, a tint of the same colour as the fill */
const cls = computed(
  () =>
    ({
      bochten: 'block block-corner',
      'accel/rem': 'block block-brake',
      beide: 'block block-both',
      handmatig: 'block block-manual',
      samengeplakt: 'block block-manual',
    })[reasonOf(props.part)],
);
/** what fits: nothing under 44 px, the reason under 120 px, reason + length above */
const label = computed<'none' | 'short' | 'full'>(() => {
  const p = props.part;
  const px = ((props.view.xPct(p.end_s) - props.view.xPct(p.start_s)) / 100) * props.laneW;
  return px < 44 ? 'none' : px < 120 ? 'short' : 'full';
});
const reason = computed(() => REASON_LABEL[reasonOf(props.part)]);
</script>

<template>
  <div
    class="absolute top-2.5 bottom-2.5 z-[1] flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-block pr-2 pl-2 text-xs whitespace-nowrap text-fg [mask-image:linear-gradient(90deg,#000_calc(100%-10px),transparent)]"
    :class="[
      cls,
      {
        'opacity-45 [border-left-style:dashed]': !part.enabled,
        'ring-1 ring-sel ring-inset': selected,
      },
    ]"
    :style="{
      left: `${view.xPct(part.start_s)}%`,
      width: `${Math.max(0.2, view.xPct(part.end_s) - view.xPct(part.start_s))}%`,
    }"
    data-keep-selection
    :data-part="part.id"
    tabindex="0"
    role="button"
    :aria-label="`${reason}, ${fmtTime(part.start_s)} to ${fmtTime(part.end_s)}${part.enabled ? '' : ', left out'}`"
    :aria-pressed="selected"
    @mousedown.stop="$emit('select', $event)"
    @dblclick="$emit('play', part.start_s)"
    @focus="$emit('select', $event as unknown as MouseEvent)"
    @keydown="$emit('keys', $event)"
    @mouseenter="$emit('hover', part.id)"
    @mouseleave="$emit('hover', null)"
  >
    <div
      class="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize"
      @mousedown.stop="$emit('dragEdge', $event, 'start_s')"
    />
    <template v-if="label !== 'none'">
      <PhStar v-if="part.starred" :size="11" weight="fill" class="flex-none" />
      <b class="font-semibold">{{ reason }}</b>
      <span v-if="label === 'full'" class="num text-fg2">
        {{ fmtDuration(part.end_s - part.start_s) }}
      </span>
    </template>
    <PhStar v-else-if="part.starred" :size="9" weight="fill" class="absolute top-1 right-1" />
    <!-- own colours: always shown, whatever the width -->
    <PhCircleHalf
      v-if="part.grade"
      :size="9"
      weight="fill"
      class="absolute bottom-1 left-1.5 opacity-80"
      title="Has its own colours"
    />
    <div
      class="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize before:absolute before:top-[30%] before:right-[3px] before:bottom-[30%] before:w-px before:bg-fg/40 before:content-['']"
      @mousedown.stop="$emit('dragEdge', $event, 'end_s')"
    />
  </div>
</template>
