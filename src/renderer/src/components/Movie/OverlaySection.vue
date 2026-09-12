<script setup lang="ts">
/** Riding data on the picture: off, one of the two styles, and where it sits. Per project. */
import { computed } from 'vue';
import {
  OVERLAY_CORNERS,
  OVERLAY_SIZES,
  OVERLAY_STYLES,
  type OverlayCorner,
  type OverlayStyle,
} from '@core/overlay';
import type { OverlaySpecDto } from '@shared/ipc';
import { useProjectsStore } from '@renderer/stores/projects';

const projects = useProjectsStore();
const overlay = computed<OverlaySpecDto | null>(() => projects.active?.overlay ?? null);

const STYLE_LABEL: Record<OverlayStyle, string> = {
  minimal: 'Lean angle',
  dashboard: 'Dashboard',
};
const STYLE_HINT: Record<OverlayStyle, string> = {
  minimal: 'A leaning bike and the angle in degrees',
  dashboard: 'Lean gauge with a needle plus a braking / acceleration bar',
};
const CORNER_LABEL: Record<OverlayCorner, string> = {
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  'top-left': 'Top left',
  'top-right': 'Top right',
};

function setOverlay(patch: Partial<OverlaySpecDto> | null): void {
  if (patch === null) {
    projects.setOverlay(null);
    return;
  }
  const cur = overlay.value ?? { style: 'minimal', corner: 'bottom-left', size: 'M' };
  projects.setOverlay({ ...cur, ...patch });
}
</script>

<template>
  <div>
    <div class="label-caps mb-2">Riding data on the picture</div>
    <div class="seg" role="radiogroup">
      <button class="seg-item" role="radio" :aria-checked="!overlay" @click="setOverlay(null)">
        Off
      </button>
      <button
        v-for="st in OVERLAY_STYLES"
        :key="st"
        class="seg-item"
        role="radio"
        :aria-checked="overlay?.style === st"
        :title="STYLE_HINT[st]"
        @click="setOverlay({ style: st })"
      >
        {{ STYLE_LABEL[st] }}
      </button>
    </div>
    <div v-if="overlay" class="mt-2 flex items-center gap-1.5 text-xs">
      <select
        class="input h-6 flex-1 text-xs"
        :value="overlay.corner"
        aria-label="Corner of the overlay"
        @change="
          setOverlay({ corner: ($event.target as HTMLSelectElement).value as OverlayCorner })
        "
      >
        <option v-for="c in OVERLAY_CORNERS" :key="c" :value="c">
          {{ CORNER_LABEL[c] }}
        </option>
      </select>
      <div class="seg" role="radiogroup" aria-label="Size">
        <button
          v-for="sz in OVERLAY_SIZES"
          :key="sz"
          class="seg-item px-2.5"
          role="radio"
          :aria-checked="overlay.size === sz"
          @click="setOverlay({ size: sz })"
        >
          {{ sz }}
        </button>
      </div>
    </div>
  </div>
</template>
