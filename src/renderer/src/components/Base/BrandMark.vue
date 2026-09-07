<script setup lang="ts">
/** The app icon as inline SVG: the A of ApexCut with a racing line through its apex, on the brand gradient. */
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 512 512"
    class="flex-none"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id="apexcut-brand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--acc1)" />
        <stop offset="1" stop-color="var(--acc2)" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="112" fill="url(#apexcut-brand)" />
    <path
      d="M 120 404 L 256 108 L 392 404"
      fill="none"
      stroke="#fff"
      stroke-width="66"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M 186 318 C 214 318, 226 296, 256 296 C 286 296, 298 318, 326 318"
      fill="none"
      stroke="#1c1c28"
      stroke-width="30"
      stroke-linecap="round"
      opacity="0.92"
    />
  </svg>
</template>
