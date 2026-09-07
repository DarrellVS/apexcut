<script setup lang="ts">
/** Version, encoder in use, links. Update checks join here in a later step. */
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();
const encoderLabel = (): string => {
  const e = settings.encoders;
  if (!e) return 'checking…';
  const gpu = e.hevcEncoder !== 'libx265';
  return gpu
    ? `your graphics card (${e.hevcEncoder})${e.gpuDecode ? ', fast decoding' : ''}`
    : 'your processor (slower, same quality)';
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="card flex items-center gap-3">
      <div
        class="grid h-11 w-11 flex-none place-items-center rounded-[12px] bg-gradient-to-br from-acc1 to-acc2 text-lg font-extrabold text-white"
      >
        A
      </div>
      <div class="min-w-0">
        <b class="block text-fg">ApexCut {{ settings.version }}</b>
        <span class="text-xs text-muted">Finds the fun parts of your helmet-cam videos.</span>
      </div>
    </div>
    <div class="card text-sm">
      <div class="label-caps mb-1">Exporting with</div>
      <div class="text-fg">{{ encoderLabel() }}</div>
      <div v-if="settings.encoders" class="mt-1 text-xs text-muted">
        ffmpeg {{ settings.encoders.ffmpegVersion }}
      </div>
    </div>
    <p class="m-0 text-xs text-muted">
      Open source on
      <a class="text-fg underline" href="https://github.com/DarrellVS/apexcut" target="_blank"
        >github.com/DarrellVS/apexcut</a
      >. Your original files are never changed; everything ApexCut writes goes to your output folder
      and its own data folder.
    </p>
  </div>
</template>
