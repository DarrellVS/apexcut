<script setup lang="ts">
/**
 * Colour: the movie's colours, or one part's own. Looks as one-click starting points (previewed on
 * a frame of the open video), fine-tuning sliders, reset, "copy to another movie", and a hint to
 * take the colours of another movie that has some. With exactly one part selected, a checkbox gives
 * that part its own colours (starting from the movie's) and everything below edits the part.
 */
import { computed, ref } from 'vue';
import {
  isNeutral,
  lookOf,
  NEUTRAL_GRADE,
  sanitizeGrade,
  type Grade,
  type GradeKey,
} from '@core/grade';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import GradeCopy from './GradeCopy.vue';
import GradeDonor from './GradeDonor.vue';
import GradeSliders from './GradeSliders.vue';
import LookTiles from './LookTiles.vue';

const editor = useEditorStore();
const projects = useProjectsStore();

/** the one selected part, when exactly one is selected */
const part = computed(() => (editor.selectedParts.length === 1 ? editor.selectedParts[0] : null));
/** editing the part's own colours (it has some) rather than the movie's */
const partMode = computed(() => !!part.value?.grade);
const movieGrade = computed<Grade>(() => projects.active?.grade ?? NEUTRAL_GRADE);
const grade = computed<Grade>(() => part.value?.grade ?? movieGrade.value);
const currentLook = computed(() => lookOf(grade.value));
const fineOpen = ref(!isNeutral(grade.value) && !currentLook.value);
const title = computed(() => (partMode.value ? 'Colour · this part' : 'Colour · the movie'));

// ---- writing: sliders update live (no undo step per pixel), commit on release
function apply(next: Grade, commit: boolean): void {
  const g = sanitizeGrade(next);
  if (partMode.value && part.value) {
    if (commit) editor.setGrade([part.value], g);
    else part.value.grade = g;
  } else {
    if (commit) projects.setGrade(isNeutral(g) ? null : g);
    else if (projects.active) projects.active.grade = g;
  }
}
function set(key: GradeKey, v: number, commit: boolean): void {
  apply({ ...grade.value, [key]: v }, commit);
}
/** the part gets its own colours (a copy of the movie's), or goes back to the movie's */
function toggleOwn(on: boolean): void {
  if (!part.value) return;
  editor.setGrade([part.value], on ? { ...movieGrade.value } : undefined);
  toast(on ? 'This part has its own colours now' : 'Back to the movie’s colours');
}
</script>

<template>
  <!-- data-keep-selection: clicking in here must not drop the part selected on the timeline -->
  <section data-keep-selection>
    <div class="mb-2 flex items-center justify-between">
      <div class="label-caps">{{ title }}</div>
      <button
        v-if="!isNeutral(grade)"
        class="btn btn-ghost btn-mini -my-1"
        title="Back to the recording's own colours"
        @click="apply(NEUTRAL_GRADE, true)"
      >
        Reset
      </button>
    </div>

    <!-- one part selected: its own colours or the movie's -->
    <label
      v-if="part"
      class="mb-2 flex cursor-pointer items-center gap-2 rounded-ctl border border-line bg-bg2 px-2 py-1.5 text-xs"
    >
      <input
        type="checkbox"
        class="m-0"
        :checked="partMode"
        @change="toggleOwn(($event.target as HTMLInputElement).checked)"
      />
      <span class="min-w-0 flex-1 truncate">
        Own colours for this part
        <span class="text-fg3">· starts from the movie’s</span>
      </span>
    </label>

    <GradeDonor :part-mode="partMode" :movie-grade="movieGrade" />

    <LookTiles :current-look-id="currentLook?.id ?? null" @pick="apply($event, true)" />
    <div v-if="!currentLook && !isNeutral(grade)" class="mt-1.5 text-[11px] text-fg3">
      Your own mix
    </div>

    <GradeSliders :grade="grade" :open="fineOpen" @set="set" @toggle="fineOpen = $event" />

    <GradeCopy :grade="grade" :part-mode="partMode" />
  </section>
</template>
