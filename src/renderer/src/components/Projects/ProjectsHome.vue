<script setup lang="ts">
/**
 * Projects screen: search + sort, "New project" / "Import project…", a grid of cards and a collapsed
 * Archived section. Card actions (rename, export, archive, delete) live in ProjectCard.
 */
import { nextTick, ref } from 'vue';
import { PhArrowSquareIn, PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue';
import type { ProjectInfo } from '@shared/ipc';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore, type ProjectSort } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import ProjectCard from './ProjectCard.vue';

const emit = defineEmits<{ open: [id: string] }>();
const projects = useProjectsStore();
const editor = useEditorStore();

const creating = ref(false);
const newName = ref('');
const newInput = ref<HTMLInputElement | null>(null);
const menuFor = ref<string | null>(null);
const SORTS: { id: ProjectSort; label: string }[] = [
  { id: 'edited', label: 'Last edited' },
  { id: 'name', label: 'Name' },
  { id: 'length', label: 'Movie length' },
];

async function startCreate(): Promise<void> {
  creating.value = true;
  newName.value = '';
  await nextTick();
  newInput.value?.focus();
}
async function create(): Promise<void> {
  const name = newName.value.trim();
  creating.value = false;
  if (name) emit('open', await projects.create(name));
}
async function exportProject(p: ProjectInfo): Promise<void> {
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
  // the open project goes: drop the editor's state so nothing of it is saved into the next project
  if (p.id === projects.activeId) await editor.close();
  await projects.remove(p.id);
  toast(`“${p.name}” deleted. Your videos and their scans are untouched.`, 5000);
}
async function archive(p: ProjectInfo, on: boolean): Promise<void> {
  if (on && p.id === projects.activeId) await editor.close();
  await projects.archive(p.id, on);
  toast(on ? `“${p.name}” archived` : `“${p.name}” is back`);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-auto" @click="menuFor = null">
    <div class="mx-auto w-full max-w-[1100px] px-8 py-7">
      <header class="mb-5 flex items-end gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="m-0 text-lg font-semibold text-fg">Projects</h1>
          <p class="m-0 text-xs text-fg2">One project is one ride and one movie.</p>
        </div>
        <button class="btn" @click.stop="importProject">
          <PhArrowSquareIn :size="15" /> Import project…
        </button>
        <button class="btn btn-pri" @click.stop="startCreate">
          <PhPlus :size="14" weight="bold" /> New project
        </button>
      </header>

      <div
        v-if="projects.projects.length > 3 || projects.query"
        class="mb-4 flex items-center gap-2"
      >
        <label class="relative min-w-0 flex-1 max-w-[360px]">
          <PhMagnifyingGlass
            :size="14"
            class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg3"
          />
          <input
            v-model="projects.query"
            type="search"
            class="input w-full pl-8"
            placeholder="Search projects"
            aria-label="Search projects"
          />
        </label>
        <div class="seg ml-auto" role="radiogroup" aria-label="Sort by">
          <button
            v-for="s in SORTS"
            :key="s.id"
            class="seg-item"
            role="radio"
            :aria-checked="projects.sort === s.id"
            @click="projects.setSort(s.id)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        <form
          v-if="creating"
          class="flex flex-col rounded-card border border-sel bg-bg2"
          @submit.prevent="create"
          @click.stop
        >
          <div class="grid aspect-video place-items-center rounded-t-[5px] bg-bg3 text-xs text-fg3">
            New project
          </div>
          <div class="flex flex-col gap-2 p-3">
            <input
              ref="newInput"
              v-model="newName"
              class="input w-full"
              placeholder="Name it after the ride, e.g. Eifel Sunday"
              maxlength="80"
              aria-label="New project name"
              @keydown.esc="creating = false"
            />
            <div class="flex gap-1.5">
              <button type="submit" class="btn btn-pri btn-mini flex-1" :disabled="!newName.trim()">
                Create
              </button>
              <button type="button" class="btn btn-mini" @click="creating = false">Cancel</button>
            </div>
          </div>
        </form>
        <ProjectCard
          v-for="p in projects.sorted"
          :key="p.id"
          :project="p"
          :active="p.id === projects.activeId"
          :menu-open="menuFor === p.id"
          @open="emit('open', p.id)"
          @menu="menuFor = $event ? p.id : null"
          @rename="projects.rename(p.id, $event)"
          @export="exportProject(p)"
          @archive="archive(p, $event)"
          @delete="remove(p)"
        />
      </div>
      <p
        v-if="!projects.sorted.length && projects.query"
        class="m-0 mt-6 text-center text-[13px] text-fg2"
      >
        No project matches “{{ projects.query }}”.
      </p>
      <div
        v-if="!projects.projects.length && !creating"
        class="mt-2 rounded-card border border-dashed border-line2 p-10 text-center text-[13px] text-fg2"
      >
        No projects yet. Start with <b class="text-fg">New project</b>, then add the videos of a
        ride.
      </div>

      <details v-if="projects.archived.length" class="mt-8">
        <summary class="label-caps cursor-pointer select-none">
          Archived · {{ projects.archived.length }}
        </summary>
        <div class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          <ProjectCard
            v-for="p in projects.archived"
            :key="p.id"
            :project="p"
            :active="false"
            :menu-open="menuFor === p.id"
            @open="archive(p, false).then(() => emit('open', p.id))"
            @menu="menuFor = $event ? p.id : null"
            @rename="projects.rename(p.id, $event)"
            @export="exportProject(p)"
            @archive="archive(p, $event)"
            @delete="remove(p)"
          />
        </div>
      </details>
    </div>
  </div>
</template>
