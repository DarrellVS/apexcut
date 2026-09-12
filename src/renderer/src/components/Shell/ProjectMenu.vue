<script setup lang="ts">
/**
 * The project in the title bar: its name, and the menu behind it — all projects, rename, the ride
 * card, and the `.apexcut` file. Renaming happens in place.
 */
import { nextTick, ref } from 'vue';
import {
  PhCaretDown,
  PhExport,
  PhImageSquare,
  PhPencilSimple,
  PhSquaresFour,
} from '@phosphor-icons/vue';
import { usePopover } from '@renderer/composables/usePopover';
import { useRideCard } from '@renderer/composables/useRideCard';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const emit = defineEmits<{ home: [] }>();
const library = useLibraryStore();
const projects = useProjectsStore();
const rideCard = useRideCard();
const menu = usePopover();

const renaming = ref(false);
const renameValue = ref('');
const renameInput = ref<HTMLInputElement | null>(null);

async function startRename(): Promise<void> {
  menu.close();
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
  menu.close();
  if (!projects.activeId) return;
  const file = await projects.exportFile(projects.activeId);
  if (file) toast(`Project saved as ${file}`, 6000);
}
defineExpose({ close: menu.close });
</script>

<template>
  <div ref="menu.root" class="no-drag relative">
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
      :class="{ 'bg-bg3': menu.open.value }"
      title="Project"
      @click.stop="menu.toggle()"
    >
      <span class="truncate">{{ projects.active?.name ?? 'Project' }}</span>
      <PhCaretDown :size="11" weight="bold" class="flex-none text-fg3" />
    </button>
    <div
      v-if="menu.open.value"
      class="popover absolute top-[calc(100%+4px)] left-0 z-30 min-w-[210px] p-1"
      @click.stop
    >
      <button
        class="menu-item"
        @click="
          menu.close();
          emit('home');
        "
      >
        <PhSquaresFour :size="15" /> All projects
      </button>
      <button class="menu-item" @click="startRename"><PhPencilSimple :size="15" /> Rename</button>
      <button
        class="menu-item"
        :disabled="rideCard.busy.value || !library.analyzed.length"
        title="A picture with the numbers of this ride and its best moments, for Instagram or the group chat. Saved next to your movies and copied to the clipboard."
        @click="
          menu.close();
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
</template>
