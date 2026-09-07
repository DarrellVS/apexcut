<script setup lang="ts">
/** Right panel with three tabs: Parts (list + amount slider), Movie (export), This video. */
import { computed, ref } from 'vue';
import PartsTab from './PartsTab.vue';
import MovieTab from './MovieTab.vue';
import ThisVideoTab from './ThisVideoTab.vue';

type Tab = 'parts' | 'movie' | 'video';
const TABS: { id: Tab; label: string }[] = [
  { id: 'parts', label: 'Parts' },
  { id: 'movie', label: 'Movie' },
  { id: 'video', label: 'This video' },
];
const emit = defineEmits<{ seek: [t: number]; play: [t: number]; watch: [url: string] }>();
const tab = ref<Tab>('parts');
const scope = ref<'all' | 'current'>('all');
const movie = ref<InstanceType<typeof MovieTab> | null>(null);

const framingActive = computed(
  () => tab.value === 'movie' && (movie.value?.format ?? 'original') !== 'original',
);

function openMovie(s: 'all' | 'current'): void {
  scope.value = s;
  tab.value = 'movie';
}
defineExpose({ openMovie, framingActive });
</script>

<template>
  <aside class="glass flex min-h-0 flex-col">
    <div class="flex gap-0.5 border-b border-line p-1.5" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="flex-1 rounded-lg py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors"
        :class="tab === t.id ? 'bg-s2 text-fg' : 'text-muted hover:text-fg'"
        role="tab"
        :aria-selected="tab === t.id"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-3">
      <PartsTab
        v-show="tab === 'parts'"
        @seek="emit('seek', $event)"
        @play="emit('play', $event)"
      />
      <MovieTab
        v-show="tab === 'movie'"
        ref="movie"
        v-model:scope="scope"
        @watch="emit('watch', $event)"
      />
      <ThisVideoTab v-show="tab === 'video'" />
    </div>
  </aside>
</template>
