<script setup lang="ts">
/** Full-screen scan progress: what is happening, how far, and which videos are done. */
import { computed } from 'vue';
import { PhCheck } from '@phosphor-icons/vue';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { shortName } from '@renderer/utils/format';

const jobs = useJobsStore();
const library = useLibraryStore();
const progress = computed(() => jobs.analyzeJob?.progress ?? 0);
const done = computed(() => library.analyzed.length);
const stage = computed(() => {
  const m = jobs.analyzeJob?.message ?? '';
  if (/metadata/i.test(m)) return 'Reading the recording';
  if (/scor/i.test(m)) return 'Finding corners and braking';
  if (/thumb|film/i.test(m)) return 'Making thumbnails';
  return m || 'Reading the motion data';
});
const pct = computed(() => Math.round(progress.value * 100));
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center p-8">
    <div class="w-full max-w-[520px]">
      <div class="flex items-baseline justify-between">
        <h1 class="m-0 text-lg font-semibold text-fg">Scanning your ride</h1>
        <span class="num text-2xl font-semibold text-fg">{{ pct }}%</span>
      </div>
      <div class="mt-3 h-1 w-full overflow-hidden rounded-full bg-bg3">
        <div class="h-full bg-ink transition-[width] duration-500" :style="{ width: `${pct}%` }" />
      </div>
      <div class="num mt-2 flex justify-between text-xs text-fg2">
        <span>{{ stage }}…</span>
        <span>{{ done }} of {{ library.clips.length }} videos done</span>
      </div>
      <ul class="m-0 mt-6 max-h-[40vh] list-none overflow-auto p-0 text-[13px]">
        <li
          v-for="c in library.clips"
          :key="c.stem"
          class="flex h-7 items-center gap-2 border-b border-line last:border-b-0"
        >
          <PhCheck v-if="c.analyzed" :size="13" class="flex-none text-fg2" />
          <span
            v-else
            class="h-1.5 w-1.5 flex-none rounded-full"
            :class="jobs.analyzeJob ? 'animate-pulse bg-fg2' : 'bg-fg3'"
          />
          <span :class="c.analyzed ? 'text-fg' : 'text-fg2'">{{ shortName(c.stem) }}</span>
          <span v-if="c.analyzed" class="num ml-auto text-xs text-fg3">
            {{ c.nEnabled ?? 0 }} parts
          </span>
        </li>
      </ul>
      <p class="m-0 mt-4 text-xs text-fg3">
        Only the camera’s motion data is read; your video files are not changed.
      </p>
    </div>
  </div>
</template>
