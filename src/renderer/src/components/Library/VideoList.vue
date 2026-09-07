<script setup lang="ts">
/** Left panel: the user's videos with status; click to open, drag to change the order in the movie. */
import { computed, ref } from 'vue';
import { PhDotsSixVertical, PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue';
import { useRelink } from '@renderer/composables/useRelink';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { fmtDuration, fmtTime, shortName } from '@renderer/utils/format';

defineEmits<{ pick: [kind: 'files' | 'dir'] }>();
const library = useLibraryStore();
const jobs = useJobsStore();
const { relink } = useRelink();
const missing = computed(() => library.clips.filter((c) => !c.exists).length);

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
</script>

<template>
  <aside
    class="glass flex min-h-0 flex-col gap-2 overflow-auto p-3"
    @dragend="
      dragging = null;
      over = null;
    "
  >
    <h4 class="label-caps m-0">
      Videos <span class="normal-case tracking-normal">· drag to reorder</span>
    </h4>
    <div
      v-for="c in library.clips"
      :key="c.stem"
      class="flex cursor-pointer items-center gap-2 rounded-[10px] border p-2 transition-colors hover:bg-s2"
      :class="[
        c.stem === library.current ? 'border-line bg-s2' : 'border-transparent',
        {
          'opacity-40': dragging === c.stem,
          'border-t-2 border-t-acc2': over === c.stem && dragging && dragging !== c.stem,
        },
      ]"
      :title="c.stem"
      draggable="true"
      @click="library.current = c.stem"
      @dragstart="onDragStart($event, c.stem)"
      @dragover.prevent="over = c.stem"
      @drop.prevent="onDrop(c.stem)"
    >
      <PhDotsSixVertical :size="14" class="flex-none cursor-grab text-muted" />
      <img
        v-if="c.proxyUrl"
        class="h-[54px] w-[54px] flex-none rounded-[10px] bg-black object-cover"
        :src="`apexcut://media/clip/${encodeURIComponent(c.stem)}/thumb.jpg`"
        alt=""
        draggable="false"
        @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
      />
      <div v-else class="h-[54px] w-[54px] flex-none rounded-[10px] bg-s3" />
      <div class="min-w-0">
        <b class="block truncate text-[13px]">{{ shortName(c.stem) }}</b>
        <span class="text-xs text-muted">
          <template v-if="c.durationS">{{ fmtTime(c.durationS) }} · </template>
          <template v-if="c.analyzed"
            >{{ c.nEnabled }}/{{ c.nParts }} parts · {{ fmtDuration(c.highlightS ?? 0) }}</template
          >
          <template v-else-if="jobs.analyzeJob">scanning…</template>
          <template v-else>not scanned yet</template>
        </span>
        <span v-if="!c.mp4 && c.exists" class="block text-xs text-play">original MP4 missing</span>
        <span
          v-if="!c.exists"
          class="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-play"
        >
          File not found
          <button
            class="btn btn-mini flex items-center gap-1 text-fg"
            title="Point ApexCut at the moved file; parts and scan are kept"
            @click.stop="relink('file', c.stem)"
          >
            <PhMagnifyingGlass :size="12" /> Find video…
          </button>
        </span>
      </div>
    </div>
    <div
      class="min-h-3 rounded-lg"
      :class="{ 'border-t-2 border-t-acc2': over === 'end' && dragging }"
      @dragover.prevent="over = 'end'"
      @drop.prevent="onDrop('end')"
    />
    <button
      v-if="missing > 1"
      class="mt-auto flex items-center justify-center gap-1.5 rounded-ctl border border-play/40 px-3 py-1.5 text-xs text-play hover:bg-s2"
      title="Pick the folder the files moved to; every missing video found there is fixed"
      @click="relink('dir')"
    >
      <PhMagnifyingGlass :size="13" /> {{ missing }} videos not found · Find their folder…
    </button>
    <div class="flex gap-1.5 pt-2" :class="{ 'mt-auto': missing <= 1 }">
      <button
        class="btn flex flex-1 items-center justify-center gap-1"
        @click="$emit('pick', 'files')"
      >
        <PhPlus :size="14" /> Videos
      </button>
      <button
        class="btn flex flex-1 items-center justify-center gap-1"
        @click="$emit('pick', 'dir')"
      >
        <PhPlus :size="14" /> Folder
      </button>
    </div>
    <p class="m-0 text-[11px] text-muted">
      Tip: drop MP4 files or a folder anywhere in the window.
    </p>
  </aside>
</template>
