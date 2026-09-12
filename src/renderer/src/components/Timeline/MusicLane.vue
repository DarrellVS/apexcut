<script setup lang="ts">
/**
 * Music lane under the parts lane, in movie time: songs back to back, trim handles on each, a
 * toolbar for the selected song and the mix levels in the header. The lane spans the movie or the
 * music, whichever is longer, so nothing falls off the end.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { PhMusicNotes, PhWarning } from '@phosphor-icons/vue';
import type { MusicTrack } from '@shared/ipc';
import { startDrag } from '@renderer/composables/useDrag';
import { useMovieTime } from '@renderer/composables/useMovieTime';
import { useMusicTracks } from '@renderer/composables/useMusicTracks';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';
import { fmtDuration, fmtTime } from '@renderer/utils/format';
import MusicMixHeader from './MusicMixHeader.vue';
import MusicToolbar from './MusicToolbar.vue';

const projects = useProjectsStore();
const editor = useEditorStore();
const { movieLen, movieTimeOf, placed } = useMovieTime();

const lane = ref<HTMLElement | null>(null);
const selected = ref<string | null>(null);
const tracks = useMusicTracks(selected);
const { music, missing, save, patchTrack } = tracks;

const laneLen = computed(() =>
  Math.max(
    1,
    movieLen.value,
    placed.value.reduce((a, p) => a + p.lengthS, 0),
  ),
);
const pct = (s: number): number => (s / laneLen.value) * 100;
const playheadPct = computed(() => pct(movieTimeOf(editor.time)));

// ---- trim handles: drag changes inS / outS; the lane scale is seconds per pixel of the lane width
let dragging = false;
function trim(e: MouseEvent, t: MusicTrack, edge: 'inS' | 'outS'): void {
  const el = lane.value;
  if (!el) return;
  e.stopPropagation();
  selected.value = t.id;
  dragging = true;
  const secPerPx = laneLen.value / el.clientWidth;
  let next = t[edge];
  startDrag(e, {
    start: (ev) => ({ x: ev.clientX, from: t[edge] }),
    move: (ev, from) => {
      const d = (ev.clientX - from.x) * secPerPx;
      next =
        edge === 'inS'
          ? Math.max(0, Math.min(t.outS - 1, from.from + d))
          : Math.max(t.inS + 1, Math.min(t.durationS, from.from + d));
      next = Math.round(next * 10) / 10;
      // live, without persisting on every pixel
      const p = projects.active;
      if (p) p.music = { ...p.music, tracks: patchTrack(t.id, { [edge]: next }) };
    },
    end: () => {
      dragging = false;
      save({ tracks: patchTrack(t.id, { [edge]: next }) });
    },
  });
}

function onGlobalDown(e: MouseEvent): void {
  if (dragging) return;
  const t = e.target as HTMLElement;
  if (!t.closest('[data-music-keep]')) selected.value = null;
}
onMounted(() => document.addEventListener('mousedown', onGlobalDown));
onUnmounted(() => document.removeEventListener('mousedown', onGlobalDown));

const sel = computed(() => music.value.tracks.find((t) => t.id === selected.value) ?? null);
const selPlaced = computed(() => placed.value.find((p) => p.track.id === selected.value) ?? null);
/** the toolbar sits over the song but never leaves the lane */
const toolbarLeft = computed(() =>
  selPlaced.value
    ? `min(max(0px, ${pct(selPlaced.value.offsetS + selPlaced.value.lengthS / 2)}% - 190px), calc(100% - 380px))`
    : '0px',
);
</script>

<template>
  <div class="flex flex-col border-t border-line" data-tour="music">
    <MusicMixHeader
      :music="music"
      :movie-len="movieLen"
      @pick="tracks.pick()"
      @music-gain="save({ musicGain: $event })"
      @original-gain="save({ originalGain: $event })"
    />
    <div ref="lane" class="relative h-8 border-t border-line bg-bg1" data-music-keep>
      <div
        v-if="movieLen > 0"
        class="pointer-events-none absolute inset-y-0 border-r border-dashed border-line2"
        :style="{ left: 0, width: `${pct(movieLen)}%` }"
        title="end of the movie"
      />
      <div
        v-for="p in placed"
        :key="p.track.id"
        class="absolute top-1 bottom-1 flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-block border-l-[3px] pr-2 pl-2 text-[11px] whitespace-nowrap text-fg select-none"
        :class="[
          missing[p.track.id]
            ? 'border-danger bg-danger/10 [border-left-style:dashed]'
            : 'border-brake bg-brake/25 hover:bg-brake/35',
          { 'ring-1 ring-sel ring-inset': selected === p.track.id },
        ]"
        :style="{ left: `${pct(p.offsetS)}%`, width: `${Math.max(0.5, pct(p.lengthS))}%` }"
        :title="`${p.track.name} · ${fmtTime(p.track.inS)}–${fmtTime(p.track.outS)} of ${fmtTime(p.track.durationS)}`"
        @mousedown.stop="selected = p.track.id"
      >
        <div
          class="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize"
          title="Drag: where the song starts"
          @mousedown="trim($event, p.track, 'inS')"
        />
        <PhWarning v-if="missing[p.track.id]" :size="12" class="text-danger" />
        <PhMusicNotes v-else :size="12" />
        <b class="truncate font-semibold">{{ p.track.name }}</b>
        <span class="num text-fg2">{{ fmtDuration(p.lengthS) }}</span>
        <span v-if="missing[p.track.id]" class="text-danger">file missing</span>
        <div
          class="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize"
          title="Drag: where the song stops"
          @mousedown="trim($event, p.track, 'outS')"
        />
      </div>
      <div
        class="pointer-events-none absolute inset-y-0 w-px bg-play"
        :style="{ left: `${playheadPct}%` }"
      />
      <MusicToolbar
        v-if="sel && selPlaced"
        :track="sel"
        :left="toolbarLeft"
        @gain="save({ tracks: patchTrack(sel.id, { gain: $event }) })"
        @fade-in="save({ tracks: patchTrack(sel.id, { fadeInS: $event }) })"
        @fade-out="save({ tracks: patchTrack(sel.id, { fadeOutS: $event }) })"
        @move="tracks.move(sel.id, $event)"
        @remove="tracks.remove(sel.id)"
      />
    </div>
  </div>
</template>
