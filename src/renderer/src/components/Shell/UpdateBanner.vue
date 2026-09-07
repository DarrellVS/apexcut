<script setup lang="ts">
/** Slim banner above the top bar while an update downloads (progress) and once it is ready: what's new + restart. */
import { ref } from 'vue';
import { PhArrowsClockwise, PhDownloadSimple, PhSparkle, PhX } from '@phosphor-icons/vue';
import { useUpdaterStore } from '@renderer/stores/updater';

const updater = useUpdaterStore();
const notesOpen = ref(false);
</script>

<template>
  <div
    v-if="updater.showBanner"
    class="glass relative z-50 flex items-center gap-3 overflow-hidden px-3.5 py-1.5 text-sm"
    role="status"
  >
    <template v-if="updater.downloading">
      <PhDownloadSimple :size="16" weight="bold" class="flex-none animate-pulse text-acc2" />
      <span class="min-w-0 flex-1 truncate">
        <b>
          Downloading
          {{
            updater.downloading.version ? `ApexCut ${updater.downloading.version}` : 'an update'
          }}…
        </b>
        <span class="text-muted">
          {{ updater.downloading.percent }}% · keep working, it installs when you restart.</span
        >
      </span>
      <div
        class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-acc1 to-acc2 transition-[width] duration-300"
        :style="{ width: `${updater.downloading.percent}%` }"
        aria-hidden="true"
      />
    </template>
    <template v-else-if="updater.ready">
      <PhSparkle :size="16" weight="fill" class="flex-none text-acc2" />
      <span class="min-w-0 flex-1 truncate">
        <b>ApexCut {{ updater.ready.version }} is ready.</b>
        <span class="text-muted"> It installs when you restart.</span>
      </span>
      <div class="relative">
        <button
          v-if="updater.ready.notes"
          class="btn btn-mini"
          :class="{ 'bg-s3': notesOpen }"
          @click="notesOpen = !notesOpen"
        >
          What’s new
        </button>
        <div
          v-if="notesOpen"
          class="popover absolute top-[calc(100%+6px)] right-0 z-30 max-h-[320px] w-[420px] overflow-auto p-4 text-xs whitespace-pre-wrap"
          @click.stop
        >
          {{ updater.ready.notes }}
        </div>
      </div>
      <button class="btn btn-pri btn-mini flex items-center gap-1" @click="updater.install()">
        <PhArrowsClockwise :size="13" /> Restart to update
      </button>
    </template>
    <button
      class="btn btn-ghost btn-mini px-1.5"
      title="Not now"
      aria-label="Dismiss update notice"
      @click="updater.dismissed = true"
    >
      <PhX :size="13" />
    </button>
  </div>
</template>
