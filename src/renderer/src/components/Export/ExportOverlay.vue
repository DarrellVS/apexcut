<script setup lang="ts">
/**
 * Exporting takes over the window: a centred card with a big percentage, the step, elapsed and time
 * left. Closing it asks first and then stops the export — nothing else can change the project while
 * a movie is being made. When done, the same card shows the result (Watch, Open folder).
 */
import { api } from '@renderer/api';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { PhCheckCircle, PhFolderOpen, PhPlay, PhX } from '@phosphor-icons/vue';
import { useJobsStore } from '@renderer/stores/jobs';
import { friendlyError } from '@renderer/utils/errors';
import { fmtClock } from '@shared/format';

const emit = defineEmits<{ watch: [url: string] }>();
const jobs = useJobsStore();

/** the job the user dismissed (so a finished card can be closed) */
const dismissed = ref<string | null>(null);
const confirming = ref(false);

const job = computed(() => jobs.exportJob);
const open = computed(() => !!job.value && job.value.id !== dismissed.value);
const running = computed(() => job.value?.status === 'running');
const pct = computed(() => Math.round((job.value?.progress ?? 0) * 100));
const title = computed(() =>
  job.value?.kind === 'extract' ? 'Making your clips' : 'Making your movie',
);

// a new export resets the dismissal and any pending confirmation
watch(
  () => job.value?.id,
  () => {
    confirming.value = false;
  },
);

function requestClose(): void {
  if (!job.value) return;
  if (running.value) confirming.value = true;
  else dismissed.value = job.value.id;
}
function stop(): void {
  if (job.value) api.exporter.cancel(job.value.id);
  confirming.value = false;
}
function openFolder(): void {
  const r = job.value?.result;
  if (!r || r.kind === 'analyze') return;
  api.shell.openFolder(r.kind === 'export' ? r.file : r.folder);
}
function onKey(e: KeyboardEvent): void {
  if (!open.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (confirming.value) confirming.value = false;
    else requestClose();
  }
}
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
      v-if="open && job"
      class="fixed inset-0 z-[52] grid place-items-center bg-black/55 p-6"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @mousedown.self="requestClose"
    >
      <div class="popover relative w-full max-w-[520px] p-6">
        <button
          class="btn btn-ghost btn-icon absolute top-3 right-3"
          :title="running ? 'Stop the export (Esc)' : 'Close (Esc)'"
          :aria-label="running ? 'Stop the export' : 'Close'"
          @click="requestClose"
        >
          <PhX :size="15" weight="bold" />
        </button>

        <!-- running -->
        <template v-if="running">
          <div class="label-caps mb-1">{{ title }}</div>
          <div class="truncate pr-10 text-base font-semibold text-fg">{{ job.label }}</div>
          <div class="mt-5 flex items-end gap-4">
            <span class="num text-[40px] leading-none font-semibold tracking-tight text-fg"
              >{{ pct }}%</span
            >
            <div class="mb-1.5 min-w-0 flex-1">
              <div class="truncate text-[13px] text-fg">{{ job.message || 'Starting…' }}</div>
              <div class="text-xs text-fg2">
                Running {{ fmtClock(jobs.elapsed(job)) }}
                <template v-if="jobs.eta(job) != null">
                  · about <b class="text-fg">{{ fmtClock(jobs.eta(job)!) }}</b> left
                </template>
                <template v-else> · estimating time…</template>
              </div>
            </div>
          </div>
          <div class="mt-4 h-1 w-full overflow-hidden rounded-full bg-bg3">
            <div
              class="h-full bg-ink transition-[width] duration-500"
              :style="{ width: `${pct}%` }"
            />
          </div>
          <div
            v-if="confirming"
            class="mt-5 flex items-center gap-2 rounded-ctl border border-danger/40 bg-danger/10 p-3 text-[13px]"
          >
            <span class="min-w-0 flex-1 text-fg"
              >Stop the export? What is done so far is thrown away.</span
            >
            <button class="btn btn-mini btn-danger" @click="stop">Stop</button>
            <button class="btn btn-mini" autofocus @click="confirming = false">Keep going</button>
          </div>
          <p v-else class="m-0 mt-5 text-xs text-fg2">
            Your originals are untouched. You can keep working; this movie is made from the parts as
            they were when you pressed the button.
          </p>
        </template>

        <!-- done -->
        <template v-else-if="job.status === 'done' && job.result">
          <div class="flex items-center gap-3">
            <PhCheckCircle :size="28" weight="fill" class="flex-none text-fg" />
            <div class="min-w-0">
              <div class="text-base font-semibold text-fg">
                {{ job.result.kind === 'extract' ? 'Your clips are ready' : 'Your movie is ready' }}
              </div>
              <div class="truncate text-xs text-fg2">
                <template v-if="job.result.kind === 'export'">
                  {{ job.result.sizeMb }} MB · {{ job.result.file }}
                </template>
                <template v-else-if="job.result.kind === 'extract'">
                  {{ job.result.files.length }} files · {{ job.result.folder }}
                </template>
              </div>
            </div>
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            <button
              v-if="job.result.kind === 'export'"
              class="btn btn-pri flex items-center gap-1.5"
              @click="
                emit('watch', job.result.url);
                dismissed = job.id;
              "
            >
              <PhPlay :size="14" weight="fill" /> Watch it
            </button>
            <button class="btn flex items-center gap-1.5" @click="openFolder">
              <PhFolderOpen :size="14" /> Open folder
            </button>
            <button class="btn btn-ghost ml-auto" @click="dismissed = job.id">Done</button>
          </div>
        </template>

        <!-- error / cancelled -->
        <template v-else>
          <div class="text-base font-semibold text-fg">
            {{ job.status === 'cancelled' ? 'Export stopped' : friendlyError(job.error).title }}
          </div>
          <p class="m-0 mt-1 text-sm text-fg2">
            {{
              job.status === 'cancelled'
                ? 'Nothing was written. Your parts and picks are still here.'
                : friendlyError(job.error).hint
            }}
          </p>
          <details v-if="job.error" class="mt-3 rounded-ctl bg-bg2 p-3 text-xs">
            <summary class="cursor-pointer text-fg2">Details</summary>
            <pre class="m-0 mt-2 max-h-[160px] overflow-auto whitespace-pre-wrap text-fg2">{{
              job.error
            }}</pre>
          </details>
          <div class="mt-5 flex justify-end">
            <button class="btn" @click="dismissed = job.id">Close</button>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>
