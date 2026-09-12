<script setup lang="ts">
/**
 * The movie itself: every part of every video, back to back, in the order it plays. Click one to
 * watch it, drag one to move it in the movie. This lane runs in movie time, so the music underneath
 * lines up with it exactly — unlike the parts lane, which runs in the open video's own time.
 */
import { computed, ref } from 'vue';
import { PhCircleHalf, PhStar } from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import { useMovieOrder, type MoviePart } from '@renderer/composables/useMovieOrder';
import { useMovieTime } from '@renderer/composables/useMovieTime';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { fmtDuration, shortName } from '@renderer/utils/format';

const emit = defineEmits<{ play: [stem: string, t: number] }>();
const editor = useEditorStore();
const library = useLibraryStore();
const movie = useMovieOrder();
const { movieTimeOf, laneLen } = useMovieTime();

const dragging = ref<string | null>(null);
const over = ref<string | 'end' | null>(null);

const pct = (s: number): number => (s / laneLen.value) * 100;
const playheadPct = computed(() => pct(movieTimeOf(editor.time)));
/** how much label fits: the lane is the whole movie, so short parts get very little */
const label = (p: MoviePart): 'none' | 'short' | 'full' => {
  const width = pct(p.lengthS);
  return width < 4 ? 'none' : width < 12 ? 'short' : 'full';
};
const cls = (p: MoviePart): string =>
  ({
    bochten: 'block block-corner',
    'accel/rem': 'block block-brake',
    beide: 'block block-both',
    handmatig: 'block block-manual',
    samengeplakt: 'block block-manual',
  })[reasonOf(p.part)];

function onDragStart(e: DragEvent, p: MoviePart): void {
  dragging.value = p.key;
  e.dataTransfer?.setData('text/apexcut-part', p.key);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
async function onDrop(target: string | 'end'): Promise<void> {
  const key = dragging.value;
  dragging.value = null;
  over.value = null;
  if (!key || key === target) return;
  await movie.move(key, target === 'end' ? null : target);
}
/** clicking a part opens its video and plays from there */
function go(p: MoviePart): void {
  editor.select(p.part.id);
  emit('play', p.stem, p.part.start_s);
}
</script>

<template>
  <div
    class="relative flex-1 bg-bg1"
    @dragend="
      dragging = null;
      over = null;
    "
    @dragover.prevent="over = 'end'"
    @drop.prevent="onDrop('end')"
  >
    <div
      v-for="p in movie.parts.value"
      :key="p.key"
      class="absolute top-2.5 bottom-2.5 z-[1] flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-block pr-2 pl-2 text-xs whitespace-nowrap text-fg [mask-image:linear-gradient(90deg,#000_calc(100%-10px),transparent)]"
      :class="[
        cls(p),
        {
          'opacity-40': dragging === p.key,
          'ring-1 ring-sel ring-inset':
            p.stem === editor.stem && editor.selection.includes(p.part.id),
          'border-l-4 border-l-sel': over === p.key && dragging && dragging !== p.key,
        },
      ]"
      :style="{ left: `${pct(p.offsetS)}%`, width: `${Math.max(0.3, pct(p.lengthS))}%` }"
      :title="`${shortName(p.stem)} · ${REASON_LABEL[reasonOf(p.part)]} · ${fmtDuration(p.lengthS)} — drag to move it in the movie`"
      data-keep-selection
      :data-movie-part="p.key"
      role="button"
      :aria-pressed="p.stem === editor.stem && editor.selection.includes(p.part.id)"
      draggable="true"
      @click="go(p)"
      @dragstart="onDragStart($event, p)"
      @dragover.prevent.stop="over = p.key"
      @drop.prevent.stop="onDrop(p.key)"
    >
      <template v-if="label(p) !== 'none'">
        <PhStar v-if="p.part.starred" :size="11" weight="fill" class="flex-none" />
        <b class="font-semibold">{{ shortName(p.stem) }}</b>
        <span v-if="label(p) === 'full'" class="truncate text-fg2">
          {{ REASON_LABEL[reasonOf(p.part)] }}
        </span>
        <span v-if="label(p) === 'full'" class="num flex-none text-fg2">
          {{ fmtDuration(p.lengthS) }}
        </span>
      </template>
      <PhCircleHalf
        v-if="p.part.grade"
        :size="9"
        weight="fill"
        class="absolute bottom-1 left-1.5 opacity-80"
        title="Has its own colours"
      />
    </div>
    <div
      class="pointer-events-none absolute inset-y-0 z-[3] w-px bg-play"
      :style="{ left: `${playheadPct}%` }"
    />
    <p
      v-if="!movie.parts.value.length"
      class="num absolute inset-0 grid place-items-center text-xs text-fg3"
    >
      Nothing in the movie yet — tick the parts you want in the Ride panel.
    </p>
    <div
      v-if="movie.custom.value"
      class="absolute right-2 bottom-1 z-[4] flex items-center gap-1.5 text-[11px] text-fg3"
    >
      <span>Your own order</span>
      <button
        class="btn btn-mini"
        title="Back to the order they were ridden in"
        @click="movie.reset()"
      >
        Reset
      </button>
    </div>
    <span v-if="library.analyzed.length" class="sr-only">{{ movie.parts.value.length }} parts</span>
  </div>
</template>
