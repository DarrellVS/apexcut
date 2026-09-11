<script setup lang="ts">
/**
 * The mark as inline SVG: the A of ApexCut with a racing line through its apex. Flat, in the text
 * colour, so it sits in the chrome like an icon. `tone` = 'ink' draws it on a filled square.
 */
withDefaults(defineProps<{ size?: number; tone?: 'flat' | 'ink' }>(), {
  size: 16,
  tone: 'flat',
});
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
    <rect v-if="tone === 'ink'" width="512" height="512" rx="96" fill="var(--ink)" />
    <path
      d="M 96 420 L 256 92 L 416 420"
      fill="none"
      :stroke="tone === 'ink' ? 'var(--ink-fg)' : 'currentColor'"
      stroke-width="58"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M 176 326 C 208 326, 222 300, 256 300 C 290 300, 304 326, 336 326"
      fill="none"
      :stroke="tone === 'ink' ? 'var(--ink)' : 'var(--bg1)'"
      stroke-width="34"
      stroke-linecap="round"
    />
  </svg>
</template>
