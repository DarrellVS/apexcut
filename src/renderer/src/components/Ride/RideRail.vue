<script setup lang="ts">
/**
 * The Ride rail (left): the numbers of the open video, then the outline of the whole ride — every video with its parts underneath, in movie order. Click a part
 * anywhere to open that video and jump there; drag a video's row to change the order of the movie.
 * Video actions (scan again, EDL, remove, find a moved file) live in the row's menu.
 */
import { api } from '@renderer/api';
import { computed, nextTick, ref } from 'vue';
import {
  PhArrowsClockwise,
  PhCaretRight,
  PhDotsSixVertical,
  PhDotsThree,
  PhExport,
  PhMagnifyingGlass,
  PhPlus,
  PhStar,
  PhTrash,
} from '@phosphor-icons/vue';
import { REASON_LABEL, reasonOf } from '@core/selection';
import type { Part } from '@core/types';
import type { ClipInfo } from '@shared/ipc';
import { useRelink } from '@renderer/composables/useRelink';
import { useRideParts } from '@renderer/composables/useRideParts';
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useUiStore } from '@renderer/stores/ui';
import { fmtDuration, fmtTime, plural, shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { useDismiss } from '@renderer/composables/useDismiss';
import PickyPopover from './PickyPopover.vue';

const emit = defineEmits<{ seek: [t: number]; play: [t: number]; pick: [kind: 'files' | 'dir'] }>();
const editor = useEditorStore();
const library = useLibraryStore();
const jobs = useJobsStore();
const ui = useUiStore();
const { relink } = useRelink();
const ride = useRideParts();

// ---- numbers of the open video
const numbers = computed(() => {
  const lean = editor.data.leanDeg as (number | null)[] | undefined;
  const aLon = editor.data.aLonG as (number | null)[] | undefined;
  const t = editor.data.t as number[] | undefined;
  if (!lean || !aLon || !t || !t.length) return null;
  let maxLean = 0;
  let maxLeanT = 0;
  let maxBrake = 0;
  let maxBrakeT = 0;
  for (let i = 0; i < t.length; i++) {
    const l = Math.abs(lean[i] ?? 0);
    if (l > maxLean) {
      maxLean = l;
      maxLeanT = t[i];
    }
    const b = -(aLon[i] ?? 0);
    if (b > maxBrake) {
      maxBrake = b;
      maxBrakeT = t[i];
    }
  }
  // twistiest minute: 60 s window with the most time above 10° of lean
  const win = 600;
  let best = 0;
  let bestT = 0;
  let run = 0;
  for (let i = 0; i < t.length; i++) {
    run += Math.abs(lean[i] ?? 0) > 10 ? 1 : 0;
    if (i >= win) run -= Math.abs(lean[i - win] ?? 0) > 10 ? 1 : 0;
    if (run > best) {
      best = run;
      bestT = Math.max(0, t[i] - 60);
    }
  }
  return {
    maxLean,
    maxLeanT,
    maxBrake,
    maxBrakeT,
    twistyT: bestT,
    twistyPct: Math.round((best / win) * 100),
  };
});

// ---- outline: videos with their parts; the open video is expanded, others fold
// only the chevron folds and unfolds; the open video starts unfolded
const expanded = ref<Record<string, boolean>>(library.current ? { [library.current]: true } : {});
const isOpen = (stem: string): boolean => expanded.value[stem] ?? false;
function toggle(stem: string): void {
  expanded.value[stem] = !isOpen(stem);
}
const colorOf = (p: Part): string =>
  ({
    bochten: 'var(--corner)',
    'accel/rem': 'var(--brake)',
    beide: 'var(--both)',
    handmatig: 'var(--manual)',
    samengeplakt: 'var(--manual)',
  })[reasonOf(p)];

/** open the part's video if needed, then select the part and go there */
async function goToPart(stem: string, p: Part, e: MouseEvent, play = false): Promise<void> {
  if (library.current !== stem) {
    library.current = stem;
    // the editor sets its stem before the parts arrive: wait for the part itself
    await until(() => editor.stem === stem && editor.parts.some((x) => x.id === p.id));
    await nextTick();
  }
  const mine = editor.parts.find((x) => x.id === p.id);
  if (mine) editor.select(mine.id, e.shiftKey || e.ctrlKey);
  if (play) emit('play', p.start_s);
  else emit('seek', p.start_s);
}
function until(ok: () => boolean, ms = 4000): Promise<void> {
  return new Promise((res) => {
    if (ok()) return res();
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (ok() || Date.now() - t0 > ms) {
        clearInterval(iv);
        res();
      }
    }, 30);
  });
}
const enabledOf = (stem: string): number => ride.partsOf(stem).filter((p) => p.enabled).length;

// ---- video row menu
const menuFor = ref<string | null>(null);
async function rescan(c: ClipInfo): Promise<void> {
  menuFor.value = null;
  await api.analysis.run([c.stem]);
  toast(c.analyzed ? 'Scanning again…' : 'Scanning…');
}
async function exportEdl(c: ClipInfo): Promise<void> {
  menuFor.value = null;
  const r = await api.exporter.edl(c.stem);
  toast(`EDL saved: ${r.file}`, 5000);
}
async function remove(c: ClipInfo): Promise<void> {
  menuFor.value = null;
  await library.remove(c.stem);
  toast(`${shortName(c.stem)} removed from this project`);
}
const outline = ref<HTMLElement | null>(null);
useDismiss(outline, () => (menuFor.value = null));

// ---- drag to reorder videos (= the order of the movie)
const dragging = ref<string | null>(null);
const over = ref<string | null | 'end'>(null);
function onDragStart(e: DragEvent, stem: string): void {
  dragging.value = stem;
  e.dataTransfer?.setData('text/apexcut-stem', stem);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDrop(target: string | 'end'): void {
  if (dragging.value && dragging.value !== target) {
    library.move(dragging.value, target === 'end' ? null : target);
  }
  dragging.value = null;
  over.value = null;
}
const missing = computed(() => library.clips.filter((c) => !c.exists).length);
const totalParts = computed(() => library.analyzed.reduce((a, c) => a + (c.nEnabled ?? 0), 0));
</script>

<template>
  <aside
    class="panel flex min-h-0 flex-col"
    @dragend="
      dragging = null;
      over = null;
    "
  >
    <div class="panel-head justify-between gap-2">
      <span>Ride</span>
      <PickyPopover />
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <!-- the open video in numbers -->
      <section v-if="numbers" class="border-b border-line p-2.5">
        <dl class="num m-0 grid grid-cols-[1fr_auto] gap-x-3 text-xs">
          <button
            class="col-span-2 grid grid-cols-subgrid items-baseline rounded-ctl px-1.5 py-0.5 text-left hover:bg-bg3"
            title="Jump there"
            @click="emit('play', Math.max(0, numbers.maxLeanT - 3))"
          >
            <dt class="text-fg2">Sharpest lean · {{ fmtTime(numbers.maxLeanT) }}</dt>
            <dd class="m-0 font-semibold text-fg">{{ Math.round(numbers.maxLean) }}°</dd>
          </button>
          <button
            class="col-span-2 grid grid-cols-subgrid items-baseline rounded-ctl px-1.5 py-0.5 text-left hover:bg-bg3"
            title="Jump there"
            @click="emit('play', Math.max(0, numbers.maxBrakeT - 3))"
          >
            <dt class="text-fg2">Hardest braking · {{ fmtTime(numbers.maxBrakeT) }}</dt>
            <dd class="m-0 font-semibold text-fg">{{ numbers.maxBrake.toFixed(2) }} g</dd>
          </button>
          <button
            class="col-span-2 grid grid-cols-subgrid items-baseline rounded-ctl px-1.5 py-0.5 text-left hover:bg-bg3"
            title="Jump there"
            @click="emit('play', numbers.twistyT)"
          >
            <dt class="text-fg2">Twistiest minute · leaning {{ numbers.twistyPct }}%</dt>
            <dd class="m-0 font-semibold text-fg">{{ fmtTime(numbers.twistyT) }}</dd>
          </button>
        </dl>
      </section>

      <!-- the outline: every video, its parts underneath -->
      <div class="flex h-7 items-center justify-between px-2.5">
        <span class="label-caps">{{ plural(library.clips.length, 'video') }}</span>
        <span class="num text-[11px] text-fg3">{{ plural(totalParts, 'part') }} in the movie</span>
      </div>
      <div ref="outline" class="px-1.5 pb-1.5">
        <div
          v-for="c in library.clips"
          :key="c.stem"
          class="rounded-ctl"
          :class="{ 'opacity-40': dragging === c.stem }"
          @dragover.prevent="over = c.stem"
          @drop.prevent="onDrop(c.stem)"
        >
          <!-- video row -->
          <div
            class="group relative flex h-10 cursor-pointer items-center gap-2 rounded-ctl border border-transparent px-1 text-[13px] transition-colors hover:bg-bg3"
            :class="[
              c.stem === library.current ? 'border-line bg-bg2' : '',
              { 'border-t-line2': over === c.stem && dragging && dragging !== c.stem },
            ]"
            :title="`${c.stem}${c.width ? ` · ${c.width}×${c.height}` : ''}${c.model ? ` · ${c.model}` : ''}`"
            draggable="true"
            data-row-menu
            @click="library.current = c.stem"
            @dragstart="onDragStart($event, c.stem)"
          >
            <PhDotsSixVertical :size="12" class="flex-none cursor-grab text-fg3" />
            <button
              class="grid h-6 w-5 flex-none place-items-center rounded-[3px] text-fg3 hover:bg-bg3 hover:text-fg"
              :aria-expanded="isOpen(c.stem)"
              :aria-label="isOpen(c.stem) ? 'Fold parts' : 'Unfold parts'"
              @click.stop="toggle(c.stem)"
            >
              <PhCaretRight
                :size="10"
                weight="bold"
                class="transition-transform"
                :class="{ 'rotate-90': isOpen(c.stem) }"
              />
            </button>
            <img
              v-if="c.proxyUrl"
              class="h-7 w-12 flex-none rounded-[3px] bg-black object-cover"
              :src="`apexcut://media/clip/${encodeURIComponent(c.stem)}/thumb.jpg`"
              alt=""
              draggable="false"
              @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
            />
            <div v-else class="h-7 w-12 flex-none rounded-[3px] bg-bg3" />
            <b class="min-w-0 flex-1 truncate font-semibold">{{ shortName(c.stem) }}</b>
            <span class="num flex-none text-xs text-fg2">
              <template v-if="!c.exists"><span class="text-danger">not found</span></template>
              <template v-else-if="c.analyzed"
                >{{ enabledOf(c.stem) }} · {{ fmtDuration(c.highlightS ?? 0) }}</template
              >
              <template v-else-if="jobs.analyzeJob">scanning…</template>
              <template v-else>not scanned</template>
            </span>
            <button
              class="grid h-6 w-6 flex-none place-items-center rounded-[3px] text-fg3 opacity-0 group-hover:opacity-100 hover:bg-bg3 hover:text-fg focus-visible:opacity-100"
              :class="{ 'opacity-100': menuFor === c.stem }"
              :aria-label="`Options for ${shortName(c.stem)}`"
              @click.stop="menuFor = menuFor === c.stem ? null : c.stem"
            >
              <PhDotsThree :size="14" weight="bold" />
            </button>
            <div
              v-if="menuFor === c.stem"
              class="popover absolute top-full right-0 z-30 min-w-[210px] p-1"
              role="menu"
              @click.stop
            >
              <button v-if="!c.exists" class="menu-item" @click="relink('file', c.stem)">
                <PhMagnifyingGlass :size="14" /> Find the moved file…
              </button>
              <button class="menu-item" @click="rescan(c)">
                <PhArrowsClockwise :size="14" /> {{ c.analyzed ? 'Scan again' : 'Scan now' }}
              </button>
              <button v-if="c.analyzed" class="menu-item" @click="exportEdl(c)">
                <PhExport :size="14" /> Export for Resolve / Premiere
              </button>
              <button class="menu-item" @click="ui.openSettings('scoring')">
                Change how parts are picked…
              </button>
              <button
                class="menu-item text-danger"
                title="The video and its scan stay available for other projects"
                @click="remove(c)"
              >
                <PhTrash :size="14" /> Remove from this project
              </button>
            </div>
          </div>
          <!-- its parts -->
          <div v-if="isOpen(c.stem) && c.analyzed" class="mb-1.5 ml-[26px] border-l border-line">
            <div
              v-for="p in ride.partsOf(c.stem)"
              :key="p.id"
              class="num ml-1.5 flex h-7 cursor-pointer items-center gap-1.5 rounded-ctl border border-transparent px-1.5 text-xs transition-colors hover:bg-bg3"
              :class="[
                c.stem === editor.stem && editor.selection.includes(p.id)
                  ? 'border-line2 bg-bg2'
                  : '',
                { 'opacity-45': !p.enabled },
              ]"
              data-keep-selection
              @click="goToPart(c.stem, p, $event)"
              @dblclick="goToPart(c.stem, p, $event, true)"
              @mouseenter="c.stem === editor.stem && (editor.hoverId = p.id)"
              @mouseleave="editor.hoverId = null"
            >
              <input
                v-if="c.stem === editor.stem"
                type="checkbox"
                class="m-0 h-3 w-3"
                :checked="p.enabled"
                :aria-label="`${REASON_LABEL[reasonOf(p)]} at ${fmtTime(p.start_s)} in the movie`"
                @click.stop
                @change="editor.setEnabled([p], ($event.target as HTMLInputElement).checked)"
              />
              <span v-else class="h-3 w-3 flex-none" />
              <span
                class="h-3 w-[3px] flex-none rounded-[1px]"
                :style="{ background: colorOf(p) }"
              />
              <span class="w-9 text-fg2">{{ fmtTime(p.start_s) }}</span>
              <span class="min-w-0 flex-1 truncate">{{ REASON_LABEL[reasonOf(p)] }}</span>
              <span class="text-fg2">{{ fmtDuration(p.end_s - p.start_s) }}</span>
              <PhStar v-if="p.starred" :size="11" weight="fill" class="flex-none text-fg" />
            </div>
            <div
              v-if="!ride.partsOf(c.stem).length"
              class="ml-1.5 flex h-6 items-center px-1.5 text-xs text-fg3"
            >
              no parts
            </div>
          </div>
        </div>
        <div
          class="min-h-2"
          :class="{ 'border-t border-line2': over === 'end' && dragging }"
          @dragover.prevent="over = 'end'"
          @drop.prevent="onDrop('end')"
        />
      </div>
    </div>
    <div class="flex flex-col gap-1.5 border-t border-line p-1.5">
      <button
        v-if="missing > 1"
        class="btn btn-mini w-full text-danger"
        title="Pick the folder the files moved to; every missing video found there is fixed"
        @click="relink('dir')"
      >
        <PhMagnifyingGlass :size="13" /> {{ missing }} videos not found · Find their folder…
      </button>
      <div class="flex gap-1.5">
        <button class="btn flex-1" title="Add video files" @click="emit('pick', 'files')">
          <PhPlus :size="13" /> Videos
        </button>
        <button class="btn flex-1" title="Add a whole folder" @click="emit('pick', 'dir')">
          <PhPlus :size="13" /> Folder
        </button>
      </div>
    </div>
  </aside>
</template>
