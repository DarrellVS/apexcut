<script setup lang="ts">
/** Actions on the open video: scan again, EDL for other editors, remove from the project. */
import { api } from '@renderer/api';
import { useRelink } from '@renderer/composables/useRelink';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useUiStore } from '@renderer/stores/ui';
import { fmtTime, shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const editor = useEditorStore();
const library = useLibraryStore();
const ui = useUiStore();
const { relink } = useRelink();

// the selected video, scanned or not (editor.stem is only set for scanned ones)
const stem = (): string | null => library.currentClip?.stem ?? editor.stem;

async function rescan(): Promise<void> {
  const s = stem();
  if (!s) return;
  await api.analysis.run([s]);
  toast(library.currentClip?.analyzed ? 'Scanning again…' : 'Scanning…');
}
async function exportEdl(): Promise<void> {
  const s = stem();
  if (!s) return;
  const r = await api.exporter.edl(s);
  toast(`EDL saved: ${r.file}`, 5000);
}
async function remove(): Promise<void> {
  const s = stem();
  if (!s) return;
  await library.remove(s);
  toast(`${shortName(s)} removed from this project`);
}
</script>

<template>
  <div v-if="library.currentClip" class="flex flex-col gap-2.5">
    <div v-if="!library.currentClip.exists" class="card border-play/40">
      <b class="block text-sm text-play">File not found</b>
      <p class="m-0 mt-1 text-xs text-muted">
        The recording moved or the card is not plugged in. Your parts and the scan are safe; point
        ApexCut at the file again.
      </p>
      <div class="mt-2 flex gap-1.5">
        <button class="btn btn-mini" @click="relink('file', library.currentClip.stem)">
          Find video…
        </button>
        <button class="btn btn-mini" @click="relink('dir')">Find the folder…</button>
      </div>
    </div>
    <div class="card text-xs text-muted">
      <b class="block text-sm text-fg">{{ shortName(library.currentClip.stem) }}</b>
      <span class="break-all">{{ library.currentClip.stem }}</span>
      <div class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>Length</span
        ><span class="num text-fg">{{ fmtTime(library.currentClip.durationS ?? 0) }}</span>
        <span>Recording</span>
        <span class="text-fg"
          >{{ library.currentClip.width }}×{{ library.currentClip.height }}</span
        >
        <span>Camera</span><span class="text-fg">{{ library.currentClip.model ?? '—' }}</span>
      </div>
    </div>
    <div class="card flex flex-col gap-1.5">
      <h4 class="label-caps m-0 mb-1">Actions</h4>
      <button class="btn w-full text-left" @click="rescan">
        {{ library.currentClip.analyzed ? 'Scan again' : 'Scan now' }}
      </button>
      <button v-if="library.currentClip.analyzed" class="btn w-full text-left" @click="exportEdl">
        Export for DaVinci Resolve / Premiere
      </button>
      <button class="btn w-full text-left" @click="ui.openSettings('scoring')">
        Change how parts are picked…
      </button>
    </div>
    <div class="card">
      <button
        class="btn btn-mini text-play"
        title="The video and its scan stay available for other projects"
        @click="remove"
      >
        Remove from this project
      </button>
    </div>
  </div>
</template>
