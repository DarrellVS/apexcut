<script setup lang="ts">
/** Left panel: the user's videos with status; click to open. */
import { PhPlus } from '@phosphor-icons/vue';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { fmtDuration, fmtTime, shortName } from '@renderer/utils/format';

defineEmits<{ pick: [kind: 'files' | 'dir'] }>();
const library = useLibraryStore();
const jobs = useJobsStore();
</script>

<template>
  <aside class="glass flex min-h-0 flex-col gap-2 overflow-auto p-3">
    <h4 class="label-caps m-0">Videos</h4>
    <div
      v-for="c in library.clips"
      :key="c.stem"
      class="flex cursor-pointer items-center gap-2.5 rounded-[10px] border p-2 transition-colors hover:bg-s2"
      :class="c.stem === library.current ? 'border-line bg-s2' : 'border-transparent'"
      :title="c.stem"
      @click="library.current = c.stem"
    >
      <img
        v-if="c.proxyUrl"
        class="h-[54px] w-[54px] flex-none rounded-[10px] bg-black object-cover"
        :src="`apexcut://media/clip/${encodeURIComponent(c.stem)}/thumb.jpg`"
        alt=""
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
        <span v-if="!c.mp4" class="block text-xs text-play">original MP4 missing</span>
        <span v-if="!c.exists" class="block text-xs text-play">file not found</span>
      </div>
    </div>
    <div class="mt-auto flex gap-1.5 pt-2">
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
  </aside>
</template>
