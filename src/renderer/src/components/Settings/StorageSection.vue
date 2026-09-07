<script setup lang="ts">
/** Storage: where the data lives, how big the scan cache is, clean up scans no project uses. */
import { onMounted, ref } from 'vue';
import { PhFolderOpen } from '@phosphor-icons/vue';
import type { StorageInfo } from '@shared/ipc';
import { fmtBytes, shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const info = ref<StorageInfo | null>(null);
const busy = ref(false);
const confirming = ref(false);

async function load(): Promise<void> {
  info.value = await window.apexcut.storage.info();
}
async function cleanup(): Promise<void> {
  confirming.value = false;
  busy.value = true;
  try {
    const r = await window.apexcut.storage.cleanup();
    toast(
      r.removed.length
        ? `${r.removed.length} scan${r.removed.length === 1 ? '' : 's'} removed, ${fmtBytes(r.freedBytes)} freed`
        : 'Nothing to clean up',
    );
    await load();
  } catch (e) {
    toast((e as Error).message, 6000);
  } finally {
    busy.value = false;
  }
}
function openData(): void {
  if (info.value) window.apexcut.shell.openFolder(info.value.dataRoot);
}
onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-sm text-muted">
      Every scanned video leaves a small cache: its motion data, a filmstrip and a thumbnail. It is
      shared by all projects, so a video in two projects is scanned once.
    </p>
    <div v-if="!info" class="card text-sm text-muted">Measuring…</div>
    <template v-else>
      <div class="grid grid-cols-3 gap-2.5">
        <div class="card">
          <b class="block text-xl text-fg">{{ fmtBytes(info.cacheBytes) }}</b>
          <span class="text-xs text-muted">scan cache</span>
        </div>
        <div class="card">
          <b class="block text-xl text-fg">{{ info.nScanned }}</b>
          <span class="text-xs text-muted">scanned videos</span>
        </div>
        <div class="card" :class="{ 'border-play/40': info.unused.length }">
          <b class="block text-xl text-fg">{{ info.unused.length }}</b>
          <span class="text-xs text-muted">in no project · {{ fmtBytes(info.unusedBytes) }}</span>
        </div>
      </div>
      <div class="card flex items-center gap-3 text-sm">
        <PhFolderOpen :size="22" class="flex-none text-muted" />
        <div class="min-w-0 flex-1 text-xs break-all text-muted">{{ info.dataRoot }}</div>
        <button class="btn btn-mini" @click="openData">Open data folder</button>
      </div>
      <div class="card text-sm">
        <div class="label-caps mb-1">Clean up</div>
        <p class="m-0 text-xs text-muted">
          Removes the scans of videos that are in no project any more
          <template v-if="info.unused.length">
            ({{ info.unused.map(shortName).join(', ') }})</template
          >. Add such a video again and it is simply scanned again.
        </p>
        <div class="mt-2 flex items-center gap-2">
          <template v-if="confirming">
            <span class="text-xs text-fg">Remove {{ info.unused.length }} scans?</span>
            <button class="btn btn-mini bg-play text-white hover:bg-play" @click="cleanup">
              Remove
            </button>
            <button class="btn btn-mini" @click="confirming = false">Keep</button>
          </template>
          <button
            v-else
            class="btn btn-mini"
            :disabled="busy || !info.unused.length"
            @click="confirming = true"
          >
            {{
              info.unused.length ? `Clean up ${fmtBytes(info.unusedBytes)}` : 'Nothing to clean up'
            }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
