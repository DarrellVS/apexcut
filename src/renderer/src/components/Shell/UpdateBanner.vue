<script setup lang="ts">
/** Slim bar under the title bar while an update downloads (progress) and once it is ready: what's new + restart. */
import { ref } from 'vue';
import { PhArrowsClockwise, PhDownloadSimple, PhX } from '@phosphor-icons/vue';
import { useUpdaterStore } from '@renderer/stores/updater';
import { useDismiss } from '@renderer/composables/useDismiss';

const updater = useUpdaterStore();
const notesOpen = ref(false);
const notesRoot = ref<HTMLElement | null>(null);
useDismiss(notesRoot, () => (notesOpen.value = false));
</script>

<template>
  <div
    v-if="updater.showBanner"
    class="relative z-50 flex h-8 flex-none items-center gap-3 overflow-hidden border-b border-line bg-bg1 px-3 text-xs"
    role="status"
  >
    <template v-if="updater.downloading">
      <PhDownloadSimple :size="14" class="flex-none text-fg2" />
      <span class="num min-w-0 flex-1 truncate">
        <b class="font-semibold">
          Downloading
          {{ updater.downloading.version ? `ApexCut ${updater.downloading.version}` : 'an update' }}
        </b>
        <span class="text-fg2">
          · {{ updater.downloading.percent }}% · keep working, it installs when you restart
        </span>
      </span>
      <div
        class="absolute inset-x-0 bottom-0 h-px bg-ink transition-[width] duration-300"
        :style="{ width: `${updater.downloading.percent}%` }"
        aria-hidden="true"
      />
    </template>
    <template v-else-if="updater.ready">
      <PhArrowsClockwise :size="14" class="flex-none text-fg2" />
      <span class="min-w-0 flex-1 truncate">
        <b class="font-semibold">ApexCut {{ updater.ready.version }} is ready.</b>
        <span class="text-fg2"> It installs when you restart.</span>
      </span>
      <div ref="notesRoot" class="relative">
        <button
          v-if="updater.ready.notes"
          class="btn btn-mini"
          :class="{ 'bg-bg3': notesOpen }"
          @click="notesOpen = !notesOpen"
        >
          What’s new
        </button>
        <div
          v-if="notesOpen"
          class="popover absolute top-[calc(100%+4px)] right-0 z-30 max-h-[320px] w-[420px] overflow-auto p-3 text-xs whitespace-pre-wrap"
          @click.stop
        >
          {{ updater.ready.notes }}
        </div>
      </div>
      <button class="btn btn-pri btn-mini" @click="updater.install()">Restart to update</button>
    </template>
    <button
      class="btn btn-ghost btn-mini px-1"
      title="Not now"
      aria-label="Dismiss update notice"
      @click="updater.dismissed = true"
    >
      <PhX :size="12" />
    </button>
  </div>
</template>
