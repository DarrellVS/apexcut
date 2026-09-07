<script setup lang="ts">
/** Settings → Onboarding: replay the three-step tour. */
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUiStore } from '@renderer/stores/ui';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const ui = useUiStore();
const settings = useSettingsStore();
const projects = useProjectsStore();

async function replay(): Promise<void> {
  await settings.update({ tourSeen: false });
  ui.closeSettings();
  if (projects.showHome) {
    toast('Open a project — the tour starts in the editor');
    return;
  }
  ui.tourActive = true;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-sm text-muted">
      The quick tour points out the three things that matter: your parts on the timeline, Preview,
      and Make my movie. It shows once after the first scan.
    </p>
    <div class="card flex items-center gap-3 text-sm">
      <div class="min-w-0 flex-1 text-fg">
        {{
          settings.settings?.tourSeen
            ? 'You have seen the tour.'
            : 'The tour has not been shown yet.'
        }}
      </div>
      <button class="btn btn-mini" @click="replay">Show the tour again</button>
    </div>
  </div>
</template>
