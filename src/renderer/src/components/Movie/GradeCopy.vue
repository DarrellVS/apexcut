<script setup lang="ts">
/**
 * Colours across movies and parts: copy these colours to another movie, and put the parts that went
 * their own way back on the movie's colours.
 */
import { computed } from 'vue';
import { PhCaretDown, PhCopy } from '@phosphor-icons/vue';
import { gradeEquals, isNeutral, type Grade } from '@core/grade';
import { usePopover } from '@renderer/composables/usePopover';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const props = defineProps<{ grade: Grade; partMode: boolean }>();
const editor = useEditorStore();
const library = useLibraryStore();
const projects = useProjectsStore();
const copyMenu = usePopover();

const others = computed(() =>
  projects.projects.filter((p) => p.id !== projects.activeId && !p.archived),
);
async function copyTo(id: string): Promise<void> {
  copyMenu.close();
  const p = projects.projects.find((x) => x.id === id);
  await projects.setGrade({ ...props.grade }, id);
  toast(`Colours copied to “${p?.name ?? 'the other movie'}”`);
}
/** the movie's colours onto every part that has its own */
const ownParts = computed(() => editor.parts.filter((p) => p.grade).length);
function applyToOwnParts(): void {
  const own = editor.parts.filter((p) => p.grade);
  if (!own.length) return;
  editor.setGrade(own, undefined);
  toast(`${own.length} part${own.length === 1 ? '' : 's'} back on the movie’s colours`);
}
</script>

<template>
  <div class="mt-2 flex flex-wrap items-center gap-1.5">
    <div v-if="others.length && !isNeutral(grade)" ref="copyMenu.root" class="relative">
      <button class="btn btn-mini" :aria-expanded="copyMenu.open.value" @click="copyMenu.toggle()">
        <PhCopy :size="12" /> Copy to another movie <PhCaretDown :size="9" weight="bold" />
      </button>
      <div
        v-if="copyMenu.open.value"
        class="popover absolute bottom-[calc(100%+4px)] left-0 z-30 min-w-[220px] p-1"
      >
        <button v-for="p in others" :key="p.id" class="menu-item" @click="copyTo(p.id)">
          <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
          <span v-if="p.grade && !isNeutral(p.grade)" class="text-[11px] text-fg3">
            {{ gradeEquals(p.grade, grade) ? 'same' : 'has colours' }}
          </span>
        </button>
      </div>
    </div>
    <button
      v-if="!partMode && ownParts"
      class="btn btn-ghost btn-mini"
      :title="`${ownParts} part${ownParts === 1 ? ' has' : 's have'} their own colours in ${library.current ? shortName(library.current) : 'this video'}`"
      @click="applyToOwnParts"
    >
      {{ ownParts }} part{{ ownParts === 1 ? '' : 's' }} with own colours · use the movie’s
    </button>
  </div>
</template>
