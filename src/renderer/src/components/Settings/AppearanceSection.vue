<script setup lang="ts">
/** Theme choice: follow Windows, light or dark. */
import type { Theme } from '@shared/ipc';
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();
const OPTIONS: { id: Theme; label: string; hint: string }[] = [
  { id: 'system', label: 'Follow Windows', hint: 'Switches with your system setting' },
  { id: 'light', label: 'Light', hint: 'Bright panels, dark text' },
  { id: 'dark', label: 'Dark', hint: 'Easy on the eyes in the evening' },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-[13px] text-fg2">
      Colours of the app. Your videos and the timeline data look the same in both.
    </p>
    <div class="grid grid-cols-3 gap-2.5">
      <button
        v-for="o in OPTIONS"
        :key="o.id"
        class="tile flex flex-col gap-1 p-2.5"
        :aria-pressed="settings.settings?.theme === o.id"
        @click="settings.update({ theme: o.id })"
      >
        <span class="mb-1 flex h-12 w-full overflow-hidden rounded-[3px] border border-line">
          <span class="flex-1" :class="o.id === 'dark' ? 'bg-swatch-dark' : 'bg-swatch-light'" />
          <span class="flex-1" :class="o.id === 'light' ? 'bg-swatch-light' : 'bg-swatch-dark'" />
        </span>
        <b class="text-[13px] font-semibold text-fg">{{ o.label }}</b>
        <span class="text-xs text-fg2">{{ o.hint }}</span>
      </button>
    </div>
  </div>
</template>
