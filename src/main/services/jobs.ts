/**
 * Long-running work (analysis, export) runs as a job: progress + message streamed to the renderer,
 * cancellable through an AbortSignal, never awaited inside an IPC handler.
 */
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import log from 'electron-log/main';
import type { JobKind, JobResult, JobState } from '@shared/ipc';

export interface JobContext {
  progress(fraction: number, message?: string): void;
  signal: AbortSignal;
  log(message: string): void;
}

export class Jobs extends EventEmitter {
  private jobs = new Map<string, JobState>();
  private controllers = new Map<string, AbortController>();

  list(): JobState[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 30);
  }

  get(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  start(kind: JobKind, label: string, fn: (ctx: JobContext) => Promise<JobResult>): string {
    const id = randomUUID().slice(0, 8);
    const controller = new AbortController();
    const job: JobState = {
      id,
      kind,
      label,
      status: 'running',
      progress: 0,
      message: '',
      startedAt: Date.now() / 1000,
      result: null,
      error: null,
    };
    this.jobs.set(id, job);
    this.controllers.set(id, controller);
    const emit = (): void => {
      this.emit('update', { ...job });
    };
    emit();
    const ctx: JobContext = {
      progress: (fraction, message) => {
        job.progress = Math.max(0, Math.min(1, fraction));
        if (message) job.message = message;
        emit();
      },
      signal: controller.signal,
      log: (m) => log.info(`[${kind} ${id}] ${m}`),
    };
    fn(ctx)
      .then((result) => {
        job.status = 'done';
        job.progress = 1;
        job.result = result;
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        job.status = controller.signal.aborted || msg === 'cancelled' ? 'cancelled' : 'error';
        job.error = job.status === 'cancelled' ? null : msg;
        if (job.status === 'error') log.error(`[${kind} ${id}] failed:`, msg);
      })
      .finally(() => {
        this.controllers.delete(id);
        emit();
      });
    return id;
  }

  cancel(id: string): void {
    this.controllers.get(id)?.abort();
  }

  hasRunning(kind?: JobKind): boolean {
    return [...this.jobs.values()].some(
      (j) => j.status === 'running' && (!kind || j.kind === kind),
    );
  }
}
