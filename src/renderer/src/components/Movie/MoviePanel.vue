<script setup lang="ts">
/**
 * The Movie panel (right, always visible): what the movie is made of, its name, one movie or
 * separate clips, the format, the colours, how the parts are joined, the riding data on the
 * picture, the button that makes it and what came out. The thinking behind the export lives in
 * `composables/useMovieExport.ts`; the sections are their own components.
 */
import { computed } from 'vue';
import { TRANSITION_LABEL, TRANSITIONS } from '@shared/ipc';
import { useMovieExport } from '@renderer/composables/useMovieExport';
import { useFraming } from '@renderer/composables/useFraming';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { plural, shortName } from '@renderer/utils/format';
import ColourSection from './ColourSection.vue';
import ExportResultCard from './ExportResultCard.vue';
import FormatSection from './FormatSection.vue';
import OverlaySection from './OverlaySection.vue';
import PlatformPresets from './PlatformPresets.vue';

const emit = defineEmits<{ watch: [url: string] }>();
const library = useLibraryStore();
const jobs = useJobsStore();
const projects = useProjectsStore();
const framing = useFraming();
const movie = useMovieExport();

const { scope, separate, onlyStarred, name, items, missing, nStarred, summary, transition } = movie;
const format = framing.format;
const job = computed(() => jobs.exportJob);

/** the title bar's split button picks what to make */
function openMovie(s: 'all' | 'current'): void {
  scope.value = s;
}
/** the crop frame shows on the video whenever the movie is not square */
const framingActive = computed(() => format.value !== 'original');
defineExpose({ openMovie, framingActive });
</script>

<template>
  <aside class="panel flex min-h-0 flex-col">
    <div class="panel-head justify-between gap-2">
      <span>Movie</span>
      <span class="num min-w-0 truncate font-normal tracking-normal normal-case text-fg3">{{
        summary
      }}</span>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-3">
      <section class="flex flex-col gap-2">
        <input
          v-model="name"
          class="input w-full"
          placeholder="Name of your movie"
          maxlength="80"
          aria-label="Name of your movie"
        />
        <div
          v-if="missing.length"
          class="rounded-ctl border border-dashed border-danger/50 px-2 py-1.5 text-xs text-fg2"
        >
          <b class="text-danger">{{ plural(missing.length, 'video') }} not found</b> · their parts
          are skipped. Find the files from the Ride panel.
        </div>
        <div class="seg" role="radiogroup" aria-label="What to make">
          <button
            class="seg-item"
            role="radio"
            :aria-checked="!separate"
            title="All parts back to back"
            @click="separate = false"
          >
            One movie
          </button>
          <button
            class="seg-item"
            role="radio"
            :aria-checked="separate"
            title="Each part as its own file"
            @click="separate = true"
          >
            Separate clips
          </button>
        </div>
        <div
          v-if="library.analyzed.length > 1 || nStarred || onlyStarred"
          class="num flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg2"
        >
          <template v-if="library.analyzed.length > 1">
            From
            <button
              class="text-fg underline decoration-fg3 underline-offset-2"
              @click="scope = scope === 'all' ? 'current' : 'all'"
            >
              {{
                scope === 'all'
                  ? 'all videos'
                  : `only ${library.current ? shortName(library.current) : ''}`
              }}
            </button>
          </template>
          <label v-if="nStarred || onlyStarred" class="flex items-center gap-1.5 text-fg2">
            <input v-model="onlyStarred" type="checkbox" class="m-0 h-3 w-3" />
            Starred only ({{ nStarred }})
          </label>
        </div>
      </section>

      <div class="-mt-3">
        <FormatSection />
        <div class="mt-2"><PlatformPresets /></div>
      </div>

      <ColourSection />

      <section v-if="!separate" class="flex flex-col gap-4">
        <div>
          <div class="label-caps mb-2">Between the parts</div>
          <div class="seg" role="radiogroup">
            <button
              v-for="t in TRANSITIONS"
              :key="t"
              class="seg-item"
              role="radio"
              :aria-checked="transition === t"
              :title="TRANSITION_LABEL[t].hint"
              @click="projects.setTransition(t)"
            >
              {{ TRANSITION_LABEL[t].label }}
            </button>
          </div>
          <div v-if="format === 'original' && transition !== 'cut'" class="mt-2 text-xs text-fg3">
            With a transition the square movie is re-encoded (full quality).
          </div>
        </div>
        <OverlaySection />
        <div>
          <div class="label-caps mb-2">Sound</div>
          <label class="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="checkbox"
              class="mt-0.5"
              :checked="projects.active?.loudness ?? false"
              @change="projects.setLoudness(($event.target as HTMLInputElement).checked)"
            />
            <span>
              <b class="block font-semibold text-fg">Make every movie equally loud</b>
              <span class="text-fg2">
                Evens the whole movie out to the level phones and websites play at, so this ride is
                not twice as loud as the last one you made. Adds a short step at the end.
              </span>
            </span>
          </label>
        </div>
      </section>

      <ExportResultCard v-if="job" :job="job" @watch="emit('watch', $event)" />
    </div>
    <div class="flex-none border-t border-line p-3">
      <button
        class="btn btn-pri h-8 w-full"
        :disabled="!items.length || jobs.exporting"
        @click="movie.go()"
      >
        {{ jobs.exporting ? 'Working…' : separate ? 'Make clips' : 'Make my movie' }}
      </button>
    </div>
  </aside>
</template>
