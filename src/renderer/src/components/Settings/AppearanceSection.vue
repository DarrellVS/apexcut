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
    <p class="m-0 text-sm text-muted">
      Colours of the app. Your videos and the timeline data look the same in both.
    </p>
    <div class="grid grid-cols-3 gap-2.5">
      <button
        v-for="o in OPTIONS"
        :key="o.id"
        class="card flex flex-col gap-1 text-left transition-colors hover:bg-s3"
        :class="{ 'ring-2 ring-sel': settings.settings?.theme === o.id }"
        :aria-pressed="settings.settings?.theme === o.id"
        @click="settings.update({ theme: o.id })"
      >
        <span
          class="mb-1 h-14 w-full rounded-lg border border-line"
          :class="
            o.id === 'light'
              ? 'bg-swatch-light'
              : o.id === 'dark'
                ? 'bg-swatch-dark'
                : 'bg-gradient-to-r from-swatch-light to-swatch-dark'
          "
        />
        <b class="text-sm text-fg">{{ o.label }}</b>
        <span class="text-xs text-muted">{{ o.hint }}</span>
      </button>
    </div>
  </div>
</template>
