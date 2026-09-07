/**
 * Auto-update state mirrored from main: drives the "ready to update" banner and Settings → Updates.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { UpdateStatus } from '@shared/ipc';

export const useUpdaterStore = defineStore('updater', () => {
  const status = ref<UpdateStatus>({ state: 'idle' });
  /** the user closed the banner for this session */
  const dismissed = ref(false);

  const ready = computed(() => (status.value.state === 'ready' ? status.value : null));
  const showBanner = computed(() => !!ready.value && !dismissed.value);

  async function init(): Promise<void> {
    status.value = await window.apexcut.updater.status();
    window.apexcut.updater.onStatus((s) => {
      status.value = s;
    });
  }
  async function check(): Promise<void> {
    status.value = await window.apexcut.updater.check();
  }
  function install(): void {
    window.apexcut.updater.install();
  }

  return { status, dismissed, ready, showBanner, init, check, install };
});
