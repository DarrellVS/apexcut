<script setup lang="ts">
/** Settings tab: appearance, output folder, this video (rescan, EDL), advanced scoring. */
import { computed, ref } from 'vue';
import type { Theme } from '@shared/ipc';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const editor = useEditorStore();
const library = useLibraryStore();
const settings = useSettingsStore();

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
  await editor.rescore({ ...(await defaults()) });
}
async function defaults(): Promise<Record<string, unknown>> {
  const m = await import('@core/score');
  return m.DEFAULT_CONFIG as unknown as Record<string, unknown>;
}
async function rescan(): Promise<void> {
  if (!editor.stem) return;
  await window.apexcut.analysis.run([editor.stem]);
  toast('Scanning again…');
}
async function exportEdl(): Promise<void> {
  if (!editor.stem) return;
  const r = await window.apexcut.exporter.edl(editor.stem);
  toast(`EDL saved: ${r.file}`, 5000);
}
async function pickOutput(): Promise<void> {
  const r = await window.apexcut.library.pick('dir');
  // pick() adds videos; for the output folder we only want the path — reuse the dialog result via settings
  void r;
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="card">
      <h4 class="label-caps m-0 mb-2">Appearance</h4>
      <div class="flex gap-1.5">
        <button
          v-for="t in ['system', 'light', 'dark'] as Theme[]"
          :key="t"
          class="btn btn-mini capitalize"
          :class="{ 'bg-s3 font-semibold': settings.settings?.theme === t }"
          @click="settings.update({ theme: t })"
        >
          {{ t }}
        </button>
      </div>
    </div>
    <div class="card">
      <h4 class="label-caps m-0 mb-2">Output folder</h4>
      <div class="text-xs break-all text-muted">
        {{ settings.settings?.outputDir ?? 'Videos\\ApexCut (default)' }}
      </div>
      <button
        v-if="settings.settings?.outputDir"
        class="btn btn-mini mt-2"
        @click="settings.update({ outputDir: null })"
      >
        Use default
      </button>
      <button v-else class="btn btn-mini mt-2" disabled title="Coming soon" @click="pickOutput">
        Change…
      </button>
    </div>
    <div v-if="editor.stem" class="card">
      <h4 class="label-caps m-0 mb-2">This video</h4>
      <div class="flex flex-wrap gap-1.5">
        <button class="btn btn-mini" @click="rescan">Scan again</button>
        <button class="btn btn-mini" @click="exportEdl">
          Export for DaVinci Resolve / Premiere
        </button>
        <button class="btn btn-mini text-play" @click="library.remove(editor.stem!)">
          Remove from list
        </button>
      </div>
    </div>
    <details v-if="editor.config">
      <summary class="cursor-pointer text-[13px] text-muted">
        Advanced: how parts are picked
      </summary>
      <div class="mt-2 grid grid-cols-[1fr_60px] items-center gap-x-2 gap-y-1 text-xs">
        <template v-for="[path, label, min, max, step] in FIELDS" :key="path">
          <label class="col-span-2 mt-1.5 text-muted">{{ label }}</label>
          <input
            type="range"
            :min="min"
            :max="max"
            :step="step"
            :value="get(path)"
            @input="set(path, Number(($event.target as HTMLInputElement).value))"
          />
          <input
            type="number"
            class="w-[60px] rounded border border-line bg-s2 px-1.5 py-0.5 text-fg"
            :step="step"
            :value="get(path)"
            @change="set(path, Number(($event.target as HTMLInputElement).value))"
          />
        </template>
      </div>
      <div class="mt-2 flex gap-1.5">
        <button class="btn btn-pri btn-mini" :disabled="!Object.keys(draft).length" @click="apply">
          Recalculate
        </button>
        <button class="btn btn-mini" @click="reset">Defaults</button>
      </div>
    </details>
    <div class="mt-auto text-[11px] text-muted">
      ApexCut {{ settings.version
      }}<template v-if="settings.encoders"> · encoder {{ settings.encoders.hevcEncoder }}</template>
    </div>
  </div>
</template>
