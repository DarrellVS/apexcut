<script setup lang="ts">
/**
 * Application shell: phases projects → empty → scanning → editor, the panels of the editor, and the
 * overlays that can appear over any of them. Restart-safe: the open project, its open video and the
 * playhead are remembered. Importing, the keyboard and what happens around a scan live in their own
 * composables.
 */
import { api } from '@renderer/api';
import { computed, onMounted, ref, watch } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUiStore } from '@renderer/stores/ui';
import { useUpdaterStore } from '@renderer/stores/updater';
import { useEditorShortcuts } from '@renderer/composables/useEditorShortcuts';
import { useImport } from '@renderer/composables/useImport';
import { usePanelWidth } from '@renderer/composables/usePanelWidth';
import { useScanLifecycle } from '@renderer/composables/useScanLifecycle';
import CommandPalette from '@renderer/components/Shell/CommandPalette.vue';
import UpdateBanner from '@renderer/components/Shell/UpdateBanner.vue';
import PanelSplitter from '@renderer/components/Shell/PanelSplitter.vue';
import ImportSheet from '@renderer/components/Library/ImportSheet.vue';
import TourOverlay from '@renderer/components/Onboarding/TourOverlay.vue';
import EmptyState from '@renderer/components/EmptyState.vue';
import ErrorScreen from '@renderer/components/Base/ErrorScreen.vue';
import ExportOverlay from '@renderer/components/Export/ExportOverlay.vue';
import SettingsModal from '@renderer/components/Settings/SettingsModal.vue';
import ScanProgress from '@renderer/components/ScanProgress.vue';
import ProjectsHome from '@renderer/components/Projects/ProjectsHome.vue';
import TopBar from '@renderer/components/Shell/TopBar.vue';
import RideRail from '@renderer/components/Ride/RideRail.vue';
import RideCardSheet from '@renderer/components/Ride/RideCardSheet.vue';
import VideoStage from '@renderer/components/Stage/VideoStage.vue';
import MoviePanel from '@renderer/components/Movie/MoviePanel.vue';
import Timeline from '@renderer/components/Timeline/Timeline.vue';
import ToastHost from '@renderer/components/Base/ToastHost.vue';

const library = useLibraryStore();
const projects = useProjectsStore();
const jobs = useJobsStore();
const editor = useEditorStore();
const settings = useSettingsStore();
const ui = useUiStore();
const updater = useUpdaterStore();

// side panels: drag the hairline between panels; widths are remembered. Either panel may grow to
// 520 px, but never so far that the stage in the middle drops under 420 px
const STAGE_MIN = 420;
const left = usePanelWidth(
  'ride',
  300,
  240,
  () => Math.min(520, window.innerWidth - right.width.value - STAGE_MIN),
  1,
);
const right = usePanelWidth(
  'movie',
  300,
  240,
  () => Math.min(520, window.innerWidth - left.width.value - STAGE_MIN),
  -1,
);

const stage = ref<InstanceType<typeof VideoStage> | null>(null);
const movie = ref<InstanceType<typeof MoviePanel> | null>(null);

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
  if (!clip?.analyzed) {
    // no scan yet (or it failed): the stage explains; the previous video must not stay on screen
    await editor.close();
    return;
  }
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
  if (todo.length && !jobs.analyzeJob) await api.analysis.run(todo);
}

async function goHome(): Promise<void> {
  await editor.flush();
  await projects.refresh();
  projects.showHome = true;
}

const importing = useImport({
  onProjectsScreen: () => phase.value === 'projects',
  openProject,
});
const { pendingGroups, dropping, pickAndScan, confirmImport, onDragOver, onDrop } = importing;

useScanLifecycle({
  inEditor: () => phase.value === 'editor',
  openClip,
  startPreview: () => stage.value?.startPreview(),
});
const paletteOpen = ref(false);
/** what the command palette can reach outside the stores */
const paletteContext = {
  inEditor: () => phase.value === 'editor',
  goHome,
  pick: pickAndScan,
  make: (scope: 'all' | 'current') => movie.value?.openMovie(scope),
  seek: (t: number) => stage.value?.seek(t),
  play: (t: number) => stage.value?.play(t),
  togglePreview: () => stage.value?.startPreview(),
};
useEditorShortcuts({
  active: () => phase.value === 'editor',
  stage: () => stage.value,
  openPalette: () => (paletteOpen.value = true),
});

onMounted(async () => {
  await Promise.all([settings.init(), jobs.init(), projects.refresh(), updater.init()]);
  if (projects.activeId) await openProject(projects.activeId);
  setInterval(() => {
    if (editor.stem) localStorage.setItem(timeKey(), String(Math.round(editor.time)));
  }, 2000);
});

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
</script>

<template>
  <div
    class="relative flex h-full flex-col bg-bg0"
    @dragover="onDragOver"
    @dragleave.self="dropping = false"
    @drop="onDrop"
  >
    <div
      v-if="dropping"
      class="pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-card border border-dashed border-line2 bg-bg0/80 text-sm font-semibold text-fg"
    >
      {{
        phase === 'projects'
          ? 'Drop your videos to make a project of that ride'
          : `Drop your videos to add them to “${projects.active?.name}”`
      }}
    </div>
    <TopBar
      :in-editor="phase === 'editor'"
      :title="
        phase === 'projects'
          ? 'Projects'
          : phase === 'scanning'
            ? 'Scanning'
            : (projects.active?.name ?? '')
      "
      @make="movie?.openMovie($event)"
      @home="goHome"
    />
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
      <main
        class="grid min-h-0 flex-1"
        :style="{
          gridTemplateColumns: `${left.width.value}px 1px minmax(0,1fr) 1px ${right.width.value}px`,
        }"
      >
        <RideRail @pick="pickAndScan" @seek="stage?.seek($event)" @play="stage?.play($event)" />
        <PanelSplitter :panel="left" />
        <VideoStage
          ref="stage"
          :framing="movie?.framingActive ?? false"
          @scan="api.analysis.run([$event])"
        />
        <PanelSplitter :panel="right" />
        <MoviePanel ref="movie" @watch="stage?.watchResult($event)" />
      </main>
      <Timeline @seek="stage?.seek($event)" @play="stage?.play($event)" />
    </template>
    <ImportSheet
      v-if="pendingGroups"
      :groups="pendingGroups"
      @confirm="confirmImport"
      @cancel="pendingGroups = null"
    />
    <CommandPalette v-model="paletteOpen" :context="paletteContext" />
    <SettingsModal />
    <RideCardSheet />
    <ExportOverlay @watch="stage?.watchResult($event)" />
    <TourOverlay />
    <ErrorScreen />
    <ToastHost />
  </div>
</template>
