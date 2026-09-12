<script setup lang="ts">
/** The hairline between two panels: drag it to resize, double-click to put it back. */
import type { PanelWidth } from '@renderer/composables/usePanelWidth';

defineProps<{ panel: PanelWidth }>();
</script>

<template>
  <div
    class="splitter"
    :class="{ 'is-dragging': panel.dragging.value }"
    title="Drag to resize · double-click to reset"
    @mousedown="panel.start"
    @dblclick="panel.reset"
  />
</template>
