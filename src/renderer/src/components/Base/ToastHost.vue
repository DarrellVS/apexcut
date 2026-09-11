<script lang="ts">
import { ref } from 'vue';

const message = ref('');
let timer: ReturnType<typeof setTimeout> | null = null;

/** Show a short, non-blocking message. Importable from anywhere in the renderer. */
export function toast(text: string, ms = 3000): void {
  message.value = text;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => (message.value = ''), ms);
}
</script>

<script setup lang="ts">
const msg = message;
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    leave-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="msg"
      class="popover pointer-events-none fixed top-[calc(var(--titlebar-h)+12px)] left-1/2 z-50 max-w-[560px] -translate-x-1/2 px-3.5 py-2 text-[13px] text-fg"
      role="status"
    >
      {{ msg }}
    </div>
  </Transition>
</template>
