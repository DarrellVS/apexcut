<script setup lang="ts">
/**
 * The three numbers of the open video — sharpest lean, hardest braking, twistiest minute — each a
 * button that takes you there. They are read from the 10 Hz signals of the scan.
 */
import { computed } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { fmtTime } from '@renderer/utils/format';

const emit = defineEmits<{ play: [t: number] }>();
const editor = useEditorStore();

const numbers = computed(() => {
  const lean = editor.data.leanDeg as (number | null)[] | undefined;
  const aLon = editor.data.aLonG as (number | null)[] | undefined;
  const t = editor.data.t as number[] | undefined;
  if (!lean || !aLon || !t || !t.length) return null;
  let maxLean = 0;
  let maxLeanT = 0;
  let maxBrake = 0;
  let maxBrakeT = 0;
  for (let i = 0; i < t.length; i++) {
    const l = Math.abs(lean[i] ?? 0);
    if (l > maxLean) {
      maxLean = l;
      maxLeanT = t[i];
    }
    const b = -(aLon[i] ?? 0);
    if (b > maxBrake) {
      maxBrake = b;
      maxBrakeT = t[i];
    }
  }
  // twistiest minute: 60 s window with the most time above 10° of lean
  const win = 600;
  let best = 0;
  let bestT = 0;
  let run = 0;
  for (let i = 0; i < t.length; i++) {
    run += Math.abs(lean[i] ?? 0) > 10 ? 1 : 0;
    if (i >= win) run -= Math.abs(lean[i - win] ?? 0) > 10 ? 1 : 0;
    if (run > best) {
      best = run;
      bestT = Math.max(0, t[i] - 60);
    }
  }
  return {
    maxLean,
    maxLeanT,
    maxBrake,
    maxBrakeT,
    twistyT: bestT,
    twistyPct: Math.round((best / win) * 100),
  };
});

/** the three rows: what it says, what it is worth, and where it happened */
const rows = computed(() => {
  const n = numbers.value;
  if (!n) return [];
  return [
    {
      label: `Sharpest lean · ${fmtTime(n.maxLeanT)}`,
      value: `${Math.round(n.maxLean)}°`,
      at: Math.max(0, n.maxLeanT - 3),
    },
    {
      label: `Hardest braking · ${fmtTime(n.maxBrakeT)}`,
      value: `${n.maxBrake.toFixed(2)} g`,
      at: Math.max(0, n.maxBrakeT - 3),
    },
    {
      label: `Twistiest minute · leaning ${n.twistyPct}%`,
      value: fmtTime(n.twistyT),
      at: n.twistyT,
    },
  ];
});
</script>

<template>
  <section v-if="rows.length" class="border-b border-line p-2.5">
    <dl class="num m-0 grid grid-cols-[1fr_auto] gap-x-3 text-xs">
      <button
        v-for="r in rows"
        :key="r.label"
        class="col-span-2 grid grid-cols-subgrid items-baseline rounded-ctl px-1.5 py-0.5 text-left hover:bg-bg3"
        title="Jump there"
        @click="emit('play', r.at)"
      >
        <dt class="text-fg2">{{ r.label }}</dt>
        <dd class="m-0 font-semibold text-fg">{{ r.value }}</dd>
      </button>
    </dl>
  </section>
</template>
