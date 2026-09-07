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
    class="glass group relative flex cursor-pointer flex-col gap-2 p-3 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-sel"
    :class="{ 'ring-2 ring-sel': active, 'opacity-80': project.archived }"
    tabindex="0"
    @click="onCardClick"
    @keydown.enter.self="onCardClick"
  >
    <div class="relative aspect-video overflow-hidden rounded-[10px] bg-s3">
      <img
        v-if="thumb(project)"
        :src="thumb(project)!"
        alt=""
        class="h-full w-full object-cover"
        @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
      />
      <div
        v-else
        class="grid h-full w-full place-items-center bg-gradient-to-br from-acc1/25 to-acc2/25 text-3xl font-extrabold text-fg/40"
      >
        {{ project.name.slice(0, 1).toUpperCase() }}
      </div>
      <span
        v-if="active"
        class="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white"
      >
        Open
      </span>
      <button
        class="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/75"
        :class="{ 'opacity-100': menuOpen }"
        title="More"
        :aria-label="`More options for ${project.name}`"
        @click.stop="emit('menu', !menuOpen)"
      >
        <PhDotsThree :size="18" weight="bold" />
      </button>
      <div
        v-if="menuOpen"
        class="popover absolute top-10 right-2 z-20 min-w-[190px] p-1.5 text-sm"
        role="menu"
        @click.stop
      >
        <button
          class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
          role="menuitem"
          @click="startRename"
        >
          <PhPencilSimple :size="15" /> Rename
        </button>
        <button
          class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
          role="menuitem"
          @click="
            emit('menu', false);
            emit('export');
          "
        >
          <PhExport :size="15" /> Export project…
        </button>
        <button
          class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
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
          class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-play hover:bg-s2"
          role="menuitem"
          @click="
            emit('menu', false);
            confirmDelete = true;
          "
        >
          <PhTrash :size="15" /> Delete
        </button>
      </div>
    </div>

    <div v-if="confirmDelete" class="flex flex-col gap-2" @click.stop>
      <p class="m-0 text-sm text-fg">
        Delete “{{ project.name }}”? Your videos and their scans stay; only this project's picks go.
      </p>
      <div class="flex gap-1.5">
        <button
          class="btn btn-mini bg-play text-white hover:bg-play"
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
    <template v-else>
      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="w-full rounded-ctl border border-sel bg-s2 px-2 py-1 text-sm font-semibold text-fg outline-none"
        maxlength="80"
        aria-label="Project name"
        @click.stop
        @keydown.enter="commitRename"
        @keydown.esc="renaming = false"
        @blur="commitRename"
      />
      <b v-else class="truncate text-[15px] text-fg" :title="project.name">{{ project.name }}</b>
      <div class="flex items-center justify-between text-xs text-muted">
        <span>{{ meta(project) }}</span>
        <span>{{ fmtWhen(project.updatedAt) }}</span>
      </div>
    </template>
  </article>
</template>
