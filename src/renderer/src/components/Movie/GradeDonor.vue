<script setup lang="ts">
/** A movie without colours whose sibling has some: one click takes them over. */
import { computed } from 'vue';
import { PhArrowSquareOut } from '@phosphor-icons/vue';
import { isNeutral, type Grade } from '@core/grade';
import { useProjectsStore } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const props = defineProps<{ partMode: boolean; movieGrade: Grade }>();
const projects = useProjectsStore();

const donor = computed(() => {
  if (props.partMode || !isNeutral(props.movieGrade)) return null;
  return (
    projects.projects.find(
      (p) => p.id !== projects.activeId && !p.archived && p.grade && !isNeutral(p.grade),
    ) ?? null
  );
});
async function takeFrom(id: string): Promise<void> {
  const p = projects.projects.find((x) => x.id === id);
  if (!p?.grade) return;
  await projects.setGrade({ ...p.grade });
  toast(`Colours of “${p.name}” copied to this movie`);
}
</script>

<template>
  <button
    v-if="donor"
    class="mb-2 flex w-full items-center gap-2 rounded-ctl border border-dashed border-line2 px-2 py-1.5 text-left text-xs hover:bg-bg3"
    @click="takeFrom(donor.id)"
  >
    <PhArrowSquareOut :size="13" class="flex-none text-fg2" />
    <span class="min-w-0 flex-1 truncate">
      “{{ donor.name }}” has colours · <b class="font-semibold">use them here</b>
    </span>
  </button>
</template>
