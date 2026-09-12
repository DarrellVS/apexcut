<script setup lang="ts">
/** “Make my movie”, with the choice between all videos and only this one behind its caret. */
import { computed } from 'vue';
import { PhCaretDown } from '@phosphor-icons/vue';
import { usePopover } from '@renderer/composables/usePopover';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { fmtDuration, plural, shortName } from '@renderer/utils/format';

const emit = defineEmits<{ make: [scope: 'all' | 'current'] }>();
const editor = useEditorStore();
const library = useLibraryStore();
const menu = usePopover();

const canMake = computed(() => library.analyzed.some((c) => (c.nEnabled ?? 0) > 0));
const summary = computed(() => {
  const all = library.analyzed;
  const n = all.reduce((a, c) => a + (c.nEnabled ?? 0), 0);
  const s = all.reduce((a, c) => a + (c.highlightS ?? 0), 0);
  if (!n) return 'No parts selected yet';
  return `${plural(n, 'part')}${all.length > 1 ? ` from ${plural(all.length, 'video')}` : ''} · ${fmtDuration(s)}`;
});

function choose(scope: 'all' | 'current'): void {
  menu.close();
  emit('make', scope);
}
defineExpose({ close: menu.close });
</script>

<template>
  <div ref="menu.root" class="relative ml-1.5 flex">
    <button
      class="btn btn-pri rounded-r-none"
      :disabled="!canMake"
      :title="canMake ? 'Make the movie of all videos' : 'Pick at least one part first'"
      data-tour="make"
      @click="choose('all')"
    >
      Make my movie
    </button>
    <button
      class="btn btn-pri w-7 rounded-l-none border-l-ink-fg/20 px-0"
      :disabled="!canMake"
      title="More options"
      aria-label="More export options"
      :aria-expanded="menu.open.value"
      @click.stop="menu.toggle()"
    >
      <PhCaretDown :size="12" weight="bold" />
    </button>
    <div
      v-if="menu.open.value"
      class="popover absolute top-[calc(100%+4px)] right-0 z-30 min-w-[280px] p-1"
      @click.stop
    >
      <button class="menu-item h-auto flex-col items-start gap-0 py-1.5" @click="choose('all')">
        <b class="text-[13px]">All videos</b>
        <span class="num text-xs text-fg2">{{ summary }}</span>
      </button>
      <button
        v-if="library.currentClip"
        class="menu-item h-auto flex-col items-start gap-0 py-1.5"
        @click="choose('current')"
      >
        <b class="text-[13px]">Only this video</b>
        <span class="num text-xs text-fg2">
          {{ shortName(library.currentClip.stem) }} ·
          {{ plural(editor.enabledParts.length, 'part') }} ·
          {{ fmtDuration(editor.movieLength) }}
        </span>
      </button>
    </div>
  </div>
</template>
