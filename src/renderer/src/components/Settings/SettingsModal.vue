<script setup lang="ts">
/**
 * Settings as a near-fullscreen modal (Discord style): left nav with grouped sections, one section
 * shown at a time on the right. Esc closes, Tab stays inside, focus returns to the opener.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { PhX } from '@phosphor-icons/vue';
import { useUiStore, type SettingsSection } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import AppearanceSection from './AppearanceSection.vue';
import OutputSection from './OutputSection.vue';
import AboutSection from './AboutSection.vue';
import ScoringSection from './ScoringSection.vue';

const ui = useUiStore();
const settings = useSettingsStore();
const panel = ref<HTMLElement | null>(null);

interface NavItem {
  id: SettingsSection;
  label: string;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}
const NAV: NavGroup[] = [
  {
    title: 'App',
    items: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'output', label: 'Output folder' },
      { id: 'about', label: 'Updates & about' },
    ],
  },
  {
    title: 'Advanced',
    items: [{ id: 'scoring', label: 'How parts are picked' }],
  },
];
const title = computed(
  () => NAV.flatMap((g) => g.items).find((i) => i.id === ui.settingsSection)?.label ?? '',
);

function onKey(e: KeyboardEvent): void {
  if (!ui.settingsOpen) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    ui.closeSettings();
    return;
  }
  if (e.key === 'Tab' && panel.value) {
    // keep focus inside the modal
    const focusables = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute('disabled'),
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

watch(
  () => ui.settingsOpen,
  async (open) => {
    if (!open) return;
    await nextTick();
    panel.value?.querySelector<HTMLElement>('[data-nav-active]')?.focus();
  },
);
onMounted(() => window.addEventListener('keydown', onKey, true));
onUnmounted(() => window.removeEventListener('keydown', onKey, true));
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    leave-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="ui.settingsOpen"
      class="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6"
      role="dialog"
      aria-modal="true"
      :aria-label="`Settings · ${title}`"
      @mousedown.self="ui.closeSettings()"
    >
      <div
        ref="panel"
        class="popover grid h-full max-h-[860px] w-full max-w-[1180px] grid-cols-[230px_1fr] overflow-hidden rounded-[18px]"
      >
        <nav class="flex flex-col gap-4 overflow-auto border-r border-line bg-s2 p-4 pt-5">
          <div v-for="g in NAV" :key="g.title">
            <h4 class="label-caps m-0 mb-1.5 px-2">{{ g.title }}</h4>
            <button
              v-for="item in g.items"
              :key="item.id"
              class="flex w-full items-center rounded-ctl px-2.5 py-1.5 text-left text-sm transition-colors"
              :class="
                ui.settingsSection === item.id
                  ? 'bg-s3 font-semibold text-fg'
                  : 'text-muted hover:bg-s2 hover:text-fg'
              "
              :data-nav-active="ui.settingsSection === item.id ? '' : undefined"
              @click="ui.settingsSection = item.id"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="mt-auto px-2 text-[11px] text-muted">ApexCut {{ settings.version }}</div>
        </nav>
        <div class="relative flex min-h-0 flex-col overflow-auto">
          <button
            class="btn btn-ghost absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full border border-line p-0"
            title="Close (Esc)"
            aria-label="Close settings"
            @click="ui.closeSettings()"
          >
            <PhX :size="16" weight="bold" />
          </button>
          <div class="mx-auto w-full max-w-[680px] px-10 py-9">
            <h2 class="m-0 mb-6 text-xl font-bold text-fg">{{ title }}</h2>
            <AppearanceSection v-if="ui.settingsSection === 'appearance'" />
            <OutputSection v-else-if="ui.settingsSection === 'output'" />
            <AboutSection v-else-if="ui.settingsSection === 'about'" />
            <ScoringSection v-else-if="ui.settingsSection === 'scoring'" />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
