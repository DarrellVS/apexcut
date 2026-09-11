<script setup lang="ts">
/**
 * Music lane under the parts lane, in movie time: songs back to back, trim handles on each, a
 * toolbar for the selected song (volume, fades, order, remove) and the mix levels in the header.
 */
import { api } from '@renderer/api';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  PhCaretLeft,
  PhCaretRight,
  PhMusicNotes,
  PhPlus,
  PhTrash,
  PhWarning,
} from '@phosphor-icons/vue';
import type { MusicSettings, MusicTrack } from '@shared/ipc';
import { useMovieTime } from '@renderer/composables/useMovieTime';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';
import { fmtDuration, fmtTime } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const projects = useProjectsStore();
const editor = useEditorStore();
const { movieLen, movieTimeOf, placed } = useMovieTime();

const music = computed<MusicSettings>(
  () => projects.active?.music ?? { tracks: [], musicGain: 0.8, originalGain: 0.35 },
);
const lane = ref<HTMLElement | null>(null);
const selected = ref<string | null>(null);
const missing = ref<Record<string, boolean>>({});
/** the lane spans the movie or the music, whichever is longer, so nothing falls off the end */
const laneLen = computed(() =>
  Math.max(
    1,
    movieLen.value,
    placed.value.reduce((a, p) => a + p.lengthS, 0),
  ),
);
const pct = (s: number): number => (s / laneLen.value) * 100;
const playheadPct = computed(() => pct(movieTimeOf(editor.time)));

async function save(next: Partial<MusicSettings>): Promise<void> {
  await projects.setMusic({ ...music.value, ...next });
}
function patchTrack(id: string, patch: Partial<MusicTrack>): MusicTrack[] {
  return music.value.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

async function addTracks(tracks: MusicTrack[]): Promise<void> {
  if (!tracks.length) return;
  await save({ tracks: [...music.value.tracks, ...tracks] });
  toast(
    `${tracks.length === 1 ? tracks[0].name : `${tracks.length} songs`} added under your movie`,
  );
  selected.value = tracks[0].id;
}
async function pick(): Promise<void> {
  await addTracks(await api.music.pick());
}
async function remove(id: string): Promise<void> {
  selected.value = null;
  await save({ tracks: music.value.tracks.filter((t) => t.id !== id) });
}
async function move(id: string, dir: -1 | 1): Promise<void> {
  const list = [...music.value.tracks];
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await save({ tracks: list });
}

// ---- trim handles: drag changes inS / outS; the lane scale is seconds per pixel of the lane width
let dragging = false;
function trim(e: MouseEvent, t: MusicTrack, edge: 'inS' | 'outS'): void {
  e.preventDefault();
  e.stopPropagation();
  selected.value = t.id;
  dragging = true;
  const el = lane.value!;
  const secPerPx = laneLen.value / el.clientWidth;
  const startX = e.clientX;
  const start = t[edge];
  let next = start;
  const onMove = (ev: MouseEvent): void => {
    const d = (ev.clientX - startX) * secPerPx;
    next =
      edge === 'inS'
        ? Math.max(0, Math.min(t.outS - 1, start + d))
        : Math.max(t.inS + 1, Math.min(t.durationS, start + d));
    next = Math.round(next * 10) / 10;
    // live, without persisting on every pixel
    const p = projects.active;
    if (p) p.music = { ...p.music, tracks: patchTrack(t.id, { [edge]: next }) };
  };
  const onUp = (): void => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    dragging = false;
    save({ tracks: patchTrack(t.id, { [edge]: next }) });
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

async function checkFiles(): Promise<void> {
  const out: Record<string, boolean> = {};
  for (const t of music.value.tracks) out[t.id] = !(await api.music.exists(t.path));
  missing.value = out;
}
function onGlobalDown(e: MouseEvent): void {
  if (dragging) return;
  const t = e.target as HTMLElement;
  if (!t.closest('[data-music-keep]')) selected.value = null;
}
onMounted(() => {
  document.addEventListener('mousedown', onGlobalDown);
  checkFiles();
});
onUnmounted(() => document.removeEventListener('mousedown', onGlobalDown));

const sel = computed(() => music.value.tracks.find((t) => t.id === selected.value) ?? null);
const selPlaced = computed(() => placed.value.find((p) => p.track.id === selected.value) ?? null);
</script>

<template>
  <div class="flex flex-col border-t border-line" data-tour="music">
    <div class="num flex h-7 items-center gap-3 px-3 text-[11px] text-fg2">
      <span class="label-caps flex items-center gap-1.5"><PhMusicNotes :size="12" /> Music</span>
      <button class="btn btn-mini" @click="pick"><PhPlus :size="11" /> Add music…</button>
      <template v-if="music.tracks.length">
        <label class="ml-auto flex items-center gap-1.5" title="How loud the songs play">
          Music
          <input
            type="range"
            class="w-20"
            min="0"
            max="1"
            step="0.05"
            :value="music.musicGain"
            aria-label="Music volume"
            @change="save({ musicGain: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label
          class="flex items-center gap-1.5"
          title="How much of the engine and wind stays under the music"
        >
          Ride sound
          <input
            type="range"
            class="w-20"
            min="0"
            max="1"
            step="0.05"
            :value="music.originalGain"
            aria-label="Original sound volume"
            @change="save({ originalGain: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
      </template>
      <span class="truncate text-fg3" :class="{ 'ml-auto': !music.tracks.length }">
        <template v-if="music.tracks.length">
          Movie time: your parts back to back ({{ fmtDuration(movieLen) }}), so this lane does not
          line up with the recording above.
        </template>
        <template v-else
          >Songs play back to back under your movie; drop music files here too.</template
        >
      </span>
    </div>
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
      <!-- toolbar for the selected song: one line, clamped inside the lane -->
      <div
        v-if="sel && selPlaced"
        class="chip absolute -top-1 z-[6] flex -translate-y-full items-center gap-2 px-2 py-1 text-xs whitespace-nowrap"
        :style="{
          left: `min(max(0px, ${pct(selPlaced.offsetS + selPlaced.lengthS / 2)}% - 190px), calc(100% - 380px))`,
        }"
        data-music-keep
        @mousedown.stop
      >
        <b class="max-w-[120px] truncate">{{ sel.name }}</b>
        <label class="flex items-center gap-1" title="Volume of this song">
          Vol
          <input
            type="range"
            class="w-16"
            min="0"
            max="1"
            step="0.05"
            :value="sel.gain"
            aria-label="Song volume"
            @change="
              save({
                tracks: patchTrack(sel.id, {
                  gain: Number(($event.target as HTMLInputElement).value),
                }),
              })
            "
          />
        </label>
        <label class="flex items-center gap-1" title="Fade in, seconds">
          In
          <input
            type="number"
            class="num h-5 w-11 rounded-[3px] border border-white/20 bg-transparent px-1 text-xs text-white"
            min="0"
            max="10"
            step="0.5"
            :value="sel.fadeInS"
            aria-label="Fade in seconds"
            @change="
              save({
                tracks: patchTrack(sel.id, {
                  fadeInS: Number(($event.target as HTMLInputElement).value),
                }),
              })
            "
          />
        </label>
        <label class="flex items-center gap-1" title="Fade out, seconds">
          Out
          <input
            type="number"
            class="num h-5 w-11 rounded-[3px] border border-white/20 bg-transparent px-1 text-xs text-white"
            min="0"
            max="10"
            step="0.5"
            :value="sel.fadeOutS"
            aria-label="Fade out seconds"
            @change="
              save({
                tracks: patchTrack(sel.id, {
                  fadeOutS: Number(($event.target as HTMLInputElement).value),
                }),
              })
            "
          />
        </label>
        <button
          class="chip-btn px-1.5"
          title="Play earlier"
          aria-label="Move song earlier"
          @click="move(sel.id, -1)"
        >
          <PhCaretLeft :size="12" weight="bold" />
        </button>
        <button
          class="chip-btn px-1.5"
          title="Play later"
          aria-label="Move song later"
          @click="move(sel.id, 1)"
        >
          <PhCaretRight :size="12" weight="bold" />
        </button>
        <button class="chip-btn text-[#ff8080]" @click="remove(sel.id)">
          <PhTrash :size="12" /> Remove
        </button>
      </div>
    </div>
  </div>
</template>
