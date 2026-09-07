<script setup lang="ts">
/**
 * Projects screen: search + sort, "New project" / "Import project…", a grid of cards and a collapsed
 * Archived section. Card actions (rename, export, archive, delete) live in ProjectCard.
 */
import BrandMark from '@renderer/components/Base/BrandMark.vue';
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
  <div class="flex min-h-0 flex-1 flex-col items-center overflow-auto py-6" @click="menuFor = null">
    <div class="w-full max-w-[980px] px-4">
      <header class="mb-5 flex items-center gap-3">
        <BrandMark :size="40" />
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

      <div
        v-if="projects.projects.length > 3 || projects.query"
        class="mb-4 flex items-center gap-2"
      >
        <label class="relative min-w-0 flex-1">
          <PhMagnifyingGlass
            :size="15"
            class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <input
            v-model="projects.query"
            type="search"
            class="w-full rounded-ctl border border-line bg-s2 py-1.5 pr-3 pl-9 text-sm text-fg outline-none focus:border-sel"
            placeholder="Search projects"
            aria-label="Search projects"
          />
        </label>
        <div class="flex rounded-ctl bg-s2 p-0.5" role="radiogroup" aria-label="Sort by">
          <button
            v-for="s in SORTS"
            :key="s.id"
            class="rounded-lg px-2.5 py-1 text-xs font-semibold"
            :class="projects.sort === s.id ? 'bg-s3 text-fg' : 'text-muted hover:text-fg'"
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
            aria-label="New project name"
            @keydown.esc="creating = false"
          />
          <div class="flex gap-1.5">
            <button type="submit" class="btn btn-pri btn-mini flex-1" :disabled="!newName.trim()">
              Create
            </button>
            <button type="button" class="btn btn-mini" @click="creating = false">Cancel</button>
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
        class="m-0 mt-6 text-center text-sm text-muted"
      >
        No project matches “{{ projects.query }}”.
      </p>

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
