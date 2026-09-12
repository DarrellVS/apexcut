<script setup lang="ts">
/**
 * Fine-tuning the colours: one slider per control, live while you drag and one undo step when you
 * let go. Double-click a slider to put it back to 0.
 */
import { PhCaretRight } from '@phosphor-icons/vue';
import { GRADE_CONTROLS, type Grade, type GradeKey } from '@core/grade';

defineProps<{ grade: Grade; open: boolean }>();
const emit = defineEmits<{
  set: [key: GradeKey, value: number, commit: boolean];
  toggle: [open: boolean];
}>();
const valueOf = (e: Event): number => Number((e.target as HTMLInputElement).value);
</script>

<template>
  <details
    class="group mt-2"
    :open="open"
    @toggle="emit('toggle', ($event.target as HTMLDetailsElement).open)"
  >
    <summary
      class="flex h-7 cursor-pointer list-none items-center gap-1 text-xs text-fg2 select-none hover:text-fg"
    >
      <PhCaretRight :size="10" weight="bold" class="transition-transform group-open:rotate-90" />
      Fine-tune
    </summary>
    <div class="mt-1 flex flex-col gap-1.5">
      <label
        v-for="c in GRADE_CONTROLS"
        :key="c.key"
        class="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs"
        :title="c.hint"
      >
        <span class="truncate text-fg2">{{ c.label }}</span>
        <input
          type="range"
          class="w-full"
          :min="c.min"
          :max="c.max"
          :step="c.step"
          :value="grade[c.key]"
          :aria-label="c.label"
          @input="emit('set', c.key, valueOf($event), false)"
          @change="emit('set', c.key, valueOf($event), true)"
          @dblclick="emit('set', c.key, 0, true)"
        />
        <span class="num text-right" :class="grade[c.key] ? 'text-fg' : 'text-fg3'">
          {{ c.fmt(grade[c.key]) }}
        </span>
      </label>
      <div class="text-[11px] text-fg3">Double-click a slider to put it back to 0.</div>
    </div>
  </details>
</template>
