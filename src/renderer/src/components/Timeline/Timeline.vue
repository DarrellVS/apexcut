<script setup lang="ts">
/**
 * Timeline: ruler · score lane (curves) · parts lane (filmstrip background, blocks with edge grips,
 * join-suggestion bars, floating toolbar clamped to the lane) · legend row with zoom.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { PhQuestion, PhStar } from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { useTimelineView } from '@renderer/composables/useTimelineView';
import { useEditorStore } from '@renderer/stores/editor';
import { useSettingsStore } from '@renderer/stores/settings';
import { fmtDuration, fmtTime, plural } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import MusicLane from './MusicLane.vue';

const emit = defineEmits<{ seek: [t: number]; play: [t: number] }>();
const editor = useEditorStore();
const settings = useSettingsStore();
const duration = computed(() => editor.duration);
const view = useTimelineView(duration);

const lane = ref<HTMLElement | null>(null);
const rulerCv = ref<HTMLCanvasElement | null>(null);
const scoreCv = ref<HTMLCanvasElement | null>(null);
const stripCv = ref<HTMLCanvasElement | null>(null);
const toolbar = ref<HTMLElement | null>(null);
const dragging = ref(false);
const hoverT = ref<number | null>(null);
const stripImg = ref<HTMLImageElement | null>(null);
/** lane width in px, for deciding how much label fits in a block */
const laneW = ref(0);
/** what fits: nothing under 44 px, the reason under 120 px, reason + length above */
function label(p: Part): 'none' | 'short' | 'full' {
  const px = ((view.xPct(p.end_s) - view.xPct(p.start_s)) / 100) * laneW.value;
  return px < 44 ? 'none' : px < 120 ? 'short' : 'full';
}

/** block look per reason: a solid stripe on the left edge, a tint of the same colour as the fill */
const cls = (p: Part): string =>
  ({
    bochten: 'block block-corner',
    'accel/rem': 'block block-brake',
    beide: 'block block-both',
    handmatig: 'block block-manual',
    samengeplakt: 'block block-manual',
  })[reasonOf(p)];

// ---- drawing
function canvasSetup(cv: HTMLCanvasElement): {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
} {
  const dpr = window.devicePixelRatio;
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  return { ctx: cv.getContext('2d')!, W: cv.width, H: cv.height };
}
function drawRuler(): void {
  if (!rulerCv.value) return;
  const { ctx, W, H } = canvasSetup(rulerCv.value);
  const dpr = window.devicePixelRatio;
  const span = view.span.value;
  const step =
    span > 900 ? 120 : span > 400 ? 60 : span > 150 ? 30 : span > 60 ? 10 : span > 20 ? 5 : 1;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--fg3').trim();
  ctx.font = `${10 * dpr}px ${css.getPropertyValue('--font-sans')}`;
  ctx.textBaseline = 'middle';
  // minor ticks between the labelled ones
  const minor = step / (step % 3 === 0 ? 3 : step % 2 === 0 ? 2 : 1);
  for (let t = Math.ceil(view.t0.value / minor) * minor; t <= view.t1.value; t += minor) {
    const x = Math.round((view.xPct(t) / 100) * W);
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ctx.fillRect(x, H - (major ? 6 : 3) * dpr, dpr, (major ? 6 : 3) * dpr);
    if (major) ctx.fillText(fmtTime(t), x + 4 * dpr, H / 2 - 1 * dpr);
  }
}
function drawScore(): void {
  if (!scoreCv.value || !editor.data.t) return;
  const { ctx, W, H } = canvasSetup(scoreCv.value);
  const dpr = window.devicePixelRatio;
  const T = editor.data.t as number[];
  const n = T.length;
  const d = duration.value || 1;
  const i0 = Math.max(0, Math.floor((view.t0.value / d) * (n - 1)) - 1);
  const i1 = Math.min(n - 1, Math.ceil((view.t1.value / d) * (n - 1)) + 1);
  const stride = Math.max(1, Math.floor((i1 - i0) / W));
  const yOf = (v: number): number => H - Math.min(1, v / 3.5) * H * 0.95;
  const css = getComputedStyle(document.documentElement);
  ctx.strokeStyle = css.getPropertyValue('--fg3').trim();
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(0, yOf(editor.threshold));
  ctx.lineTo(W, yOf(editor.threshold));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const score = editor.data.score;
  if (score) {
    ctx.beginPath();
    ctx.moveTo((view.xPct(T[i0]) / 100) * W, H);
    for (let i = i0; i <= i1; i += stride)
      ctx.lineTo((view.xPct(T[i]) / 100) * W, yOf(score[i] ?? 0));
    ctx.lineTo((view.xPct(T[i1]) / 100) * W, H);
    ctx.closePath();
    ctx.fillStyle = css.getPropertyValue('--fg').trim() + '10';
    ctx.fill();
  }
  const series: [string, string, number][] = [
    ['score', css.getPropertyValue('--fg'), 1.25],
    ['nLean', css.getPropertyValue('--corner'), 1],
    ['nAccel', css.getPropertyValue('--brake'), 1],
  ];
  for (const [key, color, w] of series) {
    const arr = editor.data[key];
    if (!arr) continue;
    ctx.strokeStyle = color;
    ctx.globalAlpha = key === 'score' ? 0.7 : 0.75;
    ctx.lineWidth = w * dpr;
    ctx.beginPath();
    let started = false;
    for (let i = i0; i <= i1; i += stride) {
      const v = arr[i];
      if (v === null) {
        started = false;
        continue;
      }
      const x = (view.xPct(T[i]) / 100) * W;
      const y = yOf(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawStrip(): void {
  if (!stripCv.value) return;
  const { ctx, W, H } = canvasSetup(stripCv.value);
  const img = stripImg.value;
  const meta = editor.filmstrip;
  if (!img || !meta || !img.complete) return;
  const pxPerSec = W / view.span.value;
  const thumbW = H;
  const secPerThumb = thumbW / pxPerSec;
  for (
    let t = Math.floor(view.t0.value / secPerThumb) * secPerThumb;
    t < view.t1.value;
    t += secPerThumb
  ) {
    const i = Math.min(meta.n - 1, Math.max(0, Math.round((t + secPerThumb / 2) / meta.step)));
    ctx.drawImage(
      img,
      i * meta.size,
      0,
      meta.size,
      meta.size,
      (view.xPct(t) / 100) * W,
      0,
      thumbW + 1,
      H,
    );
  }
}
function drawAll(): void {
  drawRuler();
  drawScore();
  drawStrip();
}
watch(
  () => editor.filmstrip,
  (f) => {
    stripImg.value = null;
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      stripImg.value = img;
      drawStrip();
    };
    img.src = f.url;
  },
);
watch([() => view.t0.value, () => view.t1.value, () => editor.threshold, () => editor.data], () =>
  nextTick(drawAll),
);
watch(
  () => editor.stem,
  () => view.fit(),
);
watch(
  () => editor.duration,
  () => view.fit(),
  { immediate: true },
);
watch(
  () => editor.time,
  (t) => editor.playing && view.follow(t),
);
/** Clicking anywhere that is not a block, the toolbar, or a part row clears the selection. */
function onGlobalDown(e: MouseEvent): void {
  if (!editor.selection.length) return;
  const t = e.target as HTMLElement;
  if (t.closest('[data-keep-selection]')) return;
  editor.clearSelection();
}
onMounted(() => {
  document.addEventListener('mousedown', onGlobalDown);
  new ResizeObserver(() => {
    laneW.value = lane.value?.clientWidth ?? 0;
    drawAll();
  }).observe(lane.value as Element);
  new MutationObserver(drawAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
});

// ---- interaction
function scrub(e: MouseEvent): void {
  const el = lane.value!;
  const seekTo = (ev: MouseEvent): void =>
    emit('seek', Math.max(0, Math.min(duration.value, view.tOfEvent(ev, el))));
  seekTo(e);
  const move = (ev: MouseEvent): void => seekTo(ev);
  const up = (): void => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
function laneDown(e: MouseEvent): void {
  editor.clearSelection();
  scrub(e);
}
function blockDown(e: MouseEvent, p: Part): void {
  editor.select(p.id, e.shiftKey || e.ctrlKey);
}
/** Keyboard on a focused block: arrows move to the neighbour, Enter plays, Space toggles, Delete removes. */
function blockKey(e: KeyboardEvent, p: Part): void {
  const sorted = [...editor.parts].sort((a, b) => a.start_s - b.start_s);
  const i = sorted.findIndex((x) => x.id === p.id);
  const focusPart = (q: Part | undefined): void => {
    if (!q) return;
    editor.select(q.id);
    (lane.value?.querySelector(`[data-part="${q.id}"]`) as HTMLElement | null)?.focus();
  };
  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      focusPart(sorted[i + 1]);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      focusPart(sorted[i - 1]);
      break;
    case 'Enter':
      e.preventDefault();
      emit('play', p.start_s);
      break;
    case ' ':
      e.preventDefault();
      editor.setEnabled([p], !p.enabled);
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      editor.remove([p]);
      toast('Part deleted — Ctrl+Z brings it back');
      break;
  }
}
// ---- snapping (Settings → Editing, off by default; Alt inverts while dragging)
const SNAP_PX = 8;
/** the time the dragged edge snapped to, for the guide line; null when free */
const snapT = ref<number | null>(null);
/** candidate times: auto segment boundaries, score valleys under the threshold, other parts' edges */
const snapTargets = computed<number[]>(() => {
  const out: number[] = [];
  for (const a of editor.auto) out.push(a.start_s, a.end_s);
  for (const p of editor.parts) out.push(p.start_s, p.end_s);
  const t = editor.data.t as number[] | undefined;
  const score = editor.data.score as (number | null)[] | undefined;
  if (t && score) {
    for (let i = 1; i < score.length - 1; i++) {
      const s = score[i];
      if (s === null || s >= editor.threshold) continue;
      if (s <= (score[i - 1] ?? Infinity) && s < (score[i + 1] ?? Infinity)) out.push(t[i]);
    }
  }
  return out;
});
function snap(t: number, ev: MouseEvent, exclude: Part): number {
  const on = (settings.settings?.snapping ?? false) !== ev.altKey;
  if (!on || !lane.value) {
    snapT.value = null;
    return t;
  }
  const secPerPx = view.span.value / lane.value.clientWidth;
  const tol = SNAP_PX * secPerPx;
  let best = t;
  let bestD = tol;
  const consider = (c: number): void => {
    const d = Math.abs(c - t);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  };
  for (const c of snapTargets.value) if (c !== exclude.start_s && c !== exclude.end_s) consider(c);
  consider(Math.round(t));
  snapT.value = best === t ? null : best;
  return best;
}
function dragEdge(_e: MouseEvent, p: Part, edge: 'start_s' | 'end_s'): void {
  editor.select(p.id);
  editor.snapshot();
  dragging.value = true;
  const el = lane.value!;
  const move = (ev: MouseEvent): void =>
    editor.setEdge(p, edge, snap(view.tOfEvent(ev, el), ev, p));
  const up = (): void => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    dragging.value = false;
    snapT.value = null;
    editor.save();
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
const sel = computed(() => editor.selectedParts);
const allOn = computed(() => sel.value.every((p) => p.enabled));
/** toolbar centred above the selection but never outside the lane (one line, no wrapping) */
const toolbarLeft = computed(() => {
  if (!sel.value.length || !lane.value) return 0;
  const a = Math.min(...sel.value.map((p) => p.start_s));
  const b = Math.max(...sel.value.map((p) => p.end_s));
  const laneW = lane.value.clientWidth;
  const tbW = toolbar.value?.offsetWidth ?? 320;
  const center = (view.xPct((a + b) / 2) / 100) * laneW;
  return Math.max(tbW / 2 + 4, Math.min(laneW - tbW / 2 - 4, center));
});
function joinSel(): void {
  const merged = editor.join(sel.value);
  if (merged) toast(`Joined into one part of ${fmtDuration(merged.end_s - merged.start_s)}`);
}
function joinNext(p: Part): void {
  const n = editor.nextOf(p);
  if (n) {
    const merged = editor.join([p, n]);
    if (merged) toast(`Joined into one part of ${fmtDuration(merged.end_s - merged.start_s)}`);
  }
}
function del(): void {
  editor.remove(sel.value);
  toast('Part deleted — Ctrl+Z brings it back');
}
const hoverVals = computed(() => {
  if (hoverT.value === null || !editor.data.t) return null;
  const i = Math.max(0, Math.min(editor.data.t.length - 1, Math.round(hoverT.value * 10)));
  const lean = editor.data.leanDeg?.[i];
  const acc = editor.data.aLonG?.[i] ?? 0;
  const sc = editor.data.score?.[i] ?? 0;
  if (lean === null || lean === undefined) return null;
  return {
    lean: Math.abs(lean).toFixed(0),
    acc: Math.abs(acc ?? 0).toFixed(2),
    accLabel: (acc ?? 0) < -0.05 ? 'braking' : (acc ?? 0) > 0.05 ? 'accelerating' : 'steady',
    score: (sc ?? 0).toFixed(2),
  };
});
const zoomInput = computed({
  get: () => view.zoom.value,
  set: (z: number) => view.setZoom(z, editor.time),
});
</script>

<template>
  <footer
    class="panel flex h-[300px] flex-none flex-col overflow-hidden border-t border-line select-none"
  >
    <!-- ruler -->
    <div class="relative h-5 cursor-pointer border-b border-line bg-bg0" @mousedown="scrub">
      <canvas ref="rulerCv" class="block h-full w-full" />
      <!-- playhead head -->
      <div
        class="pointer-events-none absolute top-0 z-[3] -translate-x-1/2"
        :style="{ left: `${view.xPct(editor.time)}%` }"
      >
        <div class="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-play" />
      </div>
    </div>
    <!-- score lane -->
    <div
      class="relative h-10 border-b border-line bg-bg1"
      @mousedown="scrub"
      @mousemove="hoverT = view.tOfEvent($event, lane!)"
      @mouseleave="hoverT = null"
    >
      <canvas ref="scoreCv" class="block h-full w-full" />
      <div
        class="pointer-events-none absolute inset-y-0 w-px bg-play"
        :style="{ left: `${view.xPct(editor.time)}%` }"
      />
      <template v-if="hoverT !== null && hoverVals">
        <div
          class="pointer-events-none absolute inset-y-0 w-px bg-fg/40"
          :style="{ left: `${view.xPct(hoverT)}%` }"
        />
        <div
          class="chip num pointer-events-none absolute top-[calc(100%+6px)] z-10 -translate-x-1/2 px-2 py-1 text-[11px] leading-[1.5] whitespace-nowrap"
          :style="{ left: `${Math.min(85, Math.max(8, view.xPct(hoverT)))}%` }"
        >
          <b>{{ fmtTime(hoverT) }}</b> · score {{ hoverVals.score }}<br />
          <span class="mr-1 inline-block h-2 w-2 rounded-[1px] bg-corner align-[-1px]" />lean
          {{ hoverVals.lean }}°
          <span class="mr-1 ml-2 inline-block h-2 w-2 rounded-[1px] bg-brake align-[-1px]" />{{
            hoverVals.accLabel
          }}
          {{ hoverVals.acc }} g
        </div>
      </template>
    </div>
    <!-- parts lane -->
    <div
      ref="lane"
      class="relative flex-1 bg-bg1"
      data-tour="parts"
      @mousedown.self="laneDown"
      @wheel="view.onWheel($event, lane!)"
    >
      <canvas
        ref="stripCv"
        class="strip pointer-events-none absolute inset-0 h-full w-full saturate-[.6]"
      />
      <div
        v-for="p in editor.parts"
        :key="p.id"
        class="absolute top-2.5 bottom-2.5 z-[1] flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-block pr-2 pl-2 text-xs whitespace-nowrap text-fg [mask-image:linear-gradient(90deg,#000_calc(100%-10px),transparent)]"
        :class="[
          cls(p),
          {
            'opacity-45 [border-left-style:dashed]': !p.enabled,
            'ring-1 ring-sel ring-inset': editor.selection.includes(p.id),
          },
        ]"
        :style="{
          left: `${view.xPct(p.start_s)}%`,
          width: `${Math.max(0.2, view.xPct(p.end_s) - view.xPct(p.start_s))}%`,
        }"
        data-keep-selection
        :data-part="p.id"
        tabindex="0"
        role="button"
        :aria-label="`${REASON_LABEL[reasonOf(p)]}, ${fmtTime(p.start_s)} to ${fmtTime(p.end_s)}${p.enabled ? '' : ', left out'}`"
        :aria-pressed="editor.selection.includes(p.id)"
        @mousedown.stop="blockDown($event, p)"
        @dblclick="emit('play', p.start_s)"
        @focus="editor.select(p.id)"
        @keydown="blockKey($event, p)"
        @mouseenter="editor.hoverId = p.id"
        @mouseleave="editor.hoverId = null"
      >
        <div
          class="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize"
          @mousedown.stop="dragEdge($event, p, 'start_s')"
        />
        <template v-if="label(p) !== 'none'">
          <PhStar v-if="p.starred" :size="11" weight="fill" class="flex-none" />
          <b class="font-semibold">{{ REASON_LABEL[reasonOf(p)] }}</b>
          <span v-if="label(p) === 'full'" class="num text-fg2">
            {{ fmtDuration(p.end_s - p.start_s) }}
          </span>
        </template>
        <PhStar v-else-if="p.starred" :size="9" weight="fill" class="absolute top-1 right-1" />
        <div
          class="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize before:absolute before:top-[30%] before:right-[3px] before:bottom-[30%] before:w-px before:bg-fg/40 before:content-['']"
          @mousedown.stop="dragEdge($event, p, 'end_s')"
        />
      </div>
      <div
        v-for="g in editor.suggestions"
        :key="g.id"
        class="absolute top-0.5 z-[4] flex h-[10px] cursor-pointer items-center justify-center overflow-hidden rounded-[2px] border border-dashed border-corner/70 text-[10px] leading-none whitespace-nowrap text-fg2 transition-colors hover:bg-corner hover:text-black"
        :style="{
          left: `${view.xPct(g.from)}%`,
          width: `${Math.max(0.3, view.xPct(g.to) - view.xPct(g.from))}%`,
        }"
        :title="`These ${g.parts.length} parts probably belong together. Click to join them into one continuous part.`"
        @mousedown.stop
        @click.stop="editor.join(g.parts) && toast(`Joined ${g.parts.length} parts`)"
      >
        Join {{ g.parts.length }}
      </div>
      <div
        class="pointer-events-none absolute inset-y-0 z-[3] w-px bg-play"
        :style="{ left: `${view.xPct(editor.time)}%` }"
      />
      <!-- snap guide: where the dragged edge clicked into place -->
      <div
        v-if="snapT !== null"
        class="pointer-events-none absolute inset-y-0 z-[3] w-px bg-fg/70"
        :style="{ left: `${view.xPct(snapT)}%` }"
      />
      <div
        v-if="sel.length && !dragging"
        ref="toolbar"
        class="chip absolute top-2.5 z-[5] flex -translate-x-1/2 -translate-y-[115%] gap-0.5 p-0.5 whitespace-nowrap"
        :style="{ left: `${toolbarLeft}px` }"
        data-keep-selection
        @mousedown.stop
      >
        <button class="chip-btn" @click="emit('play', Math.min(...sel.map((p) => p.start_s)))">
          Play
        </button>
        <button
          class="chip-btn"
          :title="
            allOn
              ? 'Skip this part; it turns grey and is left out of the movie'
              : 'Put this part back in the movie'
          "
          @click="editor.setEnabled(sel, !allOn)"
        >
          {{ allOn ? 'Leave out' : 'Put back in' }}
        </button>
        <button
          class="chip-btn"
          :title="
            sel.every((p) => p.starred)
              ? 'Remove the star'
              : 'Star it: kept by automatic picks, exportable on its own (F)'
          "
          @click="editor.toggleStar(sel)"
        >
          <PhStar :size="12" :weight="sel.every((p) => p.starred) ? 'fill' : 'regular'" />
          {{ sel.every((p) => p.starred) ? 'Unstar' : 'Star' }}
        </button>
        <button
          v-if="sel.length > 1"
          class="chip-btn bg-white font-semibold text-black hover:bg-white/90"
          @click="joinSel"
        >
          Join
        </button>
        <button
          v-else-if="editor.nextOf(sel[0])"
          class="chip-btn"
          title="Join with the next part (including the gap)"
          @click="joinNext(sel[0])"
        >
          Join with next
        </button>
        <button class="chip-btn text-[#ff8080]" @click="del">Delete</button>
      </div>
    </div>
    <MusicLane />
    <!-- legend / zoom -->
    <div
      class="num flex h-7 flex-none items-center gap-3.5 border-t border-line px-3 text-[11px] text-fg2"
    >
      <span
        ><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-fg align-[-1px]" />score</span
      >
      <span
        ><span
          class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-corner align-[-1px]"
        />leaning</span
      >
      <span
        ><span class="mr-1.5 inline-block h-2 w-2 rounded-[1px] bg-brake align-[-1px]" />braking
        &amp; acceleration</span
      >
      <span
        ><span class="mr-1.5 inline-block w-3 border-t border-dashed border-fg3 align-[2px]" />“fun
        enough” line</span
      >
      <span class="flex-1" />
      <b class="font-semibold text-fg"
        >{{ plural(editor.enabledParts.length, 'part') }} · movie
        {{ fmtDuration(editor.movieLength) }}</b
      >
      <label class="flex items-center gap-1.5">
        Zoom
        <input
          v-model.number="zoomInput"
          type="range"
          min="0"
          max="0.98"
          step="0.01"
          class="w-[100px]"
          aria-label="Zoom"
        />
      </label>
      <button class="btn btn-mini" @click="view.fit()">Fit</button>
      <button
        class="btn btn-ghost btn-mini px-1"
        title="click a block = select · shift+click = select more · drag the edges · scroll = zoom · shift+scroll = pan"
        aria-label="Timeline help: click a block to select, shift-click to select more, drag the edges, scroll to zoom, shift-scroll to pan"
      >
        <PhQuestion :size="13" />
      </button>
    </div>
  </footer>
</template>
