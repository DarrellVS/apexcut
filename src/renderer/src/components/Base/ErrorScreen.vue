<script setup lang="ts">
/** Full-screen card for errors we could not recover from: what happened, what to do, report, restart. */
import { ref } from 'vue';
import { PhArrowsClockwise, PhLifebuoy } from '@phosphor-icons/vue';
import { useUiStore } from '@renderer/stores/ui';
import { friendlyError } from '@renderer/utils/errors';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const ui = useUiStore();
const reporting = ref(false);

async function report(): Promise<void> {
  reporting.value = true;
  try {
    const r = await window.apexcut.app.report();
    toast(`Report saved: ${r.file}`, 8000);
  } catch (e) {
    toast(`Could not write the report: ${(e as Error).message}`, 8000);
  } finally {
    reporting.value = false;
  }
}
function restart(): void {
  location.reload();
}
</script>

<template>
  <div
    v-if="ui.fatal"
    class="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-6"
    role="alertdialog"
    aria-labelledby="fatal-title"
  >
    <div class="popover flex w-full max-w-[560px] flex-col gap-4 rounded-[18px] p-7">
      <div class="flex items-center gap-3">
        <div
          class="grid h-11 w-11 flex-none place-items-center rounded-[12px] bg-play/15 text-play"
        >
          <PhLifebuoy :size="24" weight="fill" />
        </div>
        <div>
          <h2 id="fatal-title" class="m-0 text-lg font-bold text-fg">
            {{ friendlyError(ui.fatal.message).title }}
          </h2>
          <p class="m-0 text-sm text-muted">
            {{
              friendlyError(ui.fatal.message).hint || 'Your projects and picks are saved on disk.'
            }}
          </p>
        </div>
      </div>
      <details class="rounded-ctl bg-s2 p-3 text-xs">
        <summary class="cursor-pointer text-muted">Details</summary>
        <pre class="m-0 mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap text-muted"
          >{{ ui.fatal.message }}{{ ui.fatal.stack ? '\n\n' + ui.fatal.stack : '' }}</pre>
      </details>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-pri flex items-center gap-1.5" @click="restart">
          <PhArrowsClockwise :size="16" /> Restart ApexCut
        </button>
        <button class="btn flex items-center gap-1.5" :disabled="reporting" @click="report">
          <PhLifebuoy :size="16" /> {{ reporting ? 'Writing report…' : 'Report a problem' }}
        </button>
        <button class="btn btn-ghost ml-auto" @click="ui.fatal = null">Continue anyway</button>
      </div>
      <p class="m-0 text-[11px] text-muted">
        Report a problem writes a zip to your Documents folder with the app log, your project list
        and settings (no videos, no picks) — you decide whether to send it.
      </p>
    </div>
  </div>
</template>
