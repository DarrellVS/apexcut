<script setup lang="ts">
/**
 * The picture: the video in its black box, what to do when there is nothing to play, the live
 * colours, the dark edges, the telemetry gauge, the crop window while a format is being chosen, and
 * the transport. The driving lives in composables (transport, box, music, colours); this file wires
 * them to the element.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { PhCircleHalf } from '@phosphor-icons/vue';
import { FORMAT_SPEC } from '@shared/ipc';
import { useFraming } from '@renderer/composables/useFraming';
import { useLiveGrade } from '@renderer/composables/useLiveGrade';
import { useMusicSync } from '@renderer/composables/useMusicSync';
import { useStageBox } from '@renderer/composables/useStageBox';
import { useVideoTransport } from '@renderer/composables/useVideoTransport';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import FramingWindow from './FramingWindow.vue';
import OverlayGauge from './OverlayGauge.vue';
import StageNotice from './StageNotice.vue';
import StageTransport from './StageTransport.vue';

const props = defineProps<{ framing: boolean }>();
const emit = defineEmits<{ scan: [stem: string] }>();
const library = useLibraryStore();
const projects = useProjectsStore();

const video = ref<HTMLVideoElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const { box, measure } = useStageBox(stage, video);
const transport = useVideoTransport(video, () => music.sync());
const { previewOn, watchingResult } = transport;
const music = useMusicSync(video, watchingResult);
// top-level refs so the template can bind and read them without `.value`
const audio = music.audio;
void audio;
const {
  style: gradeStyle,
  markup: gradeMarkup,
  vignette: vignetteStyle,
  on: graded,
} = useLiveGrade(watchingResult);

const src = computed(() => watchingResult.value ?? library.currentClip?.proxyUrl ?? '');
watch(src, async (s) => {
  const v = video.value;
  if (!v) return;
  if (!s) {
    // no playable video (not scanned, failed, missing): the previous one must not linger
    v.removeAttribute('src');
    v.load();
    return;
  }
  const wasPlaying = !v.paused;
  v.src = s;
  await nextTick();
  if (wasPlaying) v.play().catch(() => undefined);
});
// a relinked video keeps its URL: reload the element once its file is back
watch(
  () => library.currentClip?.exists,
  (ok, was) => {
    const v = video.value;
    if (ok && was === false && v && src.value) {
      v.src = src.value;
      v.load();
    }
  },
);
watch(previewOn, () => music.sync());
watch(
  () => props.framing,
  () => nextTick(measure),
);
onMounted(() => {
  if (src.value && video.value) video.value.src = src.value;
});

// ---- the crop the chosen format makes, for the gauge preview and the crop window
const frame = useFraming();
const framePos = frame.framePos;
const isVertical = computed(() => frame.format.value === '9x16');
const cropped = computed(() => frame.format.value !== 'original');
const winFrac = computed(() => {
  const spec = FORMAT_SPEC[frame.format.value];
  if (!spec) return 1;
  return isVertical.value ? spec.w / spec.h : spec.h / spec.w;
});

defineExpose({
  seek: transport.seek,
  play: transport.play,
  togglePlay: transport.togglePlay,
  shuttle: transport.shuttle,
  frameStep: transport.frameStep,
  seekPart: transport.seekPart,
  startPreview: transport.startPreview,
  watchResult: transport.watchResult,
});
</script>

<template>
  <section ref="stage" class="relative grid min-h-0 place-items-center overflow-hidden bg-bg0">
    <div class="absolute inset-2 overflow-hidden rounded-[3px] bg-black">
      <video
        ref="video"
        class="absolute inset-0 h-full w-full object-contain"
        :style="gradeStyle"
        preload="metadata"
        @timeupdate="transport.onTime()"
        @loadedmetadata="
          transport.onTime();
          measure();
        "
        @play="transport.onPlay()"
        @pause="transport.onPause()"
        @click="transport.togglePlay()"
      />
    </div>
    <StageNotice :watching-result="!!watchingResult" @scan="emit('scan', $event)" />
    <!-- the live colour filter (same maths as the export) and the dark edges over the video box -->
    <svg class="absolute h-0 w-0" aria-hidden="true">
      <!-- eslint-disable-next-line vue/no-v-html -- the markup is built from numbers only (gradeSvg.ts) -->
      <filter id="apexcut-grade-live" color-interpolation-filters="sRGB" v-html="gradeMarkup" />
    </svg>
    <div
      v-if="vignetteStyle"
      class="pointer-events-none absolute z-[5]"
      :style="{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        ...vignetteStyle,
      }"
    />
    <span
      v-if="graded"
      class="chip pointer-events-none absolute top-4 right-4 flex h-6 items-center gap-1.5 px-2 text-[11px]"
      title="Shown with the colours it will have in the movie"
    >
      <PhCircleHalf :size="12" weight="fill" /> Colours on
    </span>
    <audio ref="audio" preload="auto" />
    <OverlayGauge
      v-if="projects.active?.overlay"
      :box="box"
      :win-frac="winFrac"
      :frame-pos="framePos"
      :is-vertical="isVertical"
    />
    <Transition
      enter-active-class="transition-opacity"
      leave-active-class="transition-opacity"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="previewOn && !framing"
        class="chip absolute top-4 left-4 flex h-7 items-center gap-2 pr-1 pl-2.5 text-xs"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-white" /> Preview: only your selected parts
        <button class="chip-btn h-5" @click="previewOn = false">Stop</button>
      </div>
    </Transition>
    <FramingWindow v-if="framing && cropped" :box="box" />
    <StageTransport
      :preview-on="previewOn"
      @seek-part="transport.seekPart($event)"
      @toggle-play="transport.togglePlay()"
      @toggle-preview="transport.togglePreview()"
    />
  </section>
</template>
