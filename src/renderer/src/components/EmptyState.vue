<script setup lang="ts">
/** A project without videos yet: one primary action, a way back to all projects. */
import BrandMark from '@renderer/components/Base/BrandMark.vue';
import { PhSquaresFour } from '@phosphor-icons/vue';

defineProps<{ project: string }>();
defineEmits<{ pick: [kind: 'files' | 'dir']; home: [] }>();
</script>

<template>
  <div class="relative flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <button
      class="btn btn-ghost absolute top-1 left-1 flex items-center gap-1.5"
      @click="$emit('home')"
    >
      <PhSquaresFour :size="16" /> All projects
    </button>
    <BrandMark :size="64" />
    <h1 class="m-0 text-[34px] font-bold text-fg">{{ project || 'ApexCut' }}</h1>
    <p class="m-0 max-w-[520px] text-base text-muted">
      Add the videos of this ride. ApexCut finds the fun parts — corners, acceleration, braking —
      and turns them into one movie.
    </p>
    <button class="btn btn-pri rounded-[14px] px-7 py-3.5 text-lg" @click="$emit('pick', 'files')">
      Choose your videos
    </button>
    <button class="btn btn-ghost" @click="$emit('pick', 'dir')">
      …or pick the whole memory card
    </button>
    <p class="m-0 text-xs text-muted">
      You can also drop files here. Your original files are never changed.
    </p>
  </div>
</template>
