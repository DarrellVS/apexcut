<script setup lang="ts">
/** "How picky?" as a popover from the ride rail: preset, Fewer/More slider, pulls switch, add part. */
import { api } from '@renderer/api';
import { computed, ref } from 'vue';
import { PhCaretDown, PhPlus } from '@phosphor-icons/vue';
import { PRESET_IDS, PRESETS, presetOf, type PresetId } from '@core/presets';
import { AMOUNT_LEVELS, useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { fmtTime } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { useDismiss } from '@renderer/composables/useDismiss';

const editor = useEditorStore();
const library = useLibraryStore();
const projects = useProjectsStore();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

/** the project's preset, or Custom once the open video's sliders moved away from it */
const preset = computed<PresetId | 'custom'>(() => presetOf(editor.config));
const label = computed(() =>
  preset.value === 'custom' ? 'Custom' : PRESETS[preset.value as PresetId].label,
);
const applying = ref(false);
async function choosePreset(id: PresetId): Promise<void> {
  if (applying.value) return;
  applying.value = true;
  try {
    const before = editor.parts.length;
    await api.projects.setPreset(id);
    if (editor.stem) await editor.open(editor.stem);
    await Promise.all([library.refresh(), projects.refresh()]);
    toast(`${PRESETS[id].label}: ${editor.parts.length} parts in this video (was ${before})`);
  } finally {
    applying.value = false;
  }
}
function onAmount(e: Event): void {
  const idx = Number((e.target as HTMLInputElement).value);
  const before = editor.parts.length;
  editor
    .rescore({ threshold_pct: AMOUNT_LEVELS[idx] })
    .then(() => toast(`${editor.parts.length} parts (was ${before})`));
}
const pulls = computed(() => projects.active?.pulls ?? false);
const togglingPulls = ref(false);
async function togglePulls(on: boolean): Promise<void> {
  if (togglingPulls.value) return;
  togglingPulls.value = true;
  try {
    const before = editor.parts.length;
    await projects.setPulls(on);
    if (editor.stem) await editor.open(editor.stem);
    await Promise.all([library.refresh(), projects.refresh()]);
    toast(
      on
        ? `Pulls count too: ${editor.parts.length} parts in this video (was ${before})`
        : `Pulls left out: ${editor.parts.length} parts in this video (was ${before})`,
    );
  } finally {
    togglingPulls.value = false;
  }
}
function addHere(): void {
  editor.addAt(editor.time);
  open.value = false;
  toast('Part added — drag the edges to fit');
}
useDismiss(root, () => (open.value = false));
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="btn btn-mini"
      :class="{ 'bg-bg3': open }"
      title="How picky? Fewer or more parts, presets, pulls"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ label }} <PhCaretDown :size="10" weight="bold" class="text-fg3" />
    </button>
    <div v-if="open" class="popover absolute top-[calc(100%+4px)] left-0 z-30 w-[290px] p-3">
      <div class="label-caps mb-1.5">How picky?</div>
      <div class="seg" role="radiogroup">
        <button
          v-for="id in PRESET_IDS"
          :key="id"
          class="seg-item"
          role="radio"
          :aria-checked="preset === id"
          :title="PRESETS[id].hint"
          :disabled="applying"
          @click="choosePreset(id)"
        >
          {{ PRESETS[id].label }}
        </button>
      </div>
      <div class="mt-2.5 flex justify-between text-[11px] text-fg2">
        <span>Fewer parts</span><span>More parts</span>
      </div>
      <input
        type="range"
        class="w-full"
        min="0"
        max="4"
        step="1"
        :value="editor.amountIndex"
        aria-label="How many parts"
        @change="onAmount"
      />
      <label class="mt-2 flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="pulls"
          :disabled="togglingPulls"
          @change="togglePulls(($event.target as HTMLInputElement).checked)"
        />
        <span>
          <b class="block font-semibold text-fg">Count acceleration pulls too</b>
          <span class="text-fg2">
            Straight-line pulls: opening up for a few seconds and gaining real speed. Normally only
            braking and acceleration near a corner count.
          </span>
        </span>
      </label>
      <button class="btn mt-3 w-full" @click="addHere">
        <PhPlus :size="13" /> Add part at <span class="num">{{ fmtTime(editor.time) }}</span>
      </button>
    </div>
  </div>
</template>
