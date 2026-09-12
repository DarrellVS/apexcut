<script setup lang="ts">
/**
 * Colour: the movie's colours, or one part's own. Looks as one-click starting points (previewed
 * on a frame of the open video), fine-tuning sliders, reset, "copy to another movie", and a hint to
 * take the colours of another movie that has some. With exactly one part selected, a checkbox gives
 * that part its own colours (starting from the movie's) and everything below edits the part.
 */
import { computed, ref } from 'vue';
import { PhArrowSquareOut, PhCaretDown, PhCaretRight, PhCopy } from '@phosphor-icons/vue';
import {
  GRADE_CONTROLS,
  gradeEquals,
  isNeutral,
  LOOKS,
  lookOf,
  NEUTRAL_GRADE,
  sanitizeGrade,
  type Grade,
  type GradeKey,
} from '@core/grade';
import { useDismiss } from '@renderer/composables/useDismiss';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { gradeFilterMarkup } from '@renderer/utils/gradeSvg';
import { shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const editor = useEditorStore();
const library = useLibraryStore();
const projects = useProjectsStore();

/** the one selected part, when exactly one is selected */
const part = computed(() => (editor.selectedParts.length === 1 ? editor.selectedParts[0] : null));
/** editing the part's own colours (it has some) rather than the movie's */
const partMode = computed(() => !!part.value?.grade);
const movieGrade = computed<Grade>(() => projects.active?.grade ?? NEUTRAL_GRADE);
const grade = computed<Grade>(() => (partMode.value ? part.value!.grade! : movieGrade.value));
const currentLook = computed(() => lookOf(grade.value));
const fineOpen = ref(!isNeutral(grade.value) && !currentLook.value);

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
function chooseLook(g: Grade): void {
  apply(g, true);
}
function reset(): void {
  apply(NEUTRAL_GRADE, true);
}
/** the part gets its own colours (a copy of the movie's), or goes back to the movie's */
function toggleOwn(on: boolean): void {
  if (!part.value) return;
  editor.setGrade([part.value], on ? { ...movieGrade.value } : undefined);
  toast(on ? 'This part has its own colours now' : 'Back to the movie’s colours');
}

// ---- other movies: take theirs, or give them ours
const others = computed(() =>
  projects.projects.filter((p) => p.id !== projects.activeId && !p.archived),
);
const donor = computed(() =>
  !partMode.value && isNeutral(movieGrade.value)
    ? (others.value.find((p) => p.grade && !isNeutral(p.grade)) ?? null)
    : null,
);
async function takeFrom(id: string): Promise<void> {
  const p = projects.projects.find((x) => x.id === id);
  if (!p?.grade) return;
  await projects.setGrade({ ...p.grade });
  toast(`Colours of “${p.name}” copied to this movie`);
}
const copyOpen = ref(false);
const copyRoot = ref<HTMLElement | null>(null);
useDismiss(copyRoot, () => (copyOpen.value = false));
async function copyTo(id: string): Promise<void> {
  copyOpen.value = false;
  const p = projects.projects.find((x) => x.id === id);
  await projects.setGrade({ ...grade.value }, id);
  toast(`Colours copied to “${p?.name ?? 'the other movie'}”`);
}
/** the movie's colours onto every part that has its own */
function applyToOwnParts(): void {
  const own = editor.parts.filter((p) => p.grade);
  if (!own.length) return;
  editor.setGrade(own, undefined);
  toast(`${own.length} part${own.length === 1 ? '' : 's'} back on the movie’s colours`);
}
const ownParts = computed(() => editor.parts.filter((p) => p.grade).length);

// ---- look tiles preview on a frame of the open video
const thumb = computed(() => {
  // only a scanned video has a thumbnail; an unscanned one would show broken images
  const c = library.currentClip;
  return c?.analyzed ? `apexcut://media/clip/${encodeURIComponent(c.stem)}/thumb.jpg` : null;
});
const lookFilters = computed(() =>
  LOOKS.map((l) => ({ id: l.id, markup: gradeFilterMarkup(l.grade) })),
);
const title = computed(() =>
  partMode.value && part.value ? `Colour · this part` : 'Colour · the movie',
);
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
        @click="reset"
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

    <!-- another movie has colours and this one has none: take them -->
    <button
      v-if="donor"
      class="mb-2 flex w-full items-center gap-2 rounded-ctl border border-dashed border-line2 px-2 py-1.5 text-left text-xs hover:bg-bg3"
      @click="takeFrom(donor.id)"
    >
      <PhArrowSquareOut :size="13" class="flex-none text-fg2" />
      <span class="min-w-0 flex-1 truncate">
        “{{ donor.name }}” has colours · <b class="font-semibold">use them here</b>
      </span>
    </button>

    <!-- looks: the same frame, each with a look on it -->
    <!-- eslint-disable vue/no-v-html -- the markup is built from numbers only (gradeSvg.ts) -->
    <svg class="absolute h-0 w-0" aria-hidden="true">
      <filter
        v-for="f in lookFilters"
        :id="`apexcut-look-${f.id}`"
        :key="f.id"
        color-interpolation-filters="sRGB"
        v-html="f.markup"
      />
    </svg>
    <!-- eslint-enable vue/no-v-html -->
    <div class="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Look">
      <button
        v-for="l in LOOKS"
        :key="l.id"
        class="tile flex flex-col gap-1 p-1 text-center"
        :title="l.hint"
        role="radio"
        :aria-checked="currentLook?.id === l.id"
        @click="chooseLook(l.grade)"
      >
        <span class="block aspect-video w-full overflow-hidden rounded-[2px] bg-bg3">
          <img
            v-if="thumb"
            :src="thumb"
            alt=""
            class="h-full w-full object-cover"
            :style="l.id === 'none' ? {} : { filter: `url(#apexcut-look-${l.id})` }"
            @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
          />
        </span>
        <span class="truncate text-[11px] leading-tight" :title="l.label">{{ l.label }}</span>
      </button>
    </div>
    <div v-if="!currentLook && !isNeutral(grade)" class="mt-1.5 text-[11px] text-fg3">
      Your own mix
    </div>

    <!-- fine-tuning -->
    <details
      class="group mt-2"
      :open="fineOpen"
      @toggle="fineOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary
        class="flex h-7 cursor-pointer list-none items-center gap-1 text-xs text-fg2 select-none hover:text-fg"
      >
        <PhCaretRight :size="10" weight="bold" class="transition-transform group-open:rotate-90" />
        Fine-tune
      </summary>
      <div class="mt-1 flex flex-col gap-1.5">
        <label
          v-for="c in GRADE_CONTROLS"
          :key="c.key"
          class="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs"
          :title="c.hint"
        >
          <span class="truncate text-fg2">{{ c.label }}</span>
          <input
            type="range"
            class="w-full"
            :min="c.min"
            :max="c.max"
            :step="c.step"
            :value="grade[c.key]"
            :aria-label="c.label"
            @input="set(c.key, Number(($event.target as HTMLInputElement).value), false)"
            @change="set(c.key, Number(($event.target as HTMLInputElement).value), true)"
            @dblclick="set(c.key, 0, true)"
          />
          <span class="num text-right" :class="grade[c.key] ? 'text-fg' : 'text-fg3'">
            {{ c.fmt(grade[c.key]) }}
          </span>
        </label>
        <div class="text-[11px] text-fg3">Double-click a slider to put it back to 0.</div>
      </div>
    </details>

    <!-- across movies and parts -->
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <div v-if="others.length && !isNeutral(grade)" ref="copyRoot" class="relative">
        <button class="btn btn-mini" :aria-expanded="copyOpen" @click="copyOpen = !copyOpen">
          <PhCopy :size="12" /> Copy to another movie <PhCaretDown :size="9" weight="bold" />
        </button>
        <div
          v-if="copyOpen"
          class="popover absolute bottom-[calc(100%+4px)] left-0 z-30 min-w-[220px] p-1"
        >
          <button v-for="p in others" :key="p.id" class="menu-item" @click="copyTo(p.id)">
            <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
            <span v-if="p.grade && !isNeutral(p.grade)" class="text-[11px] text-fg3">
              {{ gradeEquals(p.grade, grade) ? 'same' : 'has colours' }}
            </span>
          </button>
        </div>
      </div>
      <button
        v-if="!partMode && ownParts"
        class="btn btn-ghost btn-mini"
        :title="`${ownParts} part${ownParts === 1 ? ' has' : 's have'} their own colours in ${library.current ? shortName(library.current) : 'this video'}`"
        @click="applyToOwnParts"
      >
        {{ ownParts }} part{{ ownParts === 1 ? '' : 's' }} with own colours · use the movie’s
      </button>
    </div>
  </section>
</template>
