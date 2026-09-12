<script setup lang="ts">
/**
 * When there is nothing to play: why, and the one thing to do about it. Keeps the stage, the rail
 * and the timeline telling the same story about a video that is not scanned, failed or missing.
 */
import { computed } from 'vue';
import { PhArrowsClockwise, PhFilmSlate } from '@phosphor-icons/vue';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { friendlyError } from '@renderer/utils/errors';
import { shortName } from '@renderer/utils/format';

const props = defineProps<{ watchingResult: boolean }>();
const emit = defineEmits<{ scan: [stem: string] }>();
const library = useLibraryStore();
const jobs = useJobsStore();

const notice = computed<{ title: string; hint: string; scan: boolean } | null>(() => {
  if (props.watchingResult) return null;
  const clip = library.currentClip;
  if (!clip) {
    return library.clips.length
      ? { title: 'No scanned video yet', hint: 'Pick a video in the Ride panel.', scan: false }
      : null;
  }
  if (!clip.exists)
    return {
      title: `${shortName(clip.stem)} was not found`,
      hint: 'The file moved or the memory card is not plugged in. Use “Find the moved file…” in its menu.',
      scan: false,
    };
  if (clip.analyzed) return null;
  if (jobs.analyzeJob) return { title: 'Scanning…', hint: '', scan: false };
  const err = library.scanErrors[clip.stem];
  if (err) {
    const f = friendlyError(err);
    return { title: f.title, hint: f.hint, scan: true };
  }
  return {
    title: `${shortName(clip.stem)} is not scanned yet`,
    hint: 'Scan it to find its corners, braking and acceleration.',
    scan: true,
  };
});
</script>

<template>
  <div
    v-if="notice"
    class="absolute inset-2 z-[6] grid place-items-center p-6"
    role="status"
    data-stage-notice
  >
    <div class="flex max-w-[380px] flex-col items-center gap-2 text-center">
      <PhFilmSlate :size="26" class="text-fg3" />
      <b class="text-[13px] font-semibold text-fg">{{ notice.title }}</b>
      <p v-if="notice.hint" class="m-0 text-xs text-fg2">{{ notice.hint }}</p>
      <button
        v-if="notice.scan && library.currentClip"
        class="btn btn-pri mt-1"
        @click="emit('scan', library.currentClip.stem)"
      >
        <PhArrowsClockwise :size="14" />
        {{ library.scanErrors[library.currentClip.stem] ? 'Scan again' : 'Scan now' }}
      </button>
    </div>
  </div>
</template>
