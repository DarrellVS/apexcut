<script setup lang="ts">
/**
 * The seven looks as tiles, each the open video's own frame with that look on it — the same maths
 * as the export, so what you pick is what you get.
 */
import { computed } from 'vue';
import { LOOKS, type Grade } from '@core/grade';
import { useLibraryStore } from '@renderer/stores/library';
import { gradeFilterMarkup } from '@renderer/utils/gradeSvg';
import { hideBrokenImage, thumbUrl } from '@renderer/utils/media';

defineProps<{ currentLookId: string | null }>();
const emit = defineEmits<{ pick: [grade: Grade] }>();
const library = useLibraryStore();

const thumb = computed(() => {
  // only a scanned video has a thumbnail; an unscanned one would show broken images
  const c = library.currentClip;
  return c?.analyzed ? thumbUrl(c.stem) : null;
});
const lookFilters = computed(() =>
  LOOKS.map((l) => ({ id: l.id, markup: gradeFilterMarkup(l.grade) })),
);
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- the markup is built from numbers only (gradeSvg.ts) -->
  <svg class="absolute h-0 w-0" aria-hidden="true">
    <filter
      v-for="f in lookFilters"
      :id="`apexcut-look-${f.id}`"
      :key="f.id"
      color-interpolation-filters="sRGB"
      v-html="f.markup"
    />
  </svg>
  <!-- eslint-enable vue/no-v-html -->
  <div class="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Look">
    <button
      v-for="l in LOOKS"
      :key="l.id"
      class="tile flex flex-col gap-1 p-1 text-center"
      :title="l.hint"
      role="radio"
      :aria-checked="currentLookId === l.id"
      @click="emit('pick', l.grade)"
    >
      <span class="block aspect-video w-full overflow-hidden rounded-[2px] bg-bg3">
        <img
          v-if="thumb"
          :src="thumb"
          alt=""
          class="h-full w-full object-cover"
          :style="l.id === 'none' ? {} : { filter: `url(#apexcut-look-${l.id})` }"
          @error="hideBrokenImage"
        />
      </span>
      <span class="truncate text-[11px] leading-tight" :title="l.label">{{ l.label }}</span>
    </button>
  </div>
</template>
