<script setup lang="ts">
/** Settings → Editing: how the timeline behaves while you edit. */
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="card flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        class="mt-1"
        :checked="settings.settings?.snapping ?? false"
        @change="settings.update({ snapping: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        <b class="block text-sm text-fg">Snap while dragging</b>
        <span class="text-xs text-muted">
          Part edges click onto the boundaries the scan found, quiet moments in the score, other
          parts and whole seconds. A thin blue line shows where it snapped. Hold <kbd>Alt</kbd> to
          get the opposite while dragging.
        </span>
      </span>
    </label>
  </div>
</template>
