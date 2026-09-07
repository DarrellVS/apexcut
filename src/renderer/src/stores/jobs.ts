/**
 * Mirror of main-process jobs (analysis, export) with live updates over IPC.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { JobState } from '@shared/ipc';

export const useJobsStore = defineStore('jobs', () => {
  const jobs = ref<JobState[]>([]);
  const now = ref(Date.now());
  /** the export job the user cares about right now */
  const exportJobId = ref<string | null>(null);
  const listeners = new Set<(job: JobState) => void>();

  const running = computed(() => jobs.value.filter((j) => j.status === 'running'));
  const analyzeJob = computed(() => running.value.find((j) => j.kind === 'analyze') ?? null);
  const exportJob = computed(() => jobs.value.find((j) => j.id === exportJobId.value) ?? null);
  const exporting = computed(() => exportJob.value?.status === 'running');

  function upsert(job: JobState): void {
    const i = jobs.value.findIndex((j) => j.id === job.id);
    if (i >= 0) jobs.value[i] = job;
    else jobs.value.unshift(job);
    for (const l of listeners) l(job);
  }

  async function init(): Promise<void> {
    jobs.value = await window.apexcut.jobs.list();
    window.apexcut.jobs.onUpdate(upsert);
    setInterval(() => (now.value = Date.now()), 1000);
    // adopt a running export after a reload
    const runningExport = jobs.value.find(
      (j) => (j.kind === 'export' || j.kind === 'extract') && j.status === 'running',
    );
    if (runningExport) exportJobId.value = runningExport.id;
  }

  /** subscribe to job transitions (e.g. analysis finished) */
  function onUpdate(cb: (job: JobState) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function elapsed(job: JobState): number {
    return Math.max(0, now.value / 1000 - job.startedAt);
  }
  function eta(job: JobState): number | null {
    if (job.status !== 'running' || job.progress < 0.03) return null;
    const e = elapsed(job);
    return (e / job.progress) * (1 - job.progress);
  }

  return {
    jobs,
    running,
    analyzeJob,
    exportJob,
    exportJobId,
    exporting,
    init,
    onUpdate,
    elapsed,
    eta,
  };
});
