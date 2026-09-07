<script setup lang="ts">
/**
 * Top bar: brand, project name (menu: all projects / rename / export), open video + save state,
 * the active part (hover / selection / playing), undo/redo and "Make my movie ▾".
 */
import { computed, nextTick, ref } from 'vue';
import {
  PhArrowCounterClockwise,
  PhArrowClockwise,
  PhCaretDown,
  PhExport,
  PhPencilSimple,
  PhSquaresFour,
} from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { fmtDuration, fmtTime, shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const emit = defineEmits<{ make: [scope: 'all' | 'current']; home: [] }>();
const editor = useEditorStore();
const library = useLibraryStore();
const projects = useProjectsStore();
const menuOpen = ref(false);
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
  return `${n} parts${all.length > 1 ? ` from ${all.length} videos` : ''} · ${fmtDuration(s)}`;
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
</script>

<template>
  <header
    class="glass relative z-40 flex items-center gap-2.5 px-3.5 py-2"
    @click.self="closeMenus"
  >
    <button
      class="flex items-center gap-2 rounded-ctl py-0.5 pr-1.5 hover:bg-s2"
      title="All projects"
      @click="emit('home')"
    >
      <div
        class="grid h-7 w-7 place-items-center rounded-[9px] bg-gradient-to-br from-acc1 to-acc2 text-[13px] font-extrabold text-white"
      >
        A
      </div>
      <b class="text-fg">ApexCut</b>
    </button>
    <span class="text-muted">/</span>
    <div class="relative">
      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="w-[220px] rounded-ctl border border-sel bg-s2 px-2 py-0.5 text-sm font-semibold text-fg outline-none"
        maxlength="80"
        @keydown.enter="commitRename"
        @keydown.esc="renaming = false"
        @blur="commitRename"
      />
      <button
        v-else
        class="flex max-w-[260px] items-center gap-1 rounded-ctl px-1.5 py-0.5 text-sm font-semibold text-fg hover:bg-s2"
        :class="{ 'bg-s2': projectMenu }"
        title="Project"
        @click.stop="
          projectMenu = !projectMenu;
          menuOpen = false;
        "
      >
        <span class="truncate">{{ projects.active?.name ?? 'Project' }}</span>
        <PhCaretDown :size="12" weight="bold" class="flex-none text-muted" />
      </button>
      <div
        v-if="projectMenu"
        class="popover absolute top-[calc(100%+6px)] left-0 z-30 min-w-[220px] p-1.5 text-sm"
        @click.stop
      >
        <button
          class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
          @click="
            projectMenu = false;
            emit('home');
          "
        >
          <PhSquaresFour :size="15" /> All projects
        </button>
        <button
          class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
          @click="startRename"
        >
          <PhPencilSimple :size="15" /> Rename
        </button>
        <button
          class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
          @click="exportProject"
        >
          <PhExport :size="15" /> Export project…
        </button>
      </div>
    </div>
    <span v-if="editor.stem" class="truncate text-xs text-muted">
      {{ shortName(editor.stem) }} · {{ editor.dirty ? 'Saving…' : 'Saved' }}
    </span>
    <div class="min-w-0 flex-1 text-center">
      <Transition
        mode="out-in"
        enter-active-class="transition-opacity duration-150"
        leave-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <span
          v-if="editor.activePart"
          :key="editor.activePart.id"
          class="inline-block max-w-full truncate text-[15px]"
        >
          <b>{{ REASON_LABEL[reasonOf(editor.activePart)] }}</b>
          <span class="ml-1.5 text-muted">{{ why(editor.activePart) }}</span>
        </span>
        <span v-else class="text-xs text-muted">{{ summary }}</span>
      </Transition>
    </div>
    <button
      class="btn btn-ghost px-2"
      title="Undo (Ctrl+Z)"
      :disabled="!editor.history.length"
      @click="editor.undo()"
    >
      <PhArrowCounterClockwise :size="18" />
    </button>
    <button
      class="btn btn-ghost px-2"
      title="Redo (Ctrl+Y)"
      :disabled="!editor.future.length"
      @click="editor.redo()"
    >
      <PhArrowClockwise :size="18" />
    </button>
    <div class="relative flex">
      <button class="btn btn-pri rounded-r-none" :disabled="!canMake" @click="choose('all')">
        Make my movie
      </button>
      <button
        class="btn btn-pri rounded-l-none border-l border-black/20 px-2.5"
        :disabled="!canMake"
        title="More options"
        @click.stop="
          menuOpen = !menuOpen;
          projectMenu = false;
        "
      >
        <PhCaretDown :size="14" weight="bold" />
      </button>
      <div
        v-if="menuOpen"
        class="popover absolute top-[calc(100%+6px)] right-0 z-30 min-w-[280px] p-1.5"
        @click.stop
      >
        <div class="cursor-pointer rounded-lg px-3 py-2 hover:bg-s2" @click="choose('all')">
          <b class="block text-sm">All videos</b>
          <span class="text-xs text-muted">{{ summary }}</span>
        </div>
        <div
          v-if="library.currentClip"
          class="cursor-pointer rounded-lg px-3 py-2 hover:bg-s2"
          @click="choose('current')"
        >
          <b class="block text-sm">Only this video</b>
          <span class="text-xs text-muted">
            {{ shortName(library.currentClip.stem) }} · {{ editor.enabledParts.length }} parts ·
            {{ fmtDuration(editor.movieLength) }}
          </span>
        </div>
      </div>
    </div>
  </header>
</template>
