<script setup lang="ts">
/**
 * One part on the timeline: a coloured block with a stripe in its reason's colour, as much label as
 * fits, a star and a half-circle for parts with their own colours, an eye and a line along the
 * bottom for the ones the picture voted in, and a grip on each edge.
 */
import { computed } from 'vue';
import { PhCircleHalf, PhEye, PhHandPeace, PhStar } from '@phosphor-icons/vue';
import { PICTURE_REASON_LABEL } from '@core/picture';
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
const reason = computed(() =>
  props.part.marked ? 'You marked this' : REASON_LABEL[reasonOf(props.part)],
);
/** why the picture voted this part in, in words, for the tooltip and the label under the bar */
const pictureWhy = computed(() =>
  props.part.picture
    ? `In the movie for what it looks like: ${PICTURE_REASON_LABEL[props.part.picture_why ?? 'light']}`
    : '',
);
</script>

<template>
  <div
    class="absolute top-2.5 bottom-2.5 z-[1] flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-block pr-2 pl-2 text-xs whitespace-nowrap text-fg"
    :class="[
      cls,
      {
        'opacity-45 [border-left-style:dashed]': !part.enabled,
        'ring-1 ring-sel ring-inset': selected,
        // the rider marked this one themselves: it shouts
        'ring-2 ring-mark ring-inset !border-l-mark': part.marked,
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
    :aria-label="`${reason}, ${fmtTime(part.start_s)} to ${fmtTime(part.end_s)}${part.enabled ? '' : ', left out'}${part.picture ? `, found in the picture: ${PICTURE_REASON_LABEL[part.picture_why ?? 'light']}` : ''}`"
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
      <PhHandPeace v-if="part.marked" :size="12" weight="fill" class="flex-none text-mark" />
      <PhStar v-if="part.starred" :size="11" weight="fill" class="flex-none" />
      <b class="font-semibold">{{ reason }}</b>
      <span v-if="label === 'full'" class="num text-fg2">
        {{ fmtDuration(part.end_s - part.start_s) }}
      </span>
    </template>
    <PhHandPeace
      v-else-if="part.marked"
      :size="11"
      weight="fill"
      class="absolute top-1 right-1 text-mark"
    />
    <PhStar v-else-if="part.starred" :size="9" weight="fill" class="absolute top-1 right-1" />
    <!-- the picture put this one in: a line along the bottom, readable at any width -->
    <div
      v-if="part.picture"
      class="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-picture"
      :title="pictureWhy"
    />
    <PhEye
      v-if="part.picture"
      :size="9"
      weight="fill"
      class="absolute right-3 bottom-1 text-picture"
      :title="pictureWhy"
    />
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
