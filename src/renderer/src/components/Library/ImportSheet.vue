<script setup lang="ts">
/**
 * A pick/drop with videos from more than one day: one row per day, and the choice to add everything
 * to the open project or to make one project per day (names prefilled with the date, editable).
 */
import { computed, reactive, ref } from 'vue';
import { PhX } from '@phosphor-icons/vue';
import type { ImportGroup } from '@shared/ipc';
import { useProjectsStore } from '@renderer/stores/projects';
import { dayLabel } from '@renderer/utils/format';

const props = defineProps<{ groups: ImportGroup[] }>();
const emit = defineEmits<{
  confirm: [groups: { name: string | null; paths: string[] }[]];
  cancel: [];
}>();
const projects = useProjectsStore();

const mode = ref<'one' | 'perDay'>('perDay');
const checked = reactive<Record<string, boolean>>(
  Object.fromEntries(props.groups.map((g) => [g.day, true])),
);
const names = reactive<Record<string, string>>(
  Object.fromEntries(props.groups.map((g) => [g.day, dayLabel(g.day)])),
);
const selected = computed(() => props.groups.filter((g) => checked[g.day]));
const nVideos = computed(() => selected.value.reduce((a, g) => a + g.stems.length, 0));

function confirm(): void {
  emit(
    'confirm',
    selected.value.map((g) => ({
      name: mode.value === 'perDay' ? names[g.day].trim() || dayLabel(g.day) : null,
      paths: [...g.paths], // plain array: reactive proxies cannot cross IPC
    })),
  );
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6"
    role="dialog"
    aria-modal="true"
    aria-label="Add videos"
    @mousedown.self="emit('cancel')"
  >
    <div class="popover flex w-full max-w-[560px] flex-col gap-4 p-5">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="m-0 text-base font-semibold text-fg">Videos from {{ groups.length }} days</h2>
          <p class="m-0 text-[13px] text-fg2">
            A ride is usually a day. Keep them together in “{{ projects.active?.name }}” or make a
            project per day.
          </p>
        </div>
        <button class="btn btn-ghost btn-icon" aria-label="Cancel" @click="emit('cancel')">
          <PhX :size="16" weight="bold" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button class="tile p-2.5" :aria-pressed="mode === 'perDay'" @click="mode = 'perDay'">
          <b class="block text-[13px] text-fg">One project per day</b>
          <span class="text-xs text-fg2">recommended</span>
        </button>
        <button class="tile p-2.5" :aria-pressed="mode === 'one'" @click="mode = 'one'">
          <b class="block text-[13px] text-fg">All into this project</b>
          <span class="text-xs text-fg2">“{{ projects.active?.name }}”</span>
        </button>
      </div>

      <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
        <li
          v-for="g in groups"
          :key="g.day"
          class="flex items-center gap-3 rounded-ctl border border-line bg-bg2 px-3 py-1.5"
          :class="{ 'opacity-50': !checked[g.day] }"
        >
          <input
            v-model="checked[g.day]"
            type="checkbox"
            class="m-0"
            :aria-label="dayLabel(g.day)"
          />
          <div class="min-w-0 flex-1">
            <input
              v-if="mode === 'perDay'"
              v-model="names[g.day]"
              class="h-6 w-full rounded-[3px] border border-transparent bg-transparent px-1 text-[13px] font-semibold text-fg outline-none hover:border-line focus:border-sel"
              maxlength="80"
              :disabled="!checked[g.day]"
            />
            <b v-else class="block px-1 text-[13px] font-semibold text-fg">{{ dayLabel(g.day) }}</b>
            <span class="px-1 text-xs text-fg2">
              {{ g.stems.length }} video{{ g.stems.length === 1 ? '' : 's' }}
              <template v-if="g.known"> · {{ g.known }} already scanned</template>
            </span>
          </div>
        </li>
      </ul>

      <div class="flex items-center gap-2">
        <span class="text-xs text-fg2">{{ nVideos }} videos selected</span>
        <button class="btn ml-auto" @click="emit('cancel')">Cancel</button>
        <button class="btn btn-pri" :disabled="!nVideos" @click="confirm">
          {{ mode === 'perDay' ? `Create ${selected.length} projects` : 'Add videos' }}
        </button>
      </div>
    </div>
  </div>
</template>
