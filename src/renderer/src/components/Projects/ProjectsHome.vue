<script setup lang="ts">
/**
 * Projects screen: every project as a card (thumbnail, name, videos · parts · length, last edit),
 * with rename / export / delete on the card and "New project" / "Import project…" at the top.
 */
import { nextTick, ref } from 'vue';
import {
  PhArrowSquareIn,
  PhDotsThree,
  PhExport,
  PhPencilSimple,
  PhPlus,
  PhTrash,
} from '@phosphor-icons/vue';
import type { ProjectInfo } from '@shared/ipc';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';
import { fmtDuration, fmtWhen } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const emit = defineEmits<{ open: [id: string] }>();
const projects = useProjectsStore();
const editor = useEditorStore();

const creating = ref(false);
const newName = ref('');
const newInput = ref<HTMLInputElement | null>(null);
const menuFor = ref<string | null>(null);
const renaming = ref<string | null>(null);
const renameValue = ref('');
const confirmDelete = ref<string | null>(null);

function thumb(p: ProjectInfo): string | null {
  return p.thumbStem ? `apexcut://media/clip/${encodeURIComponent(p.thumbStem)}/thumb.jpg` : null;
}
function meta(p: ProjectInfo): string {
  if (!p.nClips) return 'No videos yet';
  const v = `${p.nClips} video${p.nClips === 1 ? '' : 's'}`;
  if (!p.nParts) return `${v} · no parts yet`;
  return `${v} · ${p.nParts} parts · ${fmtDuration(p.highlightS)}`;
}

async function startCreate(): Promise<void> {
  creating.value = true;
  newName.value = '';
  await nextTick();
  newInput.value?.focus();
}
async function create(): Promise<void> {
  const name = newName.value.trim();
  if (!name) {
    creating.value = false;
    return;
  }
  creating.value = false;
  emit('open', await projects.create(name));
}

function startRename(p: ProjectInfo): void {
  menuFor.value = null;
  renaming.value = p.id;
  renameValue.value = p.name;
  nextTick(() => {
    const el = document.getElementById(`rename-${p.id}`) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  });
}
async function commitRename(): Promise<void> {
  const id = renaming.value;
  renaming.value = null;
  if (id && renameValue.value.trim()) await projects.rename(id, renameValue.value);
}

async function exportProject(p: ProjectInfo): Promise<void> {
  menuFor.value = null;
  const file = await projects.exportFile(p.id);
  if (file) toast(`Project saved as ${file}`, 6000);
}
async function importProject(): Promise<void> {
  const r = await projects.importFile();
  if (!r) return;
  if (r.missing.length) {
    toast(
      `Imported, but ${r.missing.length} video file${r.missing.length === 1 ? ' was' : 's were'} not found on this computer`,
      7000,
    );
  }
  emit('open', r.id);
}
async function remove(p: ProjectInfo): Promise<void> {
  confirmDelete.value = null;
  // the open project goes: drop the editor's state so nothing of it is saved into the next project
  if (p.id === projects.activeId) await editor.close();
  await projects.remove(p.id);
  toast(`“${p.name}” deleted. Your videos and their scans are untouched.`, 5000);
}

function onCardClick(p: ProjectInfo): void {
  if (renaming.value === p.id || confirmDelete.value === p.id) return;
  emit('open', p.id);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col items-center overflow-auto py-6" @click="menuFor = null">
    <div class="w-full max-w-[980px] px-4">
      <header class="mb-6 flex items-center gap-3">
        <div
          class="grid h-10 w-10 place-items-center rounded-[12px] bg-gradient-to-br from-acc1 to-acc2 text-lg font-extrabold text-white shadow-float"
        >
          A
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="m-0 text-xl font-bold text-fg">Your projects</h1>
          <p class="m-0 text-xs text-muted">
            A project is one movie: the videos of a ride and your picks.
          </p>
        </div>
        <button class="btn flex items-center gap-1.5" @click.stop="importProject">
          <PhArrowSquareIn :size="16" /> Import project…
        </button>
        <button class="btn btn-pri flex items-center gap-1.5" @click.stop="startCreate">
          <PhPlus :size="16" weight="bold" /> New project
        </button>
      </header>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        <form
          v-if="creating"
          class="glass flex flex-col gap-2 p-3"
          @submit.prevent="create"
          @click.stop
        >
          <div
            class="grid aspect-video place-items-center rounded-[10px] bg-gradient-to-br from-acc1/30 to-acc2/30 text-sm text-muted"
          >
            New project
          </div>
          <input
            ref="newInput"
            v-model="newName"
            class="w-full rounded-ctl border border-line bg-s2 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-sel"
            placeholder="Name it after the ride, e.g. Eifel Sunday"
            maxlength="80"
            @keydown.esc="creating = false"
          />
          <div class="flex gap-1.5">
            <button type="submit" class="btn btn-pri btn-mini flex-1" :disabled="!newName.trim()">
              Create
            </button>
            <button type="button" class="btn btn-mini" @click="creating = false">Cancel</button>
          </div>
        </form>

        <article
          v-for="p in projects.sorted"
          :key="p.id"
          class="glass group relative flex cursor-pointer flex-col gap-2 p-3 transition-transform hover:-translate-y-0.5"
          :class="{ 'ring-2 ring-sel': p.id === projects.activeId }"
          @click="onCardClick(p)"
        >
          <div class="relative aspect-video overflow-hidden rounded-[10px] bg-s3">
            <img
              v-if="thumb(p)"
              :src="thumb(p)!"
              alt=""
              class="h-full w-full object-cover"
              @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
            />
            <div
              v-else
              class="grid h-full w-full place-items-center bg-gradient-to-br from-acc1/25 to-acc2/25 text-3xl font-extrabold text-fg/40"
            >
              {{ p.name.slice(0, 1).toUpperCase() }}
            </div>
            <span
              v-if="p.id === projects.activeId"
              class="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white"
            >
              Open
            </span>
            <button
              class="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75"
              :class="{ 'opacity-100': menuFor === p.id }"
              title="More"
              @click.stop="menuFor = menuFor === p.id ? null : p.id"
            >
              <PhDotsThree :size="18" weight="bold" />
            </button>
            <div
              v-if="menuFor === p.id"
              class="popover absolute top-10 right-2 z-20 min-w-[180px] p-1.5 text-sm"
              @click.stop
            >
              <button
                class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
                @click="startRename(p)"
              >
                <PhPencilSimple :size="15" /> Rename
              </button>
              <button
                class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-s2"
                @click="exportProject(p)"
              >
                <PhExport :size="15" /> Export project…
              </button>
              <button
                class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-play hover:bg-s2"
                @click="
                  menuFor = null;
                  confirmDelete = p.id;
                "
              >
                <PhTrash :size="15" /> Delete
              </button>
            </div>
          </div>

          <div v-if="confirmDelete === p.id" class="flex flex-col gap-2" @click.stop>
            <p class="m-0 text-sm text-fg">
              Delete “{{ p.name }}”? Your videos and their scans stay; only this project's picks go.
            </p>
            <div class="flex gap-1.5">
              <button class="btn btn-mini bg-play text-white hover:bg-play" @click="remove(p)">
                Delete
              </button>
              <button class="btn btn-mini" @click="confirmDelete = null">Keep</button>
            </div>
          </div>
          <template v-else>
            <input
              v-if="renaming === p.id"
              :id="`rename-${p.id}`"
              v-model="renameValue"
              class="w-full rounded-ctl border border-sel bg-s2 px-2 py-1 text-sm font-semibold text-fg outline-none"
              maxlength="80"
              @click.stop
              @keydown.enter="commitRename"
              @keydown.esc="renaming = null"
              @blur="commitRename"
            />
            <b v-else class="truncate text-[15px] text-fg" :title="p.name">{{ p.name }}</b>
            <div class="flex items-center justify-between text-xs text-muted">
              <span>{{ meta(p) }}</span>
              <span>{{ fmtWhen(p.updatedAt) }}</span>
            </div>
          </template>
        </article>
      </div>
    </div>
  </div>
</template>
