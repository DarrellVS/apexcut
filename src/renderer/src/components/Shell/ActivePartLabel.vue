<script setup lang="ts">
/**
 * The middle of the title bar: the part you are hovering, have selected or are playing — what it is,
 * when it is, how long, how far you leant and how hard you braked. Otherwise the movie so far.
 */
import { computed } from 'vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { fmtDuration, fmtTime, plural } from '@renderer/utils/format';

const editor = useEditorStore();
const library = useLibraryStore();

function why(p: Part): string {
  const brake = p.max_brake_g ?? 0;
  const accel = p.max_accel_g ?? 0;
  const bits = [`${fmtTime(p.start_s)} – ${fmtTime(p.end_s)}`, fmtDuration(p.end_s - p.start_s)];
  if (p.max_lean_deg) bits.push(`up to ${Math.round(p.max_lean_deg)}° lean`);
  if (brake > 0.25) bits.push(`braking ${brake.toFixed(1)} g`);
  if (accel > 0.25) bits.push(`acceleration ${accel.toFixed(1)} g`);
  if (p.parts) bits.push(`${p.parts.length} parts joined`);
  if (!p.enabled) bits.push('left out');
  return bits.join(' · ');
}

const part = computed(() => editor.activePart);
/** the movie so far, when no part is in focus */
const summary = computed(() => {
  const all = library.analyzed;
  const n = all.reduce((a, c) => a + (c.nEnabled ?? 0), 0);
  const s = all.reduce((a, c) => a + (c.highlightS ?? 0), 0);
  if (!n) return 'No parts selected yet';
  return `${plural(n, 'part')}${all.length > 1 ? ` from ${plural(all.length, 'video')}` : ''} · ${fmtDuration(s)}`;
});
</script>

<template>
  <div class="flex h-7 min-w-0 flex-1 items-center justify-center px-3 text-center">
    <Transition
      mode="out-in"
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <span v-if="part" :key="part.id" class="num max-w-full truncate text-xs leading-7">
        <b class="text-fg">{{ REASON_LABEL[reasonOf(part)] }}</b>
        <span class="ml-1.5 text-fg2">{{ why(part) }}</span>
      </span>
      <span v-else class="num text-xs leading-7 text-fg3">{{ summary }}</span>
    </Transition>
  </div>
</template>
