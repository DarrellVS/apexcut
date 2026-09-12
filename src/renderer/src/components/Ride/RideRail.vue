<script setup lang="ts">
/**
 * The Ride rail (left): the numbers of the open video, then the outline of the whole ride — every
 * video with its parts underneath, in movie order. Click a part of any video to open it and go
 * there; drag a video's row to change the order of the movie.
 */
import { computed, ref } from 'vue';
import { PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue';
import { useRelink } from '@renderer/composables/useRelink';
import { useRideParts } from '@renderer/composables/useRideParts';
import { useDismiss } from '@renderer/composables/useDismiss';
import { useLibraryStore } from '@renderer/stores/library';
import { plural } from '@renderer/utils/format';
import ClipParts from './ClipParts.vue';
import ClipRow from './ClipRow.vue';
import PickyPopover from './PickyPopover.vue';
import RideNumbers from './RideNumbers.vue';

const emit = defineEmits<{ seek: [t: number]; play: [t: number]; pick: [kind: 'files' | 'dir'] }>();
const library = useLibraryStore();
const { relink } = useRelink();
const ride = useRideParts();

// ---- the outline: only the chevron folds and unfolds; the open video starts unfolded
const expanded = ref<Record<string, boolean>>(library.current ? { [library.current]: true } : {});
const isOpen = (stem: string): boolean => expanded.value[stem] ?? false;
const enabledOf = (stem: string): number => ride.partsOf(stem).filter((p) => p.enabled).length;

const menuFor = ref<string | null>(null);
const outline = ref<HTMLElement | null>(null);
useDismiss(outline, () => (menuFor.value = null));

// ---- drag to reorder videos (= the order of the movie)
const dragging = ref<string | null>(null);
const over = ref<string | null | 'end'>(null);
function onDragStart(e: DragEvent, stem: string): void {
  dragging.value = stem;
  e.dataTransfer?.setData('text/apexcut-stem', stem);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDrop(target: string | 'end'): void {
  if (dragging.value && dragging.value !== target) {
    library.move(dragging.value, target === 'end' ? null : target);
  }
  dragging.value = null;
  over.value = null;
}

const missing = computed(() => library.clips.filter((c) => !c.exists).length);
const totalParts = computed(() => library.analyzed.reduce((a, c) => a + (c.nEnabled ?? 0), 0));
</script>

<template>
  <aside
    class="panel flex min-h-0 flex-col"
    @dragend="
      dragging = null;
      over = null;
    "
  >
    <div class="panel-head justify-between gap-2">
      <span>Ride</span>
      <PickyPopover />
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <RideNumbers @play="emit('play', $event)" />

      <!-- the outline: every video, its parts underneath -->
      <div class="flex h-7 items-center justify-between px-2.5">
        <span class="label-caps">{{ plural(library.clips.length, 'video') }}</span>
        <span class="num text-[11px] text-fg3">{{ plural(totalParts, 'part') }} in the movie</span>
      </div>
      <div ref="outline" class="px-1.5 pb-1.5">
        <div
          v-for="c in library.clips"
          :key="c.stem"
          class="rounded-ctl"
          :class="{ 'opacity-40': dragging === c.stem }"
          @dragover.prevent="over = c.stem"
          @drop.prevent="onDrop(c.stem)"
        >
          <ClipRow
            :clip="c"
            :enabled="enabledOf(c.stem)"
            :open="isOpen(c.stem)"
            :menu-open="menuFor === c.stem"
            :drop-target="over === c.stem && !!dragging && dragging !== c.stem"
            @toggle="expanded[c.stem] = !isOpen(c.stem)"
            @menu="menuFor = $event ? c.stem : null"
            @dragstart="onDragStart($event, c.stem)"
          />
          <ClipParts
            v-if="isOpen(c.stem) && c.analyzed"
            :stem="c.stem"
            :parts="ride.partsOf(c.stem)"
            @seek="emit('seek', $event)"
            @play="emit('play', $event)"
          />
        </div>
        <div
          class="min-h-2"
          :class="{ 'border-t border-line2': over === 'end' && dragging }"
          @dragover.prevent="over = 'end'"
          @drop.prevent="onDrop('end')"
        />
      </div>
    </div>
    <div class="flex flex-col gap-1.5 border-t border-line p-1.5">
      <button
        v-if="missing > 1"
        class="btn btn-mini w-full text-danger"
        title="Pick the folder the files moved to; every missing video found there is fixed"
        @click="relink('dir')"
      >
        <PhMagnifyingGlass :size="13" /> {{ missing }} videos not found · Find their folder…
      </button>
      <div class="flex gap-1.5">
        <button class="btn flex-1" title="Add video files" @click="emit('pick', 'files')">
          <PhPlus :size="13" /> Videos
        </button>
        <button class="btn flex-1" title="Add a whole folder" @click="emit('pick', 'dir')">
          <PhPlus :size="13" /> Folder
        </button>
      </div>
    </div>
  </aside>
</template>
