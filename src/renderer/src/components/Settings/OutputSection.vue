<script setup lang="ts">
/** Where movies and clips are written. */
import { api } from '@renderer/api';
import { PhFolderOpen } from '@phosphor-icons/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const settings = useSettingsStore();

async function pickOutput(): Promise<void> {
  const next = await api.settings.pickOutputDir();
  if (next) {
    settings.settings = next;
    toast(`Movies go to ${next.outputDir}`);
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-[13px] text-fg2">
      Movies land in <b class="text-fg">movies</b>, separate clips in <b class="text-fg">clips</b>
      inside this folder. Your original recordings are never touched.
    </p>
    <div class="card flex items-center gap-3">
      <PhFolderOpen :size="22" class="flex-none text-fg2" />
      <div class="min-w-0 flex-1 text-[13px] break-all text-fg">
        {{ settings.settings?.outputDir ?? 'Videos\\ApexCut (default)' }}
      </div>
      <button class="btn btn-mini" @click="pickOutput">Change…</button>
      <button
        v-if="settings.settings?.outputDir"
        class="btn btn-mini"
        @click="settings.update({ outputDir: null })"
      >
        Use default
      </button>
    </div>
  </div>
</template>
