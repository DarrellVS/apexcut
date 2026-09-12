<script setup lang="ts">
/** "How picky?" as a popover from the ride rail: preset, Fewer/More slider, pulls switch, add part. */
import { api } from '@renderer/api';
import { computed, ref } from 'vue';
import { PhCaretDown, PhPlus } from '@phosphor-icons/vue';
import { PRESET_IDS, PRESETS, presetOf, type PresetId } from '@core/presets';
import { AMOUNT_LEVELS, useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { fmtTime, plural } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { usePopover } from '@renderer/composables/usePopover';

const editor = useEditorStore();
const jobs = useJobsStore();
const library = useLibraryStore();
const projects = useProjectsStore();
const picky = usePopover();

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
const picture = computed(() => projects.active?.picture ?? false);
const looking = ref(false);
/**
 * The picture vote. Switching it on has to look at every scanned video once, so this waits for that
 * job before it reads the new parts back.
 */
async function togglePicture(on: boolean): Promise<void> {
  if (looking.value) return;
  looking.value = true;
  try {
    const before = editor.parts.length;
    const jobId = await projects.setPicture(on);
    if (jobId) {
      toast('Looking at the picture of every video…');
      await jobs.finished(jobId);
    }
    if (editor.stem) await editor.open(editor.stem);
    await Promise.all([library.refresh(), projects.refresh()]);
    toast(
      on
        ? `The picture votes too: ${editor.parts.length} parts in this video (was ${before})`
        : `Only the motion counts: ${editor.parts.length} parts in this video (was ${before})`,
    );
  } finally {
    looking.value = false;
  }
}
const gestures = computed(() => projects.active?.gestures ?? false);
const looking2 = ref(false);
/** the rider's own marks: two fingers to the camera while riding */
async function toggleGestures(on: boolean): Promise<void> {
  if (looking2.value) return;
  looking2.value = true;
  try {
    const jobId = await projects.setGestures(on);
    if (jobId) {
      toast('Looking through your videos for your marks…');
      const job = await jobs.finished(jobId);
      const found = job.result?.kind === 'gesture' ? job.result.marks : 0;
      toast(found ? `${plural(found, 'mark')} found` : 'No marks found in these videos');
    } else if (!on) {
      toast('Your marks are out of the movie again');
    }
    if (editor.stem) await editor.open(editor.stem);
    await Promise.all([library.refresh(), projects.refresh()]);
  } finally {
    looking2.value = false;
  }
}
function addHere(): void {
  editor.addAt(editor.time);
  picky.close();
  toast('Part added — drag the edges to fit');
}
</script>

<template>
  <div ref="picky.root" class="relative">
    <button
      class="btn btn-mini"
      :class="{ 'bg-bg3': picky.open.value }"
      title="How picky? Fewer or more parts, presets, pulls"
      :aria-expanded="picky.open.value"
      @click="picky.toggle()"
    >
      {{ label }} <PhCaretDown :size="10" weight="bold" class="text-fg3" />
    </button>
    <div
      v-if="picky.open.value"
      class="popover absolute top-[calc(100%+4px)] left-0 z-30 w-[290px] p-3"
    >
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
      <label class="mt-2 flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="picture"
          :disabled="looking"
          @change="togglePicture(($event.target as HTMLInputElement).checked)"
        />
        <span>
          <b class="block font-semibold text-fg">Let the picture vote too</b>
          <span class="text-fg2">
            Looks at the recording as well as the sensor: tunnels and underpasses, light changing
            fast, evening sun, a road full of traffic. It only adds moments, never takes any away.
            Takes about ten seconds per video the first time.
          </span>
        </span>
      </label>
      <label class="mt-2 flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="gestures"
          :disabled="looking2"
          @change="toggleGestures(($event.target as HTMLInputElement).checked)"
        />
        <span>
          <b class="block font-semibold text-fg">Keep the bits I pointed at</b>
          <span class="text-fg2">
            Hold two fingers up to the camera for about a second while you ride, and that spot is
            kept — the ten seconds before your hand went up. Your marks stand out on the timeline.
          </span>
        </span>
      </label>
      <button class="btn mt-3 w-full" @click="addHere">
        <PhPlus :size="13" /> Add part at <span class="num">{{ fmtTime(editor.time) }}</span>
      </button>
    </div>
  </div>
</template>
