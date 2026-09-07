<script setup lang="ts">
/**
 * Application shell: phases projects → empty → scanning → editor, plus global keyboard shortcuts.
 * Restart-safe: the open project, its open video and the playhead are remembered.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUiStore } from '@renderer/stores/ui';
import { useUpdaterStore } from '@renderer/stores/updater';
import UpdateBanner from '@renderer/components/Shell/UpdateBanner.vue';
import EmptyState from '@renderer/components/EmptyState.vue';
import ErrorScreen from '@renderer/components/Base/ErrorScreen.vue';
import SettingsModal from '@renderer/components/Settings/SettingsModal.vue';
import { friendlyError } from '@renderer/utils/errors';
import ScanProgress from '@renderer/components/ScanProgress.vue';
import ProjectsHome from '@renderer/components/Projects/ProjectsHome.vue';
import TopBar from '@renderer/components/Shell/TopBar.vue';
import VideoList from '@renderer/components/Library/VideoList.vue';
import VideoStage from '@renderer/components/Stage/VideoStage.vue';
import InspectorPanel from '@renderer/components/Inspector/InspectorPanel.vue';
import Timeline from '@renderer/components/Timeline/Timeline.vue';
import ToastHost, { toast } from '@renderer/components/Base/ToastHost.vue';

const library = useLibraryStore();
const projects = useProjectsStore();
const jobs = useJobsStore();
const editor = useEditorStore();
const settings = useSettingsStore();
const ui = useUiStore();
const updater = useUpdaterStore();

const everAnalyzed = ref(false);
const stage = ref<InstanceType<typeof VideoStage> | null>(null);
const inspector = ref<InstanceType<typeof InspectorPanel> | null>(null);

const phase = computed<'projects' | 'empty' | 'scanning' | 'editor'>(() => {
  if (projects.showHome || !projects.activeId) return 'projects';
  if (!library.clips.length) return 'empty';
  if (jobs.analyzeJob && !everAnalyzed.value) return 'scanning';
  return 'editor';
});

const videoKey = (): string => `apexcut.video.${projects.activeId}`;
const timeKey = (): string => `apexcut.time.${projects.activeId}`;

async function openClip(stem: string, seekTo?: number): Promise<void> {
  const clip = library.clips.find((c) => c.stem === stem);
  library.current = stem;
  if (!clip?.analyzed) return;
  await editor.open(stem);
  localStorage.setItem(videoKey(), stem);
  if (seekTo) stage.value?.seek(seekTo);
}

/** Switch to a project: flush pending edits, load its videos and reopen the remembered one. */
async function openProject(id: string): Promise<void> {
  await editor.close();
  await projects.open(id);
  await library.refresh();
  everAnalyzed.value = library.analyzed.length > 0;
  const remembered = localStorage.getItem(videoKey());
  const first = library.analyzed.find((c) => c.stem === remembered) ?? library.analyzed[0];
  if (first) await openClip(first.stem, Number(localStorage.getItem(timeKey())) || 0);
}

async function goHome(): Promise<void> {
  await editor.flush();
  await projects.refresh();
  projects.showHome = true;
}

async function scanNew(added: string[]): Promise<void> {
  const todo = library.clips.filter((c) => !c.analyzed).map((c) => c.stem);
  if (added.length) toast(`${added.length} video${added.length === 1 ? '' : 's'} added`);
  if (todo.length) await window.apexcut.analysis.run(todo);
}
async function pickAndScan(kind: 'files' | 'dir'): Promise<void> {
  await scanNew(await library.pick(kind));
}

// ---- drop MP4/LRF files or folders from Explorer anywhere in the window (into the open project)
const dropping = ref(false);
function onDragOver(e: DragEvent): void {
  if (phase.value !== 'projects' && e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    dropping.value = true;
  }
}
async function onDrop(e: DragEvent): Promise<void> {
  dropping.value = false;
  const files = e.dataTransfer?.files;
  if (!files?.length || phase.value === 'projects') return;
  e.preventDefault();
  const paths = Array.from(files).map((f) => window.apexcut.files.pathOf(f));
  const added = await library.add(paths);
  if (!added.length) toast('No DJI videos found in what you dropped');
  await scanNew(added);
}

onMounted(async () => {
  await Promise.all([settings.init(), jobs.init(), projects.refresh(), updater.init()]);
  if (projects.activeId) await openProject(projects.activeId);

  jobs.onUpdate(async (job) => {
    if (job.status === 'running') return;
    await Promise.all([library.refresh(), projects.refresh()]);
    if (job.kind === 'analyze' && job.status === 'done') {
      everAnalyzed.value = true;
      const target =
        library.analyzed.find((c) => c.stem === library.current) ?? library.analyzed[0];
      if (target && phase.value === 'editor') {
        await openClip(target.stem);
        const n = editor.parts.length;
        const corners = editor.parts.filter((p) => p.reden !== 'accel/rem').length;
        toast(
          `Done! Found ${n} fun parts${corners ? `, ${corners} with corners` : ''}. Press ▶ for a preview.`,
        );
        stage.value?.startPreview();
      }
    }
    if (job.kind === 'analyze' && job.status === 'error') {
      const f = friendlyError(job.error);
      toast(`${f.title}. ${f.hint}`, 8000);
    }
  });
  window.addEventListener('keydown', onKey);
  setInterval(() => {
    if (editor.stem) localStorage.setItem(timeKey(), String(Math.round(editor.time)));
  }, 2000);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

watch(
  () => library.current,
  (s) => s && s !== editor.stem && openClip(s),
);

function onKey(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === ',') {
    e.preventDefault();
    ui.toggleSettings();
    return;
  }
  if (phase.value !== 'editor' || ui.settingsOpen) return;
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
      Drop your videos to add them to “{{ projects.active?.name }}”
    </div>
    <UpdateBanner />
    <ProjectsHome v-if="phase === 'projects'" @open="openProject" />
    <EmptyState
      v-else-if="phase === 'empty'"
      :project="projects.active?.name ?? ''"
      @pick="pickAndScan"
      @home="goHome"
    />
    <ScanProgress v-else-if="phase === 'scanning'" />
    <template v-else>
      <TopBar @make="inspector?.openMovie($event)" @home="goHome" />
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
    <SettingsModal />
    <ErrorScreen />
    <ToastHost />
  </div>
</template>
