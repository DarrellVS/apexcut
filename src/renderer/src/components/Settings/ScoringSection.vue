<script setup lang="ts">
/** Advanced: the scoring knobs, applied to the open video (rescore from cached signals). */
import { computed, ref } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const editor = useEditorStore();

const FIELDS: [string, string, number, number, number][] = [
  ['weights.lean', 'weight: leaning', 0, 1, 0.05],
  ['weights.yaw', 'weight: steering', 0, 1, 0.05],
  ['weights.accel', 'weight: braking/acceleration', 0, 1, 0.05],
  ['threshold_pct', 'threshold (higher = fewer parts)', 50, 97, 1],
  ['min_dur_s', 'minimum length of a part (s)', 2, 20, 0.5],
  ['smooth_s', 'smoothing (s)', 1, 10, 0.5],
  ['merge_gap_s', 'join when gap is shorter than (s)', 0, 10, 0.5],
  ['pad_s', 'extra seconds before/after', 0, 5, 0.5],
  ['speed_gate_lo_mps', 'speed filter low', 0, 10, 0.5],
  ['speed_gate_hi_mps', 'speed filter high', 1, 15, 0.5],
  ['accel_near_lean_s', 'braking only counts near a corner within (s)', 0, 15, 1],
  ['lean_yaw_lo_dps', 'corner filter steering low (°/s)', 0, 10, 0.5],
  ['lean_yaw_hi_dps', 'corner filter steering high (°/s)', 1, 20, 0.5],
];
const draft = ref<Record<string, number>>({});
const cfg = computed(() => editor.config as unknown as Record<string, unknown> | null);
function get(path: string): number {
  if (path in draft.value) return draft.value[path];
  const [a, b] = path.split('.');
  const v = b
    ? (cfg.value?.[a] as Record<string, number> | undefined)?.[b]
    : (cfg.value?.[a] as number | undefined);
  return v ?? 0;
}
function set(path: string, v: number): void {
  draft.value[path] = v;
}
async function apply(): Promise<void> {
  const patch: Record<string, unknown> = {};
  const weights: Record<string, number> = {};
  for (const [k, v] of Object.entries(draft.value)) {
    if (k.startsWith('weights.')) weights[k.slice(8)] = v;
    else patch[k] = v;
  }
  if (Object.keys(weights).length) patch.weights = weights;
  await editor.rescore(patch);
  draft.value = {};
  toast(`${editor.parts.length} parts`);
}
async function reset(): Promise<void> {
  draft.value = {};
  const m = await import('@core/score');
  await editor.rescore({ ...(m.DEFAULT_CONFIG as unknown as Record<string, unknown>) });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-sm text-muted">
      How ApexCut decides what counts as a fun part. Changes apply to the open video; your own added
      and joined parts stay.
    </p>
    <div v-if="!editor.config" class="card text-sm text-muted">Open a scanned video first.</div>
    <template v-else>
      <div class="card grid grid-cols-[1fr_72px] items-center gap-x-3 gap-y-1 text-xs">
        <template v-for="[path, label, min, max, step] in FIELDS" :key="path">
          <label :for="`cfg-${path}`" class="col-span-2 mt-1.5 text-muted">{{ label }}</label>
          <input
            :id="`cfg-${path}`"
            type="range"
            :min="min"
            :max="max"
            :step="step"
            :value="get(path)"
            @input="set(path, Number(($event.target as HTMLInputElement).value))"
          />
          <input
            type="number"
            class="w-[72px] rounded border border-line bg-s2 px-1.5 py-0.5 text-fg"
            :step="step"
            :value="get(path)"
            :aria-label="label"
            @change="set(path, Number(($event.target as HTMLInputElement).value))"
          />
        </template>
      </div>
      <div class="flex gap-1.5">
        <button class="btn btn-pri" :disabled="!Object.keys(draft).length" @click="apply">
          Recalculate
        </button>
        <button class="btn" @click="reset">Back to defaults</button>
      </div>
    </template>
  </div>
</template>
