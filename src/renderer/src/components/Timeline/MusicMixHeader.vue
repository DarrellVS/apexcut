<script setup lang="ts">
/** The music lane's header: add songs, how loud they are against the ride sound, and a hint. */
import { PhMusicNotes, PhPlus } from '@phosphor-icons/vue';
import type { MusicSettings } from '@shared/ipc';
import { fmtDuration } from '@renderer/utils/format';

defineProps<{ music: MusicSettings; movieLen: number }>();
const emit = defineEmits<{
  pick: [];
  musicGain: [v: number];
  originalGain: [v: number];
}>();
const valueOf = (e: Event): number => Number((e.target as HTMLInputElement).value);
</script>

<template>
  <div class="num flex h-7 items-center gap-3 px-3 text-[11px] text-fg2">
    <span class="label-caps flex items-center gap-1.5"><PhMusicNotes :size="12" /> Music</span>
    <button class="btn btn-mini" @click="emit('pick')"><PhPlus :size="11" /> Add music…</button>
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
          @change="emit('musicGain', valueOf($event))"
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
          @change="emit('originalGain', valueOf($event))"
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
</template>
