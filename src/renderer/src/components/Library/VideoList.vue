<script setup lang="ts">
/** Left panel: the user's videos with status; click to open, drag to change the order in the movie. */
import { computed, ref } from 'vue';
import { PhDotsSixVertical, PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue';
import { useRelink } from '@renderer/composables/useRelink';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { fmtDuration, fmtTime, shortName, plural } from '@renderer/utils/format';

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
    class="panel flex min-h-0 flex-col"
    @dragend="
      dragging = null;
      over = null;
    "
  >
    <div class="panel-head justify-between">
      <span>Videos</span>
      <span class="num font-normal tracking-normal normal-case text-fg3">
        {{ plural(library.clips.length, 'video') }}
      </span>
    </div>
    <div class="min-h-0 flex-1 overflow-auto p-1.5">
      <div
        v-for="c in library.clips"
        :key="c.stem"
        class="relative flex cursor-pointer items-center gap-2 rounded-ctl border border-transparent px-1.5 py-1.5 transition-colors hover:bg-bg3"
        :class="[
          c.stem === library.current ? 'border-line bg-bg2' : '',
          {
            'opacity-40': dragging === c.stem,
            'border-t-line2': over === c.stem && dragging && dragging !== c.stem,
          },
        ]"
        :title="c.stem"
        draggable="true"
        @click="library.current = c.stem"
        @dragstart="onDragStart($event, c.stem)"
        @dragover.prevent="over = c.stem"
        @drop.prevent="onDrop(c.stem)"
      >
        <PhDotsSixVertical :size="14" class="flex-none cursor-grab text-fg3" />
        <img
          v-if="c.proxyUrl"
          class="h-10 w-[71px] flex-none rounded-[3px] bg-black object-cover"
          :src="`apexcut://media/clip/${encodeURIComponent(c.stem)}/thumb.jpg`"
          alt=""
          draggable="false"
          @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
        />
        <div v-else class="h-10 w-[71px] flex-none rounded-[3px] bg-bg3" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <b class="truncate text-[13px] font-semibold">{{ shortName(c.stem) }}</b>
            <span v-if="c.durationS" class="num flex-none text-[11px] text-fg3">
              {{ fmtTime(c.durationS) }}
            </span>
          </div>
          <span class="num block truncate text-xs text-fg2">
            <template v-if="c.analyzed">
              {{ plural(c.nEnabled ?? 0, 'part') }} · {{ fmtDuration(c.highlightS ?? 0) }}
            </template>
            <template v-else-if="jobs.analyzeJob">scanning…</template>
            <template v-else>not scanned yet</template>
          </span>
          <span v-if="!c.mp4 && c.exists" class="block text-xs text-danger">
            original MP4 missing
          </span>
          <span
            v-if="!c.exists"
            class="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-danger"
          >
            File not found
            <button
              class="btn btn-mini"
              title="Point ApexCut at the moved file; parts and scan are kept"
              @click.stop="relink('file', c.stem)"
            >
              <PhMagnifyingGlass :size="12" /> Find…
            </button>
          </span>
        </div>
      </div>
      <div
        class="min-h-2"
        :class="{ 'border-t border-line2': over === 'end' && dragging }"
        @dragover.prevent="over = 'end'"
        @drop.prevent="onDrop('end')"
      />
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
        <button class="btn flex-1" title="Add video files" @click="$emit('pick', 'files')">
          <PhPlus :size="13" /> Videos
        </button>
        <button class="btn flex-1" title="Add a whole folder" @click="$emit('pick', 'dir')">
          <PhPlus :size="13" /> Folder
        </button>
      </div>
    </div>
  </aside>
</template>
