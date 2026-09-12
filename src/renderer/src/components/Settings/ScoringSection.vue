<script setup lang="ts">
/**
 * Advanced: the scoring knobs, applied to the open video (rescore from cached signals). Every knob
 * carries the plain-words meaning first and the technical name after it, so a rider can read the
 * page and a tinkerer still knows which number they are turning (docs/scoring.md).
 */
import { computed, ref } from 'vue';
import { GROUPS } from '@renderer/settings/scoringFields';
import { useEditorStore } from '@renderer/stores/editor';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const editor = useEditorStore();

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
