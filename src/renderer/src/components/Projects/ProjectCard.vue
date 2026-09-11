<script setup lang="ts">
/** One project on the projects screen: thumbnail, name, facts, last edit, and its menu. */
import { nextTick, ref } from 'vue';
import {
  PhArchive,
  PhArrowCounterClockwise,
  PhDotsThree,
  PhExport,
  PhPencilSimple,
  PhTrash,
} from '@phosphor-icons/vue';
import type { ProjectInfo } from '@shared/ipc';
import { fmtDuration, fmtWhen } from '@renderer/utils/format';

const props = defineProps<{ project: ProjectInfo; active: boolean; menuOpen: boolean }>();
const emit = defineEmits<{
  open: [];
  menu: [open: boolean];
  rename: [name: string];
  export: [];
  archive: [on: boolean];
  delete: [];
}>();

const renaming = ref(false);
const renameValue = ref('');
const renameInput = ref<HTMLInputElement | null>(null);
const confirmDelete = ref(false);

function thumb(p: ProjectInfo): string | null {
  return p.thumbStem ? `apexcut://media/clip/${encodeURIComponent(p.thumbStem)}/thumb.jpg` : null;
}
function meta(p: ProjectInfo): string {
  if (!p.nClips) return 'No videos yet';
  const v = `${p.nClips} video${p.nClips === 1 ? '' : 's'}`;
  if (!p.nParts) return `${v} · no parts yet`;
  return `${v} · ${p.nParts} parts · ${fmtDuration(p.highlightS)}`;
}
async function startRename(): Promise<void> {
  emit('menu', false);
  renameValue.value = props.project.name;
  renaming.value = true;
  await nextTick();
  renameInput.value?.focus();
  renameInput.value?.select();
}
function commitRename(): void {
  if (!renaming.value) return;
  renaming.value = false;
  const name = renameValue.value.trim();
  if (name && name !== props.project.name) emit('rename', name);
}
function onCardClick(): void {
  if (renaming.value || confirmDelete.value) return;
  emit('open');
}
</script>

<template>
  <article
    class="group relative flex cursor-pointer flex-col rounded-card border bg-bg2 transition-colors hover:border-line2"
    :class="[
      active ? 'border-sel hover:border-sel' : 'border-line',
      { 'opacity-70': project.archived, 'z-30': menuOpen },
    ]"
    tabindex="0"
    @click="onCardClick"
    @keydown.enter.self="onCardClick"
  >
    <div class="relative aspect-video overflow-hidden rounded-t-[5px] bg-bg3">
      <img
        v-if="thumb(project)"
        :src="thumb(project)!"
        alt=""
        class="h-full w-full object-cover"
        @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
      />
      <div v-else class="grid h-full w-full place-items-center text-xs text-fg3">No videos yet</div>
      <span
        v-if="active"
        class="absolute top-2 left-2 rounded-[3px] bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-ink-fg"
      >
        Open
      </span>
      <button
        class="chip absolute top-2 right-2 grid h-6 w-6 place-items-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        :class="{ 'opacity-100': menuOpen }"
        title="More"
        :aria-label="`More options for ${project.name}`"
        @click.stop="emit('menu', !menuOpen)"
      >
        <PhDotsThree :size="16" weight="bold" />
      </button>
    </div>
    <div
      v-if="menuOpen"
      class="popover absolute top-[40px] right-2 z-20 min-w-[190px] p-1"
      role="menu"
      @click.stop
    >
      <button class="menu-item" role="menuitem" @click="startRename">
        <PhPencilSimple :size="15" /> Rename
      </button>
      <button
        class="menu-item"
        role="menuitem"
        @click="
          emit('menu', false);
          emit('export');
        "
      >
        <PhExport :size="15" /> Export project…
      </button>
      <button
        class="menu-item"
        role="menuitem"
        @click="
          emit('menu', false);
          emit('archive', !project.archived);
        "
      >
        <PhArrowCounterClockwise v-if="project.archived" :size="15" />
        <PhArchive v-else :size="15" />
        {{ project.archived ? 'Unarchive' : 'Archive' }}
      </button>
      <button
        class="menu-item text-danger"
        role="menuitem"
        @click="
          emit('menu', false);
          confirmDelete = true;
        "
      >
        <PhTrash :size="15" /> Delete
      </button>
    </div>

    <div v-if="confirmDelete" class="flex flex-col gap-2 p-3" @click.stop>
      <p class="m-0 text-xs text-fg">
        Delete “{{ project.name }}”? Your videos and their scans stay; only this project's picks go.
      </p>
      <div class="flex gap-1.5">
        <button
          class="btn btn-mini btn-danger"
          @click="
            confirmDelete = false;
            emit('delete');
          "
        >
          Delete
        </button>
        <button class="btn btn-mini" @click="confirmDelete = false">Keep</button>
      </div>
    </div>
    <div v-else class="flex flex-col gap-0.5 px-3 py-2.5">
      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="input h-6 w-full font-semibold"
        maxlength="80"
        aria-label="Project name"
        @click.stop
        @keydown.enter="commitRename"
        @keydown.esc="renaming = false"
        @blur="commitRename"
      />
      <b v-else class="truncate text-[13px] font-semibold text-fg" :title="project.name">
        {{ project.name }}
      </b>
      <div class="num flex items-center justify-between gap-2 text-xs text-fg2">
        <span class="truncate">{{ meta(project) }}</span>
        <span class="flex-none text-fg3">{{ fmtWhen(project.updatedAt) }}</span>
      </div>
    </div>
  </article>
</template>
