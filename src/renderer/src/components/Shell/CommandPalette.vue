<script setup lang="ts">
/**
 * Ctrl+K: type what you want. Everything the app can do is in one list (composables/useCommands.ts),
 * matched on the words of its name and a few extra ones, newest habit first — the arrows and Enter
 * do the rest. It runs the same code the buttons do, so nothing here is a second way of working.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { PhMagnifyingGlass } from '@phosphor-icons/vue';
import { useCommands, type Command, type CommandContext } from '@renderer/composables/useCommands';
import { useDismiss } from '@renderer/composables/useDismiss';

const props = defineProps<{ context: CommandContext }>();
const open = defineModel<boolean>({ required: true });

const commands = useCommands(props.context);
const query = ref('');
const at = ref(0);
const panel = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
useDismiss(panel, () => (open.value = false));

/** every word of the query has to appear somewhere in the command */
const matches = computed<Command[]>(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  const all = commands.value;
  if (!words.length) return all.slice(0, 12);
  return all
    .filter((c) => {
      const hay = `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, 40);
});

watch(open, async (on) => {
  if (!on) return;
  query.value = '';
  at.value = 0;
  await nextTick();
  input.value?.focus();
});
watch(matches, () => (at.value = 0));

async function run(c: Command | undefined): Promise<void> {
  if (!c) return;
  open.value = false;
  await c.run();
}
function move(d: 1 | -1): void {
  const n = matches.value.length;
  if (!n) return;
  at.value = (at.value + d + n) % n;
  nextTick(() => {
    list.value
      ?.querySelector<HTMLElement>('[data-at="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  });
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[58] grid place-items-start justify-center bg-black/45 p-6 pt-[12vh]"
    role="dialog"
    aria-modal="true"
    aria-label="What do you want to do?"
  >
    <div ref="panel" class="popover flex w-full max-w-[560px] flex-col overflow-hidden">
      <label class="flex items-center gap-2 border-b border-line px-3">
        <PhMagnifyingGlass :size="15" class="flex-none text-fg3" />
        <input
          ref="input"
          v-model="query"
          class="h-10 w-full border-0 bg-transparent text-[13px] text-fg outline-none"
          placeholder="What do you want to do?"
          aria-label="Search what ApexCut can do"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="run(matches[at])"
          @keydown.esc="open = false"
        />
      </label>
      <div ref="list" class="max-h-[46vh] min-h-0 overflow-auto p-1">
        <button
          v-for="(c, i) in matches"
          :key="c.id"
          class="menu-item"
          :class="{ 'bg-bg3': i === at }"
          :data-at="i === at"
          @click="run(c)"
          @mousemove="at = i"
        >
          <span class="min-w-0 flex-1 truncate">{{ c.label }}</span>
          <span v-if="c.keys" class="num flex-none text-[11px] text-fg3">{{ c.keys }}</span>
          <span class="flex-none text-[11px] text-fg3">{{ c.group }}</span>
        </button>
        <p v-if="!matches.length" class="m-0 px-2.5 py-3 text-[13px] text-fg2">
          Nothing here matches “{{ query }}”.
        </p>
      </div>
    </div>
  </div>
</template>
