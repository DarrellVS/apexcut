<script setup lang="ts">
/**
 * Application shell: three phases (empty → scanning → editor) and global keyboard shortcuts.
 * Restart-safe: the open video and playhead are remembered in localStorage.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import EmptyState from '@renderer/components/EmptyState.vue';
import ScanProgress from '@renderer/components/ScanProgress.vue';
import TopBar from '@renderer/components/Shell/TopBar.vue';
import VideoList from '@renderer/components/Library/VideoList.vue';
import VideoStage from '@renderer/components/Stage/VideoStage.vue';
import InspectorPanel from '@renderer/components/Inspector/InspectorPanel.vue';
import Timeline from '@renderer/components/Timeline/Timeline.vue';
import ToastHost, { toast } from '@renderer/components/Base/ToastHost.vue';

const library = useLibraryStore();
const jobs = useJobsStore();
const editor = useEditorStore();
const settings = useSettingsStore();

const everAnalyzed = ref(false);
const stage = ref<InstanceType<typeof VideoStage> | null>(null);
const inspector = ref<InstanceType<typeof InspectorPanel> | null>(null);

const phase = computed<'empty' | 'scanning' | 'editor'>(() => {
  if (!library.clips.length) return 'empty';
  if (jobs.analyzeJob && !everAnalyzed.value) return 'scanning';
  return 'editor';
});

async function openClip(stem: string, seekTo?: number): Promise<void> {
  const clip = library.clips.find((c) => c.stem === stem);
  if (!clip?.analyzed) {
    library.current = stem;
    return;
  }
  library.current = stem;
  await editor.open(stem);
  localStorage.setItem('apexcut.video', stem);
  if (seekTo) stage.value?.seek(seekTo);
}

async function scanNew(added: string[]): Promise<void> {
  const todo = library.clips.filter((c) => !c.analyzed).map((c) => c.stem);
  if (added.length) toast(`${added.length} video${added.length === 1 ? '' : 's'} added`);
  if (todo.length) await window.apexcut.analysis.run(todo);
}
async function pickAndScan(kind: 'files' | 'dir'): Promise<void> {
  await scanNew(await library.pick(kind));
}

// ---- drop MP4/LRF files or folders from Explorer anywhere in the window
const dropping = ref(false);
function onDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    dropping.value = true;
  }
}
async function onDrop(e: DragEvent): Promise<void> {
  dropping.value = false;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  e.preventDefault();
  const paths = Array.from(files).map((f) => window.apexcut.files.pathOf(f));
  const added = await library.add(paths);
  if (!added.length) toast('No DJI videos found in what you dropped');
  await scanNew(added);
}

onMounted(async () => {
  await Promise.all([settings.init(), jobs.init(), library.refresh()]);
  everAnalyzed.value = library.analyzed.length > 0;
  const remembered = localStorage.getItem('apexcut.video');
  const first = library.analyzed.find((c) => c.stem === remembered) ?? library.analyzed[0];
  if (first) await openClip(first.stem, Number(localStorage.getItem('apexcut.time')) || 0);

  jobs.onUpdate(async (job) => {
    if (job.status === 'running') return;
    await library.refresh();
    if (job.kind === 'analyze' && job.status === 'done') {
      everAnalyzed.value = true;
      const target =
        library.analyzed.find((c) => c.stem === library.current) ?? library.analyzed[0];
      if (target) {
        await openClip(target.stem);
        const n = editor.parts.length;
        const corners = editor.parts.filter((p) => p.reden !== 'accel/rem').length;
        toast(
          `Done! Found ${n} fun parts${corners ? `, ${corners} with corners` : ''}. Press ▶ for a preview.`,
        );
        stage.value?.startPreview();
      }
    }
    if (job.kind === 'analyze' && job.status === 'error') toast(job.error ?? 'Scanning failed');
  });
  window.addEventListener('keydown', onKey);
  setInterval(() => {
    if (editor.stem) localStorage.setItem('apexcut.time', String(Math.round(editor.time)));
  }, 2000);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

watch(
  () => library.current,
  (s) => s && openClip(s),
);

function onKey(e: KeyboardEvent): void {
  if (phase.value !== 'editor') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    e.shiftKey ? editor.redo() : editor.undo();
    return;
  }
  if (mod && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    editor.redo();
    return;
  }
  const tag = (e.target as HTMLElement).tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      stage.value?.togglePlay();
      break;
    case 'ArrowLeft':
      stage.value?.seek(editor.time - 5);
      break;
    case 'ArrowRight':
      stage.value?.seek(editor.time + 5);
      break;
    case ']':
      stage.value?.seekPart(1);
      break;
    case '[':
      stage.value?.seekPart(-1);
      break;
    case 'Delete':
    case 'Backspace':
      if (editor.selectedParts.length) {
        editor.remove(editor.selectedParts);
        toast('Part deleted — Ctrl+Z brings it back');
      }
      break;
    case 'm':
      editor.join(editor.selectedParts);
      break;
    case 'n':
      editor.addAt(editor.time);
      toast('Part added — drag the edges to fit');
      break;
    case 'Escape':
      editor.clearSelection();
      break;
  }
}
</script>

<template>
  <div
    class="relative flex h-full flex-col gap-2.5 p-2.5"
    @dragover="onDragOver"
    @dragleave.self="dropping = false"
    @drop="onDrop"
  >
    <div
      v-if="dropping"
      class="pointer-events-none absolute inset-2.5 z-40 grid place-items-center rounded-card border-2 border-dashed border-acc2 bg-acc2/10 text-lg font-semibold text-fg"
    >
      Drop your videos to add them
    </div>
    <EmptyState v-if="phase === 'empty'" @pick="pickAndScan" />
    <ScanProgress v-else-if="phase === 'scanning'" />
    <template v-else>
      <TopBar @make="inspector?.openMovie($event)" />
      <main class="grid min-h-0 flex-1 grid-cols-[300px_1fr_300px] gap-2.5">
        <VideoList @pick="pickAndScan" />
        <VideoStage ref="stage" :framing="inspector?.framingActive ?? false" />
        <InspectorPanel
          ref="inspector"
          @seek="stage?.seek($event)"
          @play="stage?.play($event)"
          @watch="stage?.watchResult($event)"
        />
      </main>
      <Timeline @seek="stage?.seek($event)" @play="stage?.play($event)" />
    </template>
    <ToastHost />
  </div>
</template>
