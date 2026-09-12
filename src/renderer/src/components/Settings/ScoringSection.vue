<script setup lang="ts">
/**
 * Advanced: the scoring knobs, applied to the open video (rescore from cached signals). Every knob
 * carries the plain-words meaning first and the technical name after it, so a rider can read the
 * page and a tinkerer still knows which number they are turning (docs/scoring.md).
 */
import { computed, ref } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const editor = useEditorStore();

interface Field {
  path: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  /** how the value reads next to the slider */
  unit?: string;
}
interface Group {
  title: string;
  intro: string;
  fields: Field[];
}

const GROUPS: Group[] = [
  {
    title: 'What makes a moment fun',
    intro:
      'Every tenth of a second gets a score. These three say how much each kind of riding counts towards it.',
    fields: [
      {
        path: 'weights.lean',
        label: 'Leaning over',
        hint: 'How much lean angle counts (weight for the lean signal).',
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        path: 'weights.yaw',
        label: 'Turning the bike',
        hint: 'How much changing direction counts (weight for the yaw rate).',
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        path: 'weights.accel',
        label: 'Braking and pulling away',
        hint: 'How much speeding up and slowing down counts (weight for lengthways acceleration).',
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  {
    title: 'How much gets picked',
    intro: 'Where the “fun enough” line sits and how long a part has to be to be worth keeping.',
    fields: [
      {
        path: 'threshold_pct',
        label: 'Fun enough from',
        hint: 'Higher = fewer, better parts. It is a percentile of the score of this ride, so it follows the ride itself (threshold_pct).',
        min: 50,
        max: 97,
        step: 1,
        unit: '%',
      },
      {
        path: 'min_dur_s',
        label: 'Shortest part',
        hint: 'Anything shorter than this is dropped (min_dur_s).',
        min: 2,
        max: 20,
        step: 0.5,
        unit: 's',
      },
      {
        path: 'merge_gap_s',
        label: 'Glue parts closer than',
        hint: 'Two parts with a shorter gap between them become one (merge_gap_s).',
        min: 0,
        max: 10,
        step: 0.5,
        unit: 's',
      },
      {
        path: 'pad_s',
        label: 'Extra before and after',
        hint: 'Seconds kept around the action so a part does not start mid-corner (pad_s).',
        min: 0,
        max: 5,
        step: 0.5,
        unit: 's',
      },
      {
        path: 'smooth_s',
        label: 'Steadiness',
        hint: 'Over how many seconds the score is averaged. Higher = longer, calmer parts; lower = it reacts to every twitch (smooth_s).',
        min: 1,
        max: 10,
        step: 0.5,
        unit: 's',
      },
    ],
  },
  {
    title: 'What to ignore',
    intro:
      'Filters that keep the car park, the traffic lights and the motorway out of your movie. Below the low value nothing counts, above the high value it counts fully.',
    fields: [
      {
        path: 'speed_gate_lo_mps',
        label: 'Too slow below',
        hint: 'Walking pace and standing still never count (speed_gate_lo_mps, metres per second).',
        min: 0,
        max: 10,
        step: 0.5,
        unit: 'm/s',
      },
      {
        path: 'speed_gate_hi_mps',
        label: 'Full speed from',
        hint: 'From here the speed filter is fully open (speed_gate_hi_mps, metres per second).',
        min: 1,
        max: 15,
        step: 0.5,
        unit: 'm/s',
      },
      {
        path: 'accel_near_lean_s',
        label: 'Braking counts near a corner within',
        hint: 'Braking and acceleration only count this close to leaning — unless you switched acceleration pulls on in the Ride panel (accel_near_lean_s).',
        min: 0,
        max: 15,
        step: 1,
        unit: 's',
      },
      {
        path: 'lean_yaw_lo_dps',
        label: 'Leaning needs turning from',
        hint: 'Lean while the bike is not turning (a cambered road, a bumpy surface) does not count (lean_yaw_lo_dps, degrees per second).',
        min: 0,
        max: 10,
        step: 0.5,
        unit: '°/s',
      },
      {
        path: 'lean_yaw_hi_dps',
        label: 'Really turning from',
        hint: 'From here leaning counts fully (lean_yaw_hi_dps, degrees per second).',
        min: 1,
        max: 20,
        step: 0.5,
        unit: '°/s',
      },
    ],
  },
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
const changed = computed(() => Object.keys(draft.value).length);
async function apply(): Promise<void> {
  const patch: Record<string, unknown> = {};
  const weights: Record<string, number> = {};
  for (const [k, v] of Object.entries(draft.value)) {
    if (k.startsWith('weights.')) weights[k.slice(8)] = v;
    else patch[k] = v;
  }
  if (Object.keys(weights).length) patch.weights = weights;
  const before = editor.parts.length;
  await editor.rescore(patch);
  draft.value = {};
  toast(`${editor.parts.length} parts in this video (was ${before})`);
}
async function reset(): Promise<void> {
  draft.value = {};
  const m = await import('@core/score');
  await editor.rescore({ ...(m.DEFAULT_CONFIG as unknown as Record<string, unknown>) });
  toast('Back to the standard settings');
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-[13px] text-fg2">
      How ApexCut decides what counts as a fun part. Most riders never need this — the Ride panel's
      “How picky?” does the same job in one slider. Changes apply to the open video; your own added
      and joined parts stay.
    </p>
    <div v-if="!editor.config" class="card text-[13px] text-fg2">Open a scanned video first.</div>
    <template v-else>
      <div v-for="g in GROUPS" :key="g.title" class="card">
        <h4 class="label-caps m-0">{{ g.title }}</h4>
        <p class="m-0 mt-1 mb-2 text-xs text-fg2">{{ g.intro }}</p>
        <div class="flex flex-col gap-2.5">
          <div v-for="f in g.fields" :key="f.path">
            <label :for="`cfg-${f.path}`" class="flex items-baseline gap-2 text-[13px]">
              <span class="min-w-0 flex-1 text-fg">{{ f.label }}</span>
              <input
                type="number"
                class="num w-[78px] rounded-ctl border border-line bg-bg2 px-1.5 py-0.5 text-right text-fg"
                :step="f.step"
                :min="f.min"
                :max="f.max"
                :value="get(f.path)"
                :aria-label="f.label"
                @change="set(f.path, Number(($event.target as HTMLInputElement).value))"
              />
              <span class="num w-8 flex-none text-xs text-fg3">{{ f.unit ?? '' }}</span>
            </label>
            <input
              :id="`cfg-${f.path}`"
              type="range"
              class="mt-1 w-full"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              :value="get(f.path)"
              :aria-label="f.label"
              @input="set(f.path, Number(($event.target as HTMLInputElement).value))"
            />
            <p class="m-0 text-xs text-fg3">{{ f.hint }}</p>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn btn-pri" :disabled="!changed" @click="apply">
          Try it on this video
        </button>
        <button class="btn" @click="reset">Back to the standard settings</button>
        <span v-if="changed" class="text-xs text-fg2">
          {{ changed }} change{{ changed === 1 ? '' : 's' }} waiting
        </span>
      </div>
    </template>
  </div>
</template>
