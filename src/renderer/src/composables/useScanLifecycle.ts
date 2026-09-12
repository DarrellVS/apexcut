/**
 * What happens around a scan: the lists refresh while it runs, and when it ends the editor opens the
 * video it found parts in and says what came of it — including the videos it could not read, which
 * keep their reason for the rail and the stage.
 */
import { useEditorStore } from '@renderer/stores/editor';
import { useJobsStore } from '@renderer/stores/jobs';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { friendlyError } from '@renderer/utils/errors';
import { plural } from '@renderer/utils/format';

export function useScanLifecycle(opts: {
  /** the editor is on screen (a finished scan may open a video there) */
  inEditor: () => boolean;
  openClip: (stem: string) => Promise<void>;
  startPreview: () => void;
}): void {
  const editor = useEditorStore();
  const jobs = useJobsStore();
  const library = useLibraryStore();
  const projects = useProjectsStore();

  jobs.onUpdate(async (job) => {
    if (job.status === 'running') {
      // a scan reports "Done" per video: refresh so the "n of m videos done" count moves along
      if (job.kind === 'analyze' && job.message === 'Done') await library.refresh();
      return;
    }
    await Promise.all([library.refresh(), projects.refresh()]);
    if (job.kind !== 'analyze') return;

    if (job.status === 'done') {
      const failed = job.result?.kind === 'analyze' ? (job.result.failed ?? []) : [];
      library.noteScanFailures(failed);
      const target =
        library.analyzed.find((c) => c.stem === library.current) ?? library.analyzed[0];
      if (target && opts.inEditor()) {
        await opts.openClip(target.stem);
        if (failed.length) {
          const f = friendlyError(failed[0].error);
          toast(
            `${plural(failed.length, 'video')} could not be scanned (${f.title.toLowerCase()}); the rest is done. See the Ride panel.`,
            8000,
          );
        } else {
          const n = editor.parts.length;
          const corners = editor.parts.filter((p) => p.reden !== 'accel/rem').length;
          toast(
            `Done! Found ${n} fun parts${corners ? `, ${corners} with corners` : ''}. Press ▶ for a preview.`,
          );
          opts.startPreview();
        }
      }
    }
    if (job.status === 'error') {
      // nothing could be read: every video of that scan carries the reason
      library.noteScanFailures(
        library.clips
          .filter((c) => !c.analyzed)
          .map((c) => ({ stem: c.stem, error: job.error ?? '' })),
      );
      const f = friendlyError(job.error);
      toast(`${f.title}. ${f.hint}`, 8000);
    }
    if (job.status === 'cancelled') {
      toast('Scan stopped. Videos that were not scanned yet can be scanned from their menu.', 6000);
    }
  });
}
