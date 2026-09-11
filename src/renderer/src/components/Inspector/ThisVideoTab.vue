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
    <div v-if="!library.currentClip.exists" class="card border-danger/40">
      <b class="block text-[13px] text-danger">File not found</b>
      <p class="m-0 mt-1 text-xs text-fg2">
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
    <div class="card text-xs">
      <b class="block text-[13px] text-fg">{{ shortName(library.currentClip.stem) }}</b>
      <span class="break-all text-fg3">{{ library.currentClip.stem }}</span>
      <dl class="num m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt class="text-fg2">Length</dt>
        <dd class="m-0 text-right text-fg">{{ fmtTime(library.currentClip.durationS ?? 0) }}</dd>
        <dt class="text-fg2">Recording</dt>
        <dd class="m-0 text-right text-fg">
          {{ library.currentClip.width }}×{{ library.currentClip.height }}
        </dd>
        <dt class="text-fg2">Camera</dt>
        <dd class="m-0 text-right text-fg">{{ library.currentClip.model ?? '—' }}</dd>
      </dl>
    </div>
    <div class="flex flex-col gap-1.5">
      <button class="btn justify-start" @click="rescan">
        {{ library.currentClip.analyzed ? 'Scan again' : 'Scan now' }}
      </button>
      <button v-if="library.currentClip.analyzed" class="btn justify-start" @click="exportEdl">
        Export for DaVinci Resolve / Premiere
      </button>
      <button class="btn justify-start" @click="ui.openSettings('scoring')">
        Change how parts are picked…
      </button>
    </div>
    <div class="mt-2 border-t border-line pt-3">
      <button
        class="btn btn-mini text-danger"
        title="The video and its scan stay available for other projects"
        @click="remove"
      >
        Remove from this project
      </button>
    </div>
  </div>
</template>
