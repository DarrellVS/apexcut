<script setup lang="ts">
defineEmits<{ pick: [kind: 'files' | 'dir'] }>();
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <div
      class="grid h-16 w-16 place-items-center rounded-[18px] bg-gradient-to-br from-acc1 to-acc2 text-3xl font-extrabold text-white shadow-float"
    >
      A
    </div>
    <h1 class="m-0 text-[34px] font-bold text-fg">ApexCut</h1>
    <p class="m-0 max-w-[520px] text-base text-muted">
      Finds the fun parts of your helmet-cam videos — corners, acceleration, braking — and turns
      them into one movie.
    </p>
    <button class="btn btn-pri rounded-[14px] px-7 py-3.5 text-lg" @click="$emit('pick', 'files')">
      Choose your videos
    </button>
    <button class="btn btn-ghost" @click="$emit('pick', 'dir')">
      …or pick the whole memory card
    </button>
    <p class="m-0 text-xs text-muted">Your original files are never changed.</p>
  </div>
</template>
