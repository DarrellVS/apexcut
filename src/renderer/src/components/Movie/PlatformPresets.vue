<script setup lang="ts">
/**
 * "Made for…": one click sets the shape and the sound the way a platform wants them, instead of
 * asking a rider to know that Reels is vertical and that YouTube turns loud videos down. Folded
 * away, because most people set it once — and everything it does stays visible in the sections
 * above, which is where you change your mind.
 */
import { computed } from 'vue';
import { PhCaretRight } from '@phosphor-icons/vue';
import type { ExportFormat } from '@shared/ipc';
import { useFraming } from '@renderer/composables/useFraming';
import { useProjectsStore } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';

interface Preset {
  id: string;
  label: string;
  hint: string;
  format: ExportFormat;
  loudness: boolean;
}

const PRESETS: Preset[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    hint: 'Widescreen 16:9, even loudness',
    format: '16x9',
    loudness: true,
  },
  {
    id: 'phone',
    label: 'Reels, Shorts, TikTok',
    hint: 'Vertical 9:16, even loudness',
    format: '9x16',
    loudness: true,
  },
  {
    id: 'keep',
    label: 'Keep it as recorded',
    hint: 'Square, the sound as it came off the camera',
    format: 'original',
    loudness: false,
  },
];

const framing = useFraming();
const projects = useProjectsStore();

/** the preset this movie already matches, if any */
const current = computed(
  () =>
    PRESETS.find(
      (p) => p.format === framing.format.value && p.loudness === !!projects.active?.loudness,
    ) ?? null,
);

async function apply(p: Preset): Promise<void> {
  await framing.setFormat(p.format);
  await projects.setLoudness(p.loudness);
  toast(`Set up for ${p.label}: ${p.hint.toLowerCase()}`);
}
</script>

<template>
  <details class="group">
    <summary
      class="flex h-7 cursor-pointer list-none items-center gap-1 text-xs text-fg2 select-none hover:text-fg"
    >
      <PhCaretRight :size="10" weight="bold" class="transition-transform group-open:rotate-90" />
      Made for
      <span class="text-fg3">{{ current ? `· ${current.label}` : '· your own settings' }}</span>
    </summary>
    <div class="mt-1 flex flex-col gap-1">
      <button
        v-for="p in PRESETS"
        :key="p.id"
        class="row justify-between text-left text-xs"
        :class="{ 'bg-bg3': current?.id === p.id }"
        :title="p.hint"
        @click="apply(p)"
      >
        <span class="min-w-0 flex-1 truncate text-fg">{{ p.label }}</span>
        <span class="flex-none text-[11px] text-fg3">{{ p.hint }}</span>
      </button>
    </div>
  </details>
</template>
