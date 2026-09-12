<script setup lang="ts">
/**
 * What you can do to the selected parts, floating above them: play, leave out, star, join, delete.
 * It stays on one line and shifts sideways so it never leaves the lane.
 */
import { computed, ref } from 'vue';
import { PhStar } from '@phosphor-icons/vue';
import type { Part } from '@core/types';

const props = defineProps<{
  parts: Part[];
  /** where the middle of the selection sits in the lane, in px, and how wide the lane is */
  centre: number;
  laneW: number;
  /** the part after the selected one, when exactly one is selected */
  hasNext: boolean;
}>();
defineEmits<{
  play: [];
  toggle: [];
  star: [];
  join: [];
  joinNext: [];
  remove: [];
}>();

const root = ref<HTMLElement | null>(null);
const allOn = computed(() => props.parts.every((p) => p.enabled));
const allStarred = computed(() => props.parts.every((p) => p.starred));
/** centred above the selection but never outside the lane */
const left = computed(() => {
  const w = root.value?.offsetWidth ?? 320;
  return Math.max(w / 2 + 4, Math.min(props.laneW - w / 2 - 4, props.centre));
});
</script>

<template>
  <div
    ref="root"
    class="chip absolute top-2.5 z-[5] flex -translate-x-1/2 -translate-y-[115%] gap-0.5 p-0.5 whitespace-nowrap"
    :style="{ left: `${left}px` }"
    data-keep-selection
    @mousedown.stop
  >
    <button class="chip-btn" @click="$emit('play')">Play</button>
    <button
      class="chip-btn"
      :title="
        allOn
          ? 'Skip this part; it turns grey and is left out of the movie'
          : 'Put this part back in the movie'
      "
      @click="$emit('toggle')"
    >
      {{ allOn ? 'Leave out' : 'Put back in' }}
    </button>
    <button
      class="chip-btn"
      :title="
        allStarred
          ? 'Remove the star'
          : 'Star it: kept by automatic picks, exportable on its own (F)'
      "
      @click="$emit('star')"
    >
      <PhStar :size="12" :weight="allStarred ? 'fill' : 'regular'" />
      {{ allStarred ? 'Unstar' : 'Star' }}
    </button>
    <button
      v-if="parts.length > 1"
      class="chip-btn bg-white font-semibold text-black hover:bg-white/90"
      @click="$emit('join')"
    >
      Join
    </button>
    <button
      v-else-if="hasNext"
      class="chip-btn"
      title="Join with the next part (including the gap)"
      @click="$emit('joinNext')"
    >
      Join with next
    </button>
    <button class="chip-btn text-chip-danger" @click="$emit('remove')">Delete</button>
  </div>
</template>
