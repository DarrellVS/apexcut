/**
 * Cross-cutting UI state: the settings modal (open state + section) and the window state that the
 * custom title bar needs (maximised, full screen, focused).
 */
import { api } from '@renderer/api';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { WindowState } from '@shared/ipc';

export type SettingsSection =
  | 'appearance'
  | 'output'
  | 'storage'
  | 'about'
  | 'onboarding'
  | 'shortcuts'
  | 'editing'
  | 'scoring';

export interface FatalError {
  message: string;
  stack?: string;
}

export const useUiStore = defineStore('ui', () => {
  const settingsOpen = ref(false);
  const settingsSection = ref<SettingsSection>('appearance');
  /** an error we could not recover from; shows the full-screen error card */
  const fatal = ref<FatalError | null>(null);
  /** the three-step first-run tour is showing */
  const tourActive = ref(false);
  /** pushed by the main process; the title bar dims when the window is not focused */
  const win = ref<WindowState>({ maximized: false, fullscreen: false, focused: true });
  /** element that had focus before the modal opened; focus goes back there on close */
  let opener: HTMLElement | null = null;

  api.window.onState((s) => (win.value = s));

  function openSettings(section?: SettingsSection): void {
    opener = document.activeElement as HTMLElement | null;
    if (section) settingsSection.value = section;
    settingsOpen.value = true;
  }
  function closeSettings(): void {
    settingsOpen.value = false;
    opener?.focus?.();
    opener = null;
  }
  function toggleSettings(): void {
    settingsOpen.value ? closeSettings() : openSettings();
  }

  return {
    settingsOpen,
    settingsSection,
    fatal,
    tourActive,
    win,
    openSettings,
    closeSettings,
    toggleSettings,
  };
});
