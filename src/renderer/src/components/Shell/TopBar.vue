<script setup lang="ts">
/**
 * The title bar is the toolbar: brand, project (menu: all projects / rename / export), save state,
 * the active part (hover / selection / playing), undo/redo, settings and "Make my movie ▾".
 * The bar is the window's drag handle; the OS draws its own window buttons over its right end
 * (`titlebar-area-*`), so the content stops before them. Outside the editor it is a slim bar.
 */
import BrandMark from '@renderer/components/Base/BrandMark.vue';
import { computed, nextTick, ref } from 'vue';
import {
  PhArrowCounterClockwise,
  PhArrowClockwise,
  PhCaretDown,
  PhExport,
  PhGearSix,
  PhImageSquare,
  PhPencilSimple,
  PhSquaresFour,
} from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { api } from '@renderer/api';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useUiStore } from '@renderer/stores/ui';
import { fmtDuration, fmtTime, shortName, plural } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { useRideCard } from '@renderer/composables/useRideCard';
import { useDismiss } from '@renderer/composables/useDismiss';

defineProps<{ inEditor: boolean; title?: string }>();
const emit = defineEmits<{ make: [scope: 'all' | 'current']; home: [] }>();
const editor = useEditorStore();
const library = useLibraryStore();
const projects = useProjectsStore();
const ui = useUiStore();
const menuOpen = ref(false);
const rideCard = useRideCard();
const projectMenu = ref(false);
const renaming = ref(false);
const renameValue = ref('');
const renameInput = ref<HTMLInputElement | null>(null);

function why(p: Part): string {
  const bits = [`${fmtTime(p.start_s)} – ${fmtTime(p.end_s)}`, fmtDuration(p.end_s - p.start_s)];
  if (p.max_lean_deg) bits.push(`up to ${Math.round(p.max_lean_deg)}° lean`);
  if ((p.max_brake_g ?? 0) > 0.25) bits.push(`braking ${p.max_brake_g!.toFixed(1)} g`);
  if ((p.max_accel_g ?? 0) > 0.25) bits.push(`acceleration ${p.max_accel_g!.toFixed(1)} g`);
  if (p.parts) bits.push(`${p.parts.length} parts joined`);
  if (!p.enabled) bits.push('left out');
  return bits.join(' · ');
}

const summary = computed(() => {
  const all = library.analyzed;
  const n = all.reduce((a, c) => a + (c.nEnabled ?? 0), 0);
  const s = all.reduce((a, c) => a + (c.highlightS ?? 0), 0);
  if (!n) return 'No parts selected yet';
  return `${plural(n, 'part')}${all.length > 1 ? ` from ${plural(all.length, 'video')}` : ''} · ${fmtDuration(s)}`;
});
const canMake = computed(() => library.analyzed.some((c) => (c.nEnabled ?? 0) > 0));

function choose(scope: 'all' | 'current'): void {
  menuOpen.value = false;
  emit('make', scope);
}
function closeMenus(): void {
  menuOpen.value = false;
  projectMenu.value = false;
}
const projectRoot = ref<HTMLElement | null>(null);
const makeRoot = ref<HTMLElement | null>(null);
useDismiss(projectRoot, () => (projectMenu.value = false));
useDismiss(makeRoot, () => (menuOpen.value = false));
async function startRename(): Promise<void> {
  projectMenu.value = false;
  renameValue.value = projects.active?.name ?? '';
  renaming.value = true;
  await nextTick();
  renameInput.value?.focus();
  renameInput.value?.select();
}
async function commitRename(): Promise<void> {
  if (!renaming.value) return;
  renaming.value = false;
  const id = projects.activeId;
  if (id && renameValue.value.trim() && renameValue.value.trim() !== projects.active?.name) {
    await projects.rename(id, renameValue.value);
  }
}
async function exportProject(): Promise<void> {
  projectMenu.value = false;
  if (!projects.activeId) return;
  const file = await projects.exportFile(projects.activeId);
  if (file) toast(`Project saved as ${file}`, 6000);
}
/** double-click on the bare bar: maximise / restore, like a native title bar */
function onDblClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest('.no-drag')) return;
  api.window.titlebarDoubleClick();
}
</script>

<template>
  <div
    v-if="!ui.win.fullscreen"
    class="relative z-40 flex h-[var(--titlebar-h)] flex-none bg-bg0 shadow-[inset_0_-1px_0_var(--line)] select-none"
    :class="{ 'opacity-60': !ui.win.focused }"
  >
    <header
      class="drag-region flex min-w-0 items-center gap-1 pl-3 [margin-left:env(titlebar-area-x,0px)] [width:env(titlebar-area-width,100%)]"
      @click.self="closeMenus"
      @dblclick="onDblClick"
    >
      <button
        class="no-drag flex h-7 items-center gap-2 rounded-ctl px-1.5 text-fg hover:bg-bg3"
        title="All projects"
        @click="emit('home')"
      >
        <BrandMark :size="16" />
        <span class="text-[13px] font-semibold tracking-tight">ApexCut</span>
      </button>

      <template v-if="inEditor">
        <span class="h-7 leading-7 text-fg3">/</span>
        <div ref="projectRoot" class="no-drag relative">
          <input
            v-if="renaming"
            ref="renameInput"
            v-model="renameValue"
            class="input h-7 w-[220px] font-semibold"
            maxlength="80"
            @keydown.enter="commitRename"
            @keydown.esc="renaming = false"
            @blur="commitRename"
          />
          <button
            v-else
            class="flex h-7 max-w-[260px] items-center gap-1 rounded-ctl px-1.5 text-[13px] font-semibold text-fg hover:bg-bg3"
            :class="{ 'bg-bg3': projectMenu }"
            title="Project"
            @click.stop="
              projectMenu = !projectMenu;
              menuOpen = false;
            "
          >
            <span class="truncate">{{ projects.active?.name ?? 'Project' }}</span>
            <PhCaretDown :size="11" weight="bold" class="flex-none text-fg3" />
          </button>
          <div
            v-if="projectMenu"
            class="popover absolute top-[calc(100%+4px)] left-0 z-30 min-w-[210px] p-1"
            @click.stop
          >
            <button
              class="menu-item"
              @click="
                projectMenu = false;
                emit('home');
              "
            >
              <PhSquaresFour :size="15" /> All projects
            </button>
            <button class="menu-item" @click="startRename">
              <PhPencilSimple :size="15" /> Rename
            </button>
            <button
              class="menu-item"
              :disabled="rideCard.busy.value || !library.analyzed.length"
              title="A picture with the numbers of this ride and its best moments, for Instagram or the group chat. Saved next to your movies and copied to the clipboard."
              @click="
                projectMenu = false;
                rideCard.make();
              "
            >
              <PhImageSquare :size="15" />
              {{ rideCard.busy.value ? 'Making the ride card…' : 'Make ride card' }}
            </button>
            <button class="menu-item" @click="exportProject">
              <PhExport :size="15" /> Export project…
            </button>
          </div>
        </div>
        <span v-if="inEditor && editor.stem" class="ml-1 h-7 truncate text-xs leading-7 text-fg3">
          {{ shortName(editor.stem!) }} · {{ editor.dirty ? 'Saving…' : 'Saved' }}
        </span>
      </template>
      <span v-else-if="title" class="ml-1 h-7 text-xs leading-7 text-fg3">/ {{ title }}</span>

      <!-- centre: the active part, or the movie so far -->
      <div class="flex h-7 min-w-0 flex-1 items-center justify-center px-3 text-center">
        <Transition
          v-if="inEditor"
          mode="out-in"
          enter-active-class="transition-opacity duration-150"
          leave-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
        >
          <span
            v-if="editor.activePart"
            :key="editor.activePart!.id"
            class="num max-w-full truncate text-xs leading-7"
          >
            <b class="text-fg">{{ REASON_LABEL[reasonOf(editor.activePart!)] }}</b>
            <span class="ml-1.5 text-fg2">{{ why(editor.activePart!) }}</span>
          </span>
          <span v-else class="num text-xs leading-7 text-fg3">{{ summary }}</span>
        </Transition>
      </div>

      <!-- right: actions; the OS window buttons come after this -->
      <div class="no-drag flex items-center gap-0.5 pr-2">
        <template v-if="inEditor">
          <button
            class="btn btn-ghost btn-icon"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            :disabled="!editor.history.length"
            @click="editor.undo()"
          >
            <PhArrowCounterClockwise :size="16" />
          </button>
          <button
            class="btn btn-ghost btn-icon"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            :disabled="!editor.future.length"
            @click="editor.redo()"
          >
            <PhArrowClockwise :size="16" />
          </button>
        </template>
        <button
          class="btn btn-ghost btn-icon"
          title="Settings (Ctrl+,)"
          aria-label="Settings"
          @click="ui.openSettings()"
        >
          <PhGearSix :size="16" />
        </button>
        <div v-if="inEditor" ref="makeRoot" class="relative ml-1.5 flex">
          <button
            class="btn btn-pri rounded-r-none"
            :disabled="!canMake"
            :title="canMake ? 'Make the movie of all videos' : 'Pick at least one part first'"
            data-tour="make"
            @click="choose('all')"
          >
            Make my movie
          </button>
          <button
            class="btn btn-pri w-7 rounded-l-none border-l-ink-fg/20 px-0"
            :disabled="!canMake"
            title="More options"
            aria-label="More export options"
            :aria-expanded="menuOpen"
            @click.stop="
              menuOpen = !menuOpen;
              projectMenu = false;
            "
          >
            <PhCaretDown :size="12" weight="bold" />
          </button>
          <div
            v-if="menuOpen"
            class="popover absolute top-[calc(100%+4px)] right-0 z-30 min-w-[280px] p-1"
            @click.stop
          >
            <button
              class="menu-item h-auto flex-col items-start gap-0 py-1.5"
              @click="choose('all')"
            >
              <b class="text-[13px]">All videos</b>
              <span class="num text-xs text-fg2">{{ summary }}</span>
            </button>
            <button
              v-if="library.currentClip"
              class="menu-item h-auto flex-col items-start gap-0 py-1.5"
              @click="choose('current')"
            >
              <b class="text-[13px]">Only this video</b>
              <span class="num text-xs text-fg2">
                {{ shortName(library.currentClip.stem) }} ·
                {{ plural(editor.enabledParts.length, 'part') }} ·
                {{ fmtDuration(editor.movieLength) }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  </div>
</template>
