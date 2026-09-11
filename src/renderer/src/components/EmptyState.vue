<script setup lang="ts">
/** A project without videos yet: a drop zone with one primary action, a way back to all projects. */
import { PhFilmSlate, PhSquaresFour } from '@phosphor-icons/vue';

defineProps<{ project: string }>();
defineEmits<{ pick: [kind: 'files' | 'dir']; home: [] }>();
</script>

<template>
  <div class="relative flex flex-1 flex-col items-center justify-center p-8">
    <button class="btn btn-ghost absolute top-3 left-3" @click="$emit('home')">
      <PhSquaresFour :size="15" /> All projects
    </button>
    <div
      class="flex w-full max-w-[560px] flex-col items-center gap-3 rounded-card border border-dashed border-line2 bg-bg1 px-8 py-12 text-center"
    >
      <PhFilmSlate :size="28" class="text-fg3" />
      <h1 class="m-0 text-lg font-semibold text-fg">{{ project || 'ApexCut' }}</h1>
      <p class="m-0 max-w-[400px] text-[13px] text-fg2">
        Add the videos of this ride. ApexCut finds the corners, braking and acceleration and puts
        them together as one movie.
      </p>
      <div class="mt-3 flex gap-2">
        <button class="btn btn-pri" @click="$emit('pick', 'files')">Choose videos…</button>
        <button class="btn" @click="$emit('pick', 'dir')">Whole memory card…</button>
      </div>
      <p class="m-0 mt-2 text-xs text-fg3">
        Or drop files here. Your original files are never changed.
      </p>
    </div>
  </div>
</template>
