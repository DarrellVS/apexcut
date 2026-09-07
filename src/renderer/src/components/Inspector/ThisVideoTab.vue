<script setup lang="ts">
/** Actions on the open video: scan again, EDL for other editors, remove from the project. */
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useUiStore } from '@renderer/stores/ui';
import { fmtTime, shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const editor = useEditorStore();
const library = useLibraryStore();
const ui = useUiStore();

async function rescan(): Promise<void> {
  if (!editor.stem) return;
  await window.apexcut.analysis.run([editor.stem]);
  toast('Scanning again…');
}
async function exportEdl(): Promise<void> {
  if (!editor.stem) return;
  const r = await window.apexcut.exporter.edl(editor.stem);
  toast(`EDL saved: ${r.file}`, 5000);
}
</script>

<template>
  <div v-if="library.currentClip" class="flex flex-col gap-2.5">
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
      <button class="btn w-full text-left" @click="rescan">Scan again</button>
      <button class="btn w-full text-left" @click="exportEdl">
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
        @click="library.remove(editor.stem!)"
      >
        Remove from this project
      </button>
    </div>
  </div>
</template>
