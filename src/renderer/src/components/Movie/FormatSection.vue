<script setup lang="ts">
/** The shape of the movie: four tiles, and what the choice means for the picture. */
import type { ExportFormat } from '@shared/ipc';
import { useFraming } from '@renderer/composables/useFraming';

const framing = useFraming();
const format = framing.format;

const TILES: { f: ExportFormat; label: string; sub: string; w: number; h: number }[] = [
  { f: 'original', label: 'Square', sub: 'as recorded', w: 40, h: 40 },
  { f: '16x9', label: 'Widescreen 16:9', sub: 'YouTube, TV', w: 56, h: 32 },
  { f: '4x3', label: 'Classic 4:3', sub: 'a bit more sky and road', w: 48, h: 36 },
  { f: '9x16', label: 'Vertical 9:16', sub: 'phone, reels', w: 24, h: 42 },
];
</script>

<template>
  <section>
    <div class="label-caps mb-2">Format</div>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="t in TILES"
        :key="t.f"
        class="tile flex h-[68px] flex-col items-center justify-center gap-1.5"
        :aria-pressed="format === t.f"
        :title="t.sub"
        @click="framing.setFormat(t.f)"
      >
        <div
          class="rounded-[2px] border border-fg2 bg-fg3/30"
          :style="{ width: `${t.w * 0.7}px`, height: `${t.h * 0.7}px` }"
        />
        <b class="text-xs font-semibold">{{ t.label }}</b>
      </button>
    </div>
    <div class="mt-2 text-xs text-fg3">
      {{
        format === 'original'
          ? 'As recorded: ready within a minute, no quality loss.'
          : 'Drag the frame on the video to choose what stays in view.'
      }}
    </div>
  </section>
</template>
