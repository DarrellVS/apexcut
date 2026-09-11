import { api } from '@renderer/api';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { EncoderInfo, Settings, Theme } from '@shared/ipc';

function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // the native window buttons sit on the title bar: recolour them with the theme
  const css = getComputedStyle(document.documentElement);
  const bar = css.getPropertyValue('--bg0').trim();
  const fg = css.getPropertyValue('--fg2').trim();
  if (/^#[0-9a-f]{6}$/i.test(bar) && /^#[0-9a-f]{6}$/i.test(fg)) api.window.setOverlay(bar, fg);
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null);
  const encoders = ref<EncoderInfo | null>(null);
  const version = ref('');

  async function init(): Promise<void> {
    settings.value = await api.settings.get();
    applyTheme(settings.value.theme);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.value) applyTheme(settings.value.theme);
    });
    version.value = await api.app.version();
    api.settings.encoders().then((e) => (encoders.value = e));
  }

  async function update(patch: Partial<Settings>): Promise<void> {
    settings.value = await api.settings.set(patch);
  }

  watch(
    () => settings.value?.theme,
    (t) => t && applyTheme(t),
  );

  return { settings, encoders, version, init, update };
});
