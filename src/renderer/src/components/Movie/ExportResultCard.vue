<script setup lang="ts">
/** What became of the export, in the panel: the file, the way to watch it, or why it failed. */
import { api } from '@renderer/api';
import { PhFolderOpen, PhPlay } from '@phosphor-icons/vue';
import type { JobState } from '@shared/ipc';
import { friendlyError } from '@renderer/utils/errors';

defineProps<{ job: JobState }>();
const emit = defineEmits<{ watch: [url: string] }>();
const openFolder = (p: string): Promise<void> => api.shell.openFolder(p);
</script>

<template>
  <div v-if="job.status === 'done' && job.result" class="card text-xs break-all">
    <b class="block text-[13px] font-semibold text-fg">
      {{ job.result.kind === 'extract' ? 'Your clips are ready' : 'Your movie is ready' }}
    </b>
    <div v-if="job.result.kind === 'export'" class="num my-1.5 text-fg2">
      {{ job.result.file }} · {{ job.result.sizeMb }} MB
    </div>
    <div v-if="job.result.kind === 'extract'" class="num my-1.5 text-fg2">
      {{ job.result.files.length }} files in {{ job.result.folder }}
    </div>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-if="job.result.kind === 'export'"
        class="btn btn-pri btn-mini"
        @click="emit('watch', job.result.url)"
      >
        <PhPlay :size="12" weight="fill" /> Watch
      </button>
      <button
        class="btn btn-mini"
        @click="
          openFolder(
            job.result.kind === 'export'
              ? job.result.file
              : job.result.kind === 'extract'
                ? job.result.folder
                : '',
          )
        "
      >
        <PhFolderOpen :size="12" /> Open folder
      </button>
    </div>
  </div>
  <div v-else-if="job.status === 'error'" class="card border-danger/40 text-xs">
    <b class="text-fg">{{ friendlyError(job.error).title }}.</b>
    <span class="text-fg2">{{ friendlyError(job.error).hint }}</span>
    <details class="mt-1.5">
      <summary class="cursor-pointer text-fg2">Details</summary>
      <pre class="max-h-[160px] overflow-auto text-[11px] whitespace-pre-wrap">{{ job.error }}</pre>
    </details>
  </div>
  <div v-else-if="job.status === 'cancelled'" class="text-xs text-fg2">Export cancelled.</div>
</template>
