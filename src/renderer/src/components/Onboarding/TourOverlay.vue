<script setup lang="ts">
/**
 * Three-step first-run tour: a spotlight on one element at a time (parts lane, Preview, Make my
 * movie) with a floating card that never wraps and stays inside the window. Skip/Done remember it.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUiStore } from '@renderer/stores/ui';

const ui = useUiStore();
const settings = useSettingsStore();

interface Step {
  target: string;
  title: string;
  text: string;
  /** where the card goes relative to the target */
  place: 'above' | 'below';
}
const STEPS: Step[] = [
  {
    target: '[data-tour="parts"]',
    title: 'These blocks are your parts',
    text: 'Click one to see why it was picked. Drag its edges to make it longer or shorter, or drag the block itself to move it.',
    place: 'above',
  },
  {
    target: '[data-tour="preview"]',
    title: 'Preview plays only your parts',
    text: 'Back to back, the way your movie will be. Untick a part to leave it out.',
    place: 'above',
  },
  {
    target: '[data-tour="make"]',
    title: 'Make my movie exports it',
    text: 'Pick a format first in the Movie tab on the right — square, widescreen or vertical for your phone.',
    place: 'below',
  },
];

const step = ref(0);
const rect = ref<DOMRect | null>(null);
const PAD = 8;
const CARD_W = 340;

function measure(): void {
  const el = document.querySelector<HTMLElement>(STEPS[step.value].target);
  rect.value = el ? el.getBoundingClientRect() : null;
}
const spot = computed(() => {
  const r = rect.value;
  if (!r) return null;
  return {
    left: r.left - PAD,
    top: r.top - PAD,
    width: r.width + 2 * PAD,
    height: r.height + 2 * PAD,
  };
});
const cardStyle = computed(() => {
  const s = spot.value;
  if (!s) return { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' };
  const cx = s.left + s.width / 2;
  const left = Math.max(12, Math.min(window.innerWidth - CARD_W - 12, cx - CARD_W / 2));
  const place = STEPS[step.value].place;
  return place === 'above'
    ? { left: `${left}px`, bottom: `${window.innerHeight - s.top + 12}px` }
    : { left: `${left}px`, top: `${s.top + s.height + 12}px` };
});

async function finish(): Promise<void> {
  ui.tourActive = false;
  step.value = 0;
  await settings.update({ tourSeen: true });
}
function next(): void {
  if (step.value >= STEPS.length - 1) finish();
  else step.value++;
}
function onKey(e: KeyboardEvent): void {
  if (!ui.tourActive) return;
  if (e.key === 'Escape') finish();
  if (e.key === 'Enter' || e.key === 'ArrowRight') next();
}
let ro: ResizeObserver | null = null;
watch(
  () => [ui.tourActive, step.value],
  async () => {
    await nextTick();
    measure();
  },
);
onMounted(() => {
  ro = new ResizeObserver(measure);
  ro.observe(document.body);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', measure);
});
onUnmounted(() => {
  ro?.disconnect();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div v-if="ui.tourActive" class="fixed inset-0 z-[55]" role="dialog" aria-label="Quick tour">
    <!-- spotlight: the hole is the target, the giant shadow dims everything else -->
    <div
      v-if="spot"
      class="absolute rounded-[12px] shadow-[0_0_0_9999px_rgba(0,0,0,.6)] ring-2 ring-white/80 transition-all duration-300"
      :style="{
        left: `${spot.left}px`,
        top: `${spot.top}px`,
        width: `${spot.width}px`,
        height: `${spot.height}px`,
      }"
    />
    <div v-else class="absolute inset-0 bg-black/60" />
    <div
      class="popover absolute flex w-[340px] flex-col gap-2 rounded-[14px] p-4 shadow-float"
      :style="cardStyle"
    >
      <div class="flex items-center gap-1.5">
        <span
          v-for="(s, i) in STEPS"
          :key="s.title"
          class="h-1.5 rounded-full transition-all"
          :class="i === step ? 'w-5 bg-acc2' : 'w-1.5 bg-s3'"
        />
        <span class="ml-auto text-[11px] text-muted">{{ step + 1 }} of {{ STEPS.length }}</span>
      </div>
      <b class="text-[15px] text-fg">{{ STEPS[step].title }}</b>
      <p class="m-0 text-sm text-muted">{{ STEPS[step].text }}</p>
      <div class="mt-1 flex items-center gap-2">
        <button class="btn btn-ghost btn-mini" @click="finish">Skip</button>
        <button class="btn btn-pri btn-mini ml-auto" autofocus @click="next">
          {{ step === STEPS.length - 1 ? 'Done' : 'Next' }}
        </button>
      </div>
    </div>
  </div>
</template>
