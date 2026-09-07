<script setup lang="ts">
/** Version, encoder in use, problem report, links. Update checks join here in a later step. */
import { ref } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUpdaterStore } from '@renderer/stores/updater';
import { fmtWhen } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const settings = useSettingsStore();
const updater = useUpdaterStore();
const reporting = ref(false);
async function report(): Promise<void> {
  reporting.value = true;
  try {
    const r = await window.apexcut.app.report();
    toast(`Report saved: ${r.file}`, 8000);
  } finally {
    reporting.value = false;
  }
}
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
      <div class="label-caps mb-1">Updates</div>
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1 text-fg">
          <template v-if="updater.status.state === 'checking'">Checking…</template>
          <template v-else-if="updater.status.state === 'uptodate'">
            You have the latest version.
            <span class="text-xs text-muted">Checked {{ fmtWhen(updater.status.checkedAt) }}</span>
          </template>
          <template v-else-if="updater.status.state === 'downloading'">
            Downloading
            {{ updater.status.version ? `ApexCut ${updater.status.version}` : 'update' }}…
            {{ updater.status.percent }}%
          </template>
          <template v-else-if="updater.status.state === 'ready'">
            ApexCut {{ updater.status.version }} is ready — installs when you restart.
          </template>
          <template v-else-if="updater.status.state === 'error'">
            <span class="text-play">{{ updater.status.message }}</span>
          </template>
          <template v-else-if="updater.status.state === 'disabled'">
            <span class="text-muted">Updates are checked in the installed app only.</span>
          </template>
          <template v-else>Updates are checked when ApexCut starts.</template>
        </div>
        <button
          v-if="updater.status.state === 'ready'"
          class="btn btn-pri btn-mini"
          @click="updater.install()"
        >
          Restart to update
        </button>
        <button
          v-else
          class="btn btn-mini"
          :disabled="updater.status.state === 'checking' || updater.status.state === 'downloading'"
          @click="updater.check()"
        >
          Check for updates
        </button>
      </div>
      <details v-if="updater.status.state === 'ready' && updater.status.notes" class="mt-2 text-xs">
        <summary class="cursor-pointer text-muted">What’s new</summary>
        <pre class="m-0 mt-1 whitespace-pre-wrap text-muted">{{ updater.status.notes }}</pre>
      </details>
    </div>
    <div class="card text-sm">
      <div class="label-caps mb-1">Exporting with</div>
      <div class="text-fg">{{ encoderLabel() }}</div>
      <div v-if="settings.encoders" class="mt-1 text-xs text-muted">
        ffmpeg {{ settings.encoders.ffmpegVersion }}
      </div>
    </div>
    <div class="card text-sm">
      <div class="label-caps mb-1">Something not right?</div>
      <p class="m-0 mb-2 text-xs text-muted">
        Report a problem writes a zip to your Documents folder: the app log, your project list and
        settings (no videos, no picks). Send it along when you ask for help.
      </p>
      <button class="btn btn-mini" :disabled="reporting" @click="report">
        {{ reporting ? 'Writing report…' : 'Report a problem' }}
      </button>
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
