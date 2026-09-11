<script setup lang="ts">
/** Settings → Editing: how the timeline behaves while you edit, and defaults for new projects. */
import { TRANSITION_LABEL, TRANSITIONS } from '@shared/ipc';
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="card">
      <b class="block text-[13px] font-semibold text-fg">Transition for new projects</b>
      <span class="text-xs text-fg2">
        Each project keeps its own choice in the Movie tab; this is where new projects start.
      </span>
      <div class="seg mt-2" role="radiogroup">
        <button
          v-for="t in TRANSITIONS"
          :key="t"
          class="seg-item"
          role="radio"
          :aria-checked="(settings.settings?.defaultTransition ?? 'crossfade') === t"
          :title="TRANSITION_LABEL[t].hint"
          @click="settings.update({ defaultTransition: t })"
        >
          {{ TRANSITION_LABEL[t].label }}
        </button>
      </div>
    </div>
    <label class="card flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        class="mt-1"
        :checked="settings.settings?.snapping ?? false"
        @change="settings.update({ snapping: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        <b class="block text-[13px] font-semibold text-fg">Snap while dragging</b>
        <span class="text-xs text-fg2">
          Part edges click onto the boundaries the scan found, quiet moments in the score, other
          parts and whole seconds. A thin blue line shows where it snapped. Hold <kbd>Alt</kbd> to
          get the opposite while dragging.
        </span>
      </span>
    </label>
  </div>
</template>
