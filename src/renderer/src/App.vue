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
import type { ImportGroup } from '@shared/ipc';
import UpdateBanner from '@renderer/components/Shell/UpdateBanner.vue';
import ImportSheet from '@renderer/components/Library/ImportSheet.vue';
import TourOverlay from '@renderer/components/Onboarding/TourOverlay.vue';
import EmptyState from '@renderer/components/EmptyState.vue';
import ErrorScreen from '@renderer/components/Base/ErrorScreen.vue';
import ExportOverlay from '@renderer/components/Export/ExportOverlay.vue';
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

const stage = ref<InstanceType<typeof VideoStage> | null>(null);
const inspector = ref<InstanceType<typeof InspectorPanel> | null>(null);

const phase = computed<'projects' | 'empty' | 'scanning' | 'editor'>(() => {
  if (projects.showHome || !projects.activeId) return 'projects';
  if (!library.clips.length) return 'empty';
  // a running scan takes the screen, also when videos are added to a project that has scanned ones
  if (jobs.analyzeJob) return 'scanning';
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
  const remembered = localStorage.getItem(videoKey());
  const first = library.analyzed.find((c) => c.stem === remembered) ?? library.analyzed[0];
  if (first) await openClip(first.stem, Number(localStorage.getItem(timeKey())) || 0);
  // videos whose scan never ran or failed (e.g. the app was closed mid-scan) get scanned now
  const todo = library.clips.filter((c) => !c.analyzed && c.exists).map((c) => c.stem);
  if (todo.length && !jobs.analyzeJob) await window.apexcut.analysis.run(todo);
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

// ---- adding videos: one day → straight into the project; several days → ask (ImportSheet)
const pendingGroups = ref<ImportGroup[] | null>(null);
async function importPaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const groups = await window.apexcut.library.inspect(paths);
  if (!groups.length) {
    toast('No DJI videos found in what you picked');
    return;
  }
  if (groups.length > 1) {
    pendingGroups.value = groups;
    return;
  }
  await scanNew(await library.add(paths));
}
async function confirmImport(groups: { name: string | null; paths: string[] }[]): Promise<void> {
  pendingGroups.value = null;
  const r = await window.apexcut.projects.addGroups(JSON.parse(JSON.stringify(groups)));
  if (r.firstProject) await openProject(r.firstProject);
  else await library.refresh();
  const n = groups.filter((g) => g.name !== null).length;
  toast(
    n
      ? `${n} project${n === 1 ? '' : 's'} created with ${r.stems.length} videos`
      : `${r.stems.length} video${r.stems.length === 1 ? '' : 's'} added`,
  );
  if (r.toScan.length) await window.apexcut.analysis.run(r.toScan);
}
async function pickAndScan(kind: 'files' | 'dir'): Promise<void> {
  await importPaths(await library.pick(kind));
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
  // music files go under the movie, everything else is looked at as video
  const audio = paths.filter((p) => /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(p));
  if (audio.length && projects.active) {
    const tracks = await window.apexcut.music.add(audio);
    if (tracks.length) {
      await projects.setMusic({
        ...projects.active.music,
        tracks: [...projects.active.music.tracks, ...tracks],
      });
      toast(
        `${tracks.length === 1 ? tracks[0].name : `${tracks.length} songs`} added under your movie`,
      );
    }
  }
  await importPaths(paths.filter((p) => !audio.includes(p)));
}

onMounted(async () => {
  await Promise.all([settings.init(), jobs.init(), projects.refresh(), updater.init()]);
  if (projects.activeId) await openProject(projects.activeId);

  jobs.onUpdate(async (job) => {
    if (job.status === 'running') {
      // a scan reports "Done" per video: refresh so the "n of m videos done" count moves along
      if (job.kind === 'analyze' && job.message === 'Done') await library.refresh();
      return;
    }
    await Promise.all([library.refresh(), projects.refresh()]);
    if (job.kind === 'analyze' && job.status === 'done') {
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

// the quick tour: once, the first time the editor is on screen with a scanned video, never during an export
watch(
  () => phase.value === 'editor' && !!editor.stem && settings.settings?.tourSeen === false,
  (due) => {
    if (due && !jobs.exporting && !ui.tourActive) setTimeout(() => (ui.tourActive = true), 800);
  },
  { immediate: true },
);
// leaving the editor (projects screen, settings) hides the tour; it comes back with the editor
watch(phase, (p) => {
  if (p !== 'editor' && ui.tourActive) ui.tourActive = false;
});

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
  // I / O: set an edge of the selected part at the playhead (a new part when none is selected)
  const trim = (edge: 'start_s' | 'end_s', toCore: boolean): void => {
    let p = editor.selectedParts.length === 1 ? editor.selectedParts[0] : null;
    if (!p && !toCore) p = editor.addAt(editor.time);
    if (!p) return;
    const ok = toCore ? editor.trimToCore(p, edge) : editor.trimTo(p, edge, editor.time);
    if (!ok)
      toast(toCore ? 'This part has no scanned core to trim to' : 'Cannot move the edge there');
  };
  switch (e.key) {
    case ' ':
      e.preventDefault();
      stage.value?.togglePlay();
      break;
    case 'l':
    case 'L': {
      const rate = stage.value?.shuttle('play') ?? 1;
      if (rate > 1) toast(`${rate}× speed`, 1200);
      break;
    }
    case 'k':
    case 'K':
      stage.value?.shuttle('pause');
      break;
    case 'j':
    case 'J':
      stage.value?.seek(editor.time - 10);
      break;
    case ',':
      stage.value?.frameStep(-1);
      break;
    case '.':
      stage.value?.frameStep(1);
      break;
    case 'i':
    case 'I':
      trim('start_s', e.shiftKey);
      break;
    case 'o':
    case 'O':
      trim('end_s', e.shiftKey);
      break;
    case '?':
      ui.openSettings('shortcuts');
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
    case 'f':
      editor.toggleStar(editor.selectedParts);
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
    <ImportSheet
      v-if="pendingGroups"
      :groups="pendingGroups"
      @confirm="confirmImport"
      @cancel="pendingGroups = null"
    />
    <SettingsModal />
    <ExportOverlay @watch="stage?.watchResult($event)" />
    <TourOverlay />
    <ErrorScreen />
    <ToastHost />
  </div>
</template>
