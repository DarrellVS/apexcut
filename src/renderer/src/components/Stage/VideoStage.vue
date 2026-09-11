<script setup lang="ts">
/**
 * The video with a floating panel transport, preview mode (plays only enabled parts back to back)
 * and the draggable framing window shown while a cropped format is being chosen.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { PhCircleHalf, PhPause, PhPlay, PhSkipBack, PhSkipForward } from '@phosphor-icons/vue';
import { FORMAT_SPEC } from '@shared/ipc';
import { drawOverlayFrame, overlayLayout, type Ctx2D, type Sample } from '@core/overlay';
import { musicUrl, useMovieTime } from '@renderer/composables/useMovieTime';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';
import { fmtTime } from '@renderer/utils/format';
import { gradeFilterMarkup, vignetteCss } from '@renderer/utils/gradeSvg';
import { isNeutral, type Grade } from '@core/grade';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const props = defineProps<{ framing: boolean }>();
const editor = useEditorStore();
const library = useLibraryStore();
const jobs = useJobsStore();
const settings = useSettingsStore();
const projects = useProjectsStore();

const video = ref<HTMLVideoElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const previewOn = ref(false);
const watchingResult = ref<string | null>(null);
const box = ref({ left: 0, top: 0, width: 0, height: 0 });

const src = computed(() => watchingResult.value ?? library.currentClip?.proxyUrl ?? '');

watch(src, async (s) => {
  const v = video.value;
  if (!v || !s) return;
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

function onTime(): void {
  const v = video.value;
  if (!v) return;
  editor.time = v.currentTime;
  editor.playing = !v.paused;
  if (previewOn.value && !v.paused && !watchingResult.value) {
    const on = editor.enabledParts.slice().sort((a, b) => a.start_s - b.start_s);
    const inside = on.find((p) => v.currentTime >= p.start_s && v.currentTime < p.end_s);
    if (!inside) {
      const next = on.find((p) => p.start_s > v.currentTime);
      if (next) v.currentTime = next.start_s;
      else {
        v.pause();
        previewOn.value = false;
        toast('That was your movie. Happy? Click "Make my movie".');
      }
    }
  }
}

function seek(t: number): void {
  const v = video.value;
  if (!v) return;
  if (watchingResult.value) watchingResult.value = null;
  v.currentTime = Math.max(0, Math.min(editor.duration || t, t));
}
function play(t?: number): void {
  const v = video.value;
  if (!v) return;
  if (t !== undefined) seek(t);
  v.play().catch(() => undefined);
}
function togglePlay(): void {
  const v = video.value;
  if (!v?.src) return;
  v.paused ? v.play().catch(() => undefined) : v.pause();
}
/** L: play, and faster on every press (1× → 2× → 4×); K: pause and back to 1×. */
function shuttle(dir: 'play' | 'pause'): number {
  const v = video.value;
  if (!v?.src) return 1;
  if (dir === 'pause') {
    v.pause();
    v.playbackRate = 1;
    return 1;
  }
  if (v.paused) {
    v.playbackRate = 1;
    v.play().catch(() => undefined);
  } else v.playbackRate = v.playbackRate >= 4 ? 1 : v.playbackRate * 2;
  return v.playbackRate;
}
/** , and . : one frame back / forward (pauses). */
function frameStep(dir: 1 | -1): void {
  const v = video.value;
  if (!v?.src) return;
  v.pause();
  const fps = library.currentClip?.fps || 30;
  seek(v.currentTime + dir / fps);
  onTime();
}
function seekPart(dir: 1 | -1): void {
  const list = editor.parts.slice().sort((a, b) => a.start_s - b.start_s);
  const t = editor.time;
  const p =
    dir > 0
      ? list.find((x) => x.start_s > t + 0.5)
      : [...list].reverse().find((x) => x.start_s < t - 1);
  if (p) {
    editor.select(p.id);
    play(p.start_s);
  }
}
function startPreview(): void {
  const on = editor.enabledParts.slice().sort((a, b) => a.start_s - b.start_s);
  if (!on.length) {
    toast('No parts selected');
    return;
  }
  previewOn.value = true;
  const cur = on.find((p) => editor.time >= p.start_s && editor.time < p.end_s);
  play(cur ? editor.time : on[0].start_s);
}
function togglePreview(): void {
  if (previewOn.value) previewOn.value = false;
  else startPreview();
}
function watchResult(url: string): void {
  previewOn.value = false;
  watchingResult.value = url;
  nextTick(() => video.value?.play().catch(() => undefined));
  toast('This is your movie. Click a block to go back to the recording.');
}

// ---- framing overlay geometry (video is object-fit: contain inside the stage)
function measure(): void {
  const v = video.value;
  const st = stage.value;
  if (!v || !st || !v.videoWidth) return;
  const PAD = 8; // the black video box sits 8 px inside the stage
  const W = st.clientWidth - 2 * PAD;
  const H = st.clientHeight - 2 * PAD;
  const ar = v.videoWidth / v.videoHeight;
  let w = W;
  let h = W / ar;
  if (h > H) {
    h = H;
    w = H * ar;
  }
  box.value = { left: PAD + (W - w) / 2, top: PAD + (H - h) / 2, width: w, height: h };
}
const format = computed(() => settings.settings?.lastFormat ?? '16x9');
const framePos = computed(() => settings.settings?.lastFramePos ?? 0.5);
const isVertical = computed(() => format.value === '9x16');
const winFrac = computed(() => {
  const spec = FORMAT_SPEC[format.value];
  if (!spec) return 1;
  return isVertical.value ? spec.w / spec.h : spec.h / spec.w;
});
const winStyle = computed(() => {
  const f = winFrac.value * 100;
  const free = 100 - f;
  return isVertical.value
    ? { top: 0, height: '100%', width: `${f}%`, left: `${framePos.value * free}%` }
    : { left: 0, width: '100%', height: `${f}%`, top: `${framePos.value * free}%` };
});
function frameDrag(e: MouseEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const start = framePos.value;
  const sx = e.clientX;
  const sy = e.clientY;
  const free = 1 - winFrac.value;
  const move = (ev: MouseEvent): void => {
    const d = isVertical.value
      ? (ev.clientX - sx) / (box.value.width * free)
      : (ev.clientY - sy) / (box.value.height * free);
    settings.update({ lastFramePos: Math.min(1, Math.max(0, start + d)) });
  };
  const up = (): void => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
function resetFrame(): void {
  settings.update({ lastFramePos: 0.5 });
  toast('Frame centered');
}
watch(
  () => props.framing,
  () => nextTick(measure),
);
onMounted(() => {
  new ResizeObserver(measure).observe(stage.value as Element);
  if (src.value && video.value) video.value.src = src.value;
});

// ---- music under the video: the song that covers the movie time plays in sync, the ride sound ducks
const music = ref<HTMLAudioElement | null>(null);
const { movieTimeOf, trackAt } = useMovieTime();
let musicSrc = '';
function syncMusic(): void {
  const v = video.value;
  const a = music.value;
  if (!v || !a) return;
  const settings = projects.active?.music;
  // the song plays whenever the playhead is inside a part that is in the movie (preview or not);
  // between parts, and when watching a finished movie, the ride sound is on its own
  const t = v.currentTime;
  const inPart = editor.enabledParts.some((p) => t >= p.start_s && t < p.end_s);
  const active = inPart && !v.paused && !watchingResult.value && settings?.tracks.length;
  const hit = active ? trackAt(movieTimeOf(t)) : null;
  if (!hit) {
    if (!a.paused) a.pause();
    v.volume = 1;
    return;
  }
  const url = musicUrl(hit.track.path);
  if (musicSrc !== url) {
    musicSrc = url;
    a.src = url;
  }
  const want = hit.track.inS + (movieTimeOf(v.currentTime) - hit.offsetS);
  if (Math.abs(a.currentTime - want) > 0.35) a.currentTime = want;
  a.volume = Math.min(1, hit.track.gain * (settings?.musicGain ?? 0.8));
  v.volume = settings?.originalGain ?? 0.35;
  if (a.paused) a.play().catch(() => undefined);
}

// ---- telemetry overlay preview: the same drawing as the export, on a canvas over the video box
const gauge = ref<HTMLCanvasElement | null>(null);
function sampleAt(t: number): Sample | null {
  const ts = editor.data.t as number[] | undefined;
  const lean = editor.data.leanDeg as (number | null)[] | undefined;
  const aLon = editor.data.aLonG as (number | null)[] | undefined;
  if (!ts?.length || !lean || !aLon) return null;
  // 10 Hz grid → index directly
  const i = Math.max(0, Math.min(ts.length - 1, Math.round(t * 10)));
  return { leanDeg: lean[i] ?? 0, aLonG: aLon[i] ?? 0 };
}
function drawGauge(): void {
  const c = gauge.value;
  const spec = projects.active?.overlay;
  if (!c) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const w = Math.round(box.value.width);
  const h = Math.round(box.value.height);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  if (!spec || !w || !h) return;
  // the export crops the frame: preview the gauge inside the same crop so it lands where it will be
  const f = winFrac.value;
  const cropW = isVertical.value ? w * f : w;
  const cropH = isVertical.value ? h : h * f;
  const ox = isVertical.value ? framePos.value * (w - cropW) : 0;
  const oy = isVertical.value ? 0 : framePos.value * (h - cropH);
  const L = overlayLayout(spec, cropW, cropH);
  ctx.save();
  ctx.translate(ox, oy);
  drawOverlayFrame(ctx as unknown as Ctx2D, spec, L, sampleAt(editor.time));
  ctx.restore();
}
watch(
  () => [projects.active?.overlay, editor.time, box.value, editor.stem, format.value],
  () => requestAnimationFrame(drawGauge),
  { deep: true },
);

// ---- live colours: a selected part with its own colours wins, else the part under the playhead,
// else the movie's; the SVG filter is rebuilt from the same maths as the export
const liveGrade = computed<Grade | null>(() => {
  const sel = editor.selectedParts;
  if (sel.length === 1 && sel[0].grade) return sel[0].grade;
  const t = editor.time;
  const at = editor.parts.find((p) => t >= p.start_s && t < p.end_s);
  return at?.grade ?? projects.active?.grade ?? null;
});
const gradeMarkup = computed(() => gradeFilterMarkup(liveGrade.value));
const gradeStyle = computed(() =>
  gradeMarkup.value && !watchingResult.value ? { filter: 'url(#apexcut-grade-live)' } : {},
);
const vignetteStyle = computed(() => {
  const css = watchingResult.value ? '' : vignetteCss(liveGrade.value);
  return css ? { background: css } : null;
});
const graded = computed(() => !watchingResult.value && !isNeutral(liveGrade.value));

// smooth clock: 'timeupdate' fires only ~4×/s, so follow currentTime per animation frame while playing
let raf = 0;
function tick(): void {
  const v = video.value;
  if (!v || v.paused) {
    raf = 0;
    return;
  }
  editor.time = v.currentTime;
  syncMusic();
  raf = requestAnimationFrame(tick);
}
function onPlay(): void {
  editor.playing = true;
  if (!raf) raf = requestAnimationFrame(tick);
}
function onPause(): void {
  editor.playing = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  onTime();
  syncMusic();
}
watch(previewOn, syncMusic);

defineExpose({ seek, play, togglePlay, shuttle, frameStep, seekPart, startPreview, watchResult });
</script>

<template>
  <section ref="stage" class="relative grid min-h-0 place-items-center overflow-hidden bg-bg0">
    <div class="absolute inset-2 overflow-hidden rounded-[3px] bg-black">
      <video
        ref="video"
        class="absolute inset-0 h-full w-full object-contain"
        :style="gradeStyle"
        preload="metadata"
        @timeupdate="onTime"
        @loadedmetadata="
          onTime();
          measure();
        "
        @play="onPlay"
        @pause="onPause"
        @click="togglePlay"
      />
    </div>
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
    <audio ref="music" preload="auto" />
    <!-- telemetry overlay preview, same drawing as the export, over the video box -->
    <canvas
      v-if="projects.active?.overlay"
      ref="gauge"
      class="pointer-events-none absolute z-10"
      :style="{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }"
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
    <div
      v-if="framing && format !== 'original'"
      class="pointer-events-none absolute z-20 overflow-hidden"
      :style="{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }"
    >
      <div
        class="group pointer-events-auto absolute border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,.55)]"
        :class="isVertical ? 'cursor-ew-resize' : 'cursor-ns-resize'"
        :style="winStyle"
        @mousedown="frameDrag"
        @dblclick.prevent="resetFrame"
        @contextmenu.prevent="resetFrame"
      >
        <div
          class="chip absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 text-center text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100"
        >
          {{ isVertical ? 'Drag left or right' : 'Drag to place the horizon' }}
          <small class="block text-[11px] opacity-70">Double-click to reset</small>
        </div>
      </div>
    </div>
    <div class="chip absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 p-1">
      <button
        class="chip-btn w-8 justify-center"
        title="Previous part ["
        aria-label="Previous part"
        @click="seekPart(-1)"
      >
        <PhSkipBack :size="14" weight="fill" />
      </button>
      <button
        class="chip-btn w-9 justify-center bg-white text-black hover:bg-white/90"
        title="Play / pause (space)"
        :aria-label="editor.playing ? 'Pause' : 'Play'"
        @click="togglePlay"
      >
        <PhPause v-if="editor.playing" :size="14" weight="fill" />
        <PhPlay v-else :size="14" weight="fill" />
      </button>
      <button
        class="chip-btn w-8 justify-center"
        title="Next part ]"
        aria-label="Next part"
        @click="seekPart(1)"
      >
        <PhSkipForward :size="14" weight="fill" />
      </button>
      <span class="num min-w-[112px] px-2 text-center text-[13px] font-semibold">
        {{ fmtTime(editor.time, true) }}
        <span class="font-normal opacity-50">/ {{ fmtTime(editor.duration) }}</span>
      </span>
      <button
        class="chip-btn"
        :class="{ 'bg-white/15': previewOn }"
        :aria-pressed="previewOn"
        title="Play only the selected parts back to back"
        data-tour="preview"
        @click="togglePreview"
      >
        Preview
      </button>
      <span v-if="jobs.exporting" class="px-2 text-xs opacity-60">exporting…</span>
    </div>
  </section>
</template>
