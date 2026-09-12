<script setup lang="ts">
/**
 * The title bar is the toolbar: brand, project menu, save state, the active part, undo/redo,
 * settings and "Make my movie ▾". The bar is the window's drag handle; the OS draws its own window
 * buttons over its right end (`titlebar-area-*`), so the content stops before them. Outside the
 * editor it is a slim bar.
 */
import BrandMark from '@renderer/components/Base/BrandMark.vue';
import { ref } from 'vue';
import { PhArrowCounterClockwise, PhArrowClockwise, PhGearSix } from '@phosphor-icons/vue';
import { api } from '@renderer/api';
import { useEditorStore } from '@renderer/stores/editor';
import { useUiStore } from '@renderer/stores/ui';
import { shortName } from '@renderer/utils/format';
import ActivePartLabel from './ActivePartLabel.vue';
import MakeMovieButton from './MakeMovieButton.vue';
import ProjectMenu from './ProjectMenu.vue';

defineProps<{ inEditor: boolean; title?: string }>();
const emit = defineEmits<{ make: [scope: 'all' | 'current']; home: [] }>();
const editor = useEditorStore();
const ui = useUiStore();

const projectMenu = ref<InstanceType<typeof ProjectMenu> | null>(null);
const makeMenu = ref<InstanceType<typeof MakeMovieButton> | null>(null);
function closeMenus(): void {
  projectMenu.value?.close();
  makeMenu.value?.close();
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
        <ProjectMenu ref="projectMenu" @home="emit('home')" />
        <span v-if="editor.stem" class="ml-1 h-7 truncate text-xs leading-7 text-fg3">
          {{ shortName(editor.stem) }} · {{ editor.dirty ? 'Saving…' : 'Saved' }}
        </span>
      </template>
      <span v-else-if="title" class="ml-1 h-7 text-xs leading-7 text-fg3">/ {{ title }}</span>

      <!-- centre: the active part, or the movie so far -->
      <ActivePartLabel v-if="inEditor" />
      <div v-else class="flex h-7 min-w-0 flex-1 items-center justify-center px-3 text-center" />

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
        <MakeMovieButton v-if="inEditor" ref="makeMenu" @make="emit('make', $event)" />
      </div>
    </header>
  </div>
</template>
