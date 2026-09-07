import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { EncoderInfo, Settings, Theme } from '@shared/ipc';

function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null);
  const encoders = ref<EncoderInfo | null>(null);
  const version = ref('');

  async function init(): Promise<void> {
    settings.value = await window.apexcut.settings.get();
    applyTheme(settings.value.theme);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.value) applyTheme(settings.value.theme);
    });
    version.value = await window.apexcut.app.version();
    window.apexcut.settings.encoders().then((e) => (encoders.value = e));
  }

  async function update(patch: Partial<Settings>): Promise<void> {
    settings.value = await window.apexcut.settings.set(patch);
  }

  watch(
    () => settings.value?.theme,
    (t) => t && applyTheme(t),
  );

  return { settings, encoders, version, init, update };
});
