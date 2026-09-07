<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';

const jobs = useJobsStore();
const library = useLibraryStore();
const progress = computed(() => jobs.analyzeJob?.progress ?? 0);
const done = computed(() => library.analyzed.length);
const storyIdx = ref(0);
const blips = ref<number[]>([]);
const STORIES = [
  'Reading your camera’s motion sensor…',
  'Looking for corners…',
  'Where did you open the throttle?',
  'Dropping the boring straight bits…',
];
const story = computed(() => {
  const m = jobs.analyzeJob?.message ?? '';
  if (/metadata/i.test(m)) return 'Reading the video…';
  if (/scor/i.test(m)) return 'Lining up corners and braking moments…';
  return STORIES[storyIdx.value % STORIES.length];
});
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  timer = setInterval(() => {
    storyIdx.value++;
    if (blips.value.length < 40 && Math.random() < 0.6)
      blips.value.push(Math.min(98, progress.value * 100 * Math.random()));
  }, 1400);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <h1 class="m-0 text-[30px] font-bold text-fg">Looking through your ride…</h1>
    <div
      class="relative h-[46px] w-[min(720px,80vw)] overflow-hidden rounded-xl border border-line bg-s2"
    >
      <div
        class="absolute inset-y-0 left-0 bg-gradient-to-r from-acc1/40 to-acc2/60 transition-[width] duration-500"
        :style="{ width: `${progress * 100}%` }"
      />
      <div
        v-for="b in blips"
        :key="b"
        class="absolute top-2 bottom-2 w-2 rounded bg-acc1"
        :style="{ left: `${b}%` }"
      />
    </div>
    <div class="min-h-7 text-lg text-fg">{{ story }}</div>
    <p class="m-0 text-xs text-muted">{{ done }} of {{ library.clips.length }} videos done</p>
  </div>
</template>
