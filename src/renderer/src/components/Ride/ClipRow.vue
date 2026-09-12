<script setup lang="ts">
/**
 * One video in the ride: a grip to drag it into another place in the movie, a fold for its parts,
 * its thumbnail, how much of it is in the movie (or why it is not), and its menu.
 */
import { api } from '@renderer/api';
import {
  PhArrowsClockwise,
  PhCaretRight,
  PhDotsSixVertical,
  PhDotsThree,
  PhExport,
  PhMagnifyingGlass,
  PhTrash,
} from '@phosphor-icons/vue';
import type { ClipInfo } from '@shared/ipc';
import { useRelink } from '@renderer/composables/useRelink';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useUiStore } from '@renderer/stores/ui';
import { friendlyError } from '@renderer/utils/errors';
import { fmtDuration, shortName } from '@renderer/utils/format';
import { hideBrokenImage, thumbUrl } from '@renderer/utils/media';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const props = defineProps<{
  clip: ClipInfo;
  /** how many of its parts are in the movie */
  enabled: number;
  open: boolean;
  menuOpen: boolean;
  /** a video is being dragged onto this one */
  dropTarget: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  menu: [open: boolean];
  dragstart: [e: DragEvent];
}>();

const library = useLibraryStore();
const jobs = useJobsStore();
const ui = useUiStore();
const { relink } = useRelink();

async function rescan(): Promise<void> {
  emit('menu', false);
  await api.analysis.run([props.clip.stem]);
  toast(props.clip.analyzed ? 'Scanning again…' : 'Scanning…');
}
async function exportEdl(): Promise<void> {
  emit('menu', false);
  const r = await api.exporter.edl(props.clip.stem);
  toast(`EDL saved: ${r.file}`, 5000);
}
async function remove(): Promise<void> {
  emit('menu', false);
  await library.remove(props.clip.stem);
  toast(`${shortName(props.clip.stem)} removed from this project`);
}
</script>

<template>
  <div
    class="group relative flex h-10 cursor-pointer items-center gap-2 rounded-ctl border border-transparent px-1 text-[13px] transition-colors hover:bg-bg3"
    :class="[
      clip.stem === library.current ? 'border-line bg-bg2' : '',
      { 'border-t-line2': dropTarget },
    ]"
    :title="`${clip.stem}${clip.width ? ` · ${clip.width}×${clip.height}` : ''}${clip.model ? ` · ${clip.model}` : ''}`"
    draggable="true"
    data-row-menu
    :data-clip="clip.stem"
    @click="library.current = clip.stem"
    @dragstart="emit('dragstart', $event)"
  >
    <PhDotsSixVertical :size="12" class="flex-none cursor-grab text-fg3" />
    <button
      class="grid h-6 w-5 flex-none place-items-center rounded-[3px] text-fg3 hover:bg-bg3 hover:text-fg"
      :aria-expanded="open"
      :aria-label="open ? 'Fold parts' : 'Unfold parts'"
      @click.stop="emit('toggle')"
    >
      <PhCaretRight
        :size="10"
        weight="bold"
        class="transition-transform"
        :class="{ 'rotate-90': open }"
      />
    </button>
    <img
      v-if="clip.proxyUrl"
      class="h-7 w-12 flex-none rounded-[3px] bg-black object-cover"
      :src="thumbUrl(clip.stem)"
      alt=""
      draggable="false"
      @error="hideBrokenImage"
    />
    <div v-else class="h-7 w-12 flex-none rounded-[3px] bg-bg3" />
    <b class="min-w-0 flex-1 truncate font-semibold">{{ shortName(clip.stem) }}</b>
    <span class="num flex-none text-xs text-fg2">
      <template v-if="!clip.exists"><span class="text-danger">not found</span></template>
      <template v-else-if="clip.analyzed"
        >{{ enabled }} · {{ fmtDuration(clip.highlightS ?? 0) }}</template
      >
      <template v-else-if="jobs.analyzeJob">scanning…</template>
      <span
        v-else-if="library.scanErrors[clip.stem]"
        class="text-danger"
        :title="`${friendlyError(library.scanErrors[clip.stem]).title}. ${friendlyError(library.scanErrors[clip.stem]).hint}`"
        >scan failed</span
      >
      <template v-else>not scanned</template>
    </span>
    <button
      class="grid h-6 w-6 flex-none place-items-center rounded-[3px] text-fg3 opacity-0 group-hover:opacity-100 hover:bg-bg3 hover:text-fg focus-visible:opacity-100"
      :class="{ 'opacity-100': menuOpen }"
      :aria-label="`Options for ${shortName(clip.stem)}`"
      @click.stop="emit('menu', !menuOpen)"
    >
      <PhDotsThree :size="14" weight="bold" />
    </button>
    <div
      v-if="menuOpen"
      class="popover absolute top-full right-0 z-30 min-w-[210px] p-1"
      role="menu"
      @click.stop
    >
      <button
        v-if="!clip.exists"
        class="menu-item"
        role="menuitem"
        @click="relink('file', clip.stem)"
      >
        <PhMagnifyingGlass :size="14" /> Find the moved file…
      </button>
      <button class="menu-item" role="menuitem" @click="rescan">
        <PhArrowsClockwise :size="14" /> {{ clip.analyzed ? 'Scan again' : 'Scan now' }}
      </button>
      <button v-if="clip.analyzed" class="menu-item" role="menuitem" @click="exportEdl">
        <PhExport :size="14" /> Export for Resolve / Premiere
      </button>
      <button class="menu-item" role="menuitem" @click="ui.openSettings('scoring')">
        Change how parts are picked…
      </button>
      <button
        class="menu-item text-danger"
        role="menuitem"
        title="The video and its scan stay available for other projects"
        @click="remove"
      >
        <PhTrash :size="14" /> Remove from this project
      </button>
    </div>
  </div>
</template>
