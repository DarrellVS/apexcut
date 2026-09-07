/**
 * Relink videos whose files moved: one file for a specific video, or a folder for all missing ones.
 * Wraps the dialog IPC with the toasts riders should read.
 */
import { useLibraryStore } from '@renderer/stores/library';
import { shortName } from '@renderer/utils/format';
import { toast } from '@renderer/components/Base/ToastHost.vue';

export interface Relink {
  relink(kind: 'file' | 'dir', stem?: string): Promise<void>;
}

export function useRelink(): Relink {
  const library = useLibraryStore();

  async function relink(kind: 'file' | 'dir', stem?: string): Promise<void> {
    const r = await window.apexcut.library.relink(kind, stem);
    if (!r) return;
    await library.refresh();
    if (r.relinked.length) {
      toast(
        r.relinked.length === 1
          ? `${shortName(r.relinked[0])} found again — parts and scan kept`
          : `${r.relinked.length} videos found again`,
      );
    } else if (r.mismatch) {
      toast(
        `That file is ${shortName(r.mismatch)}, not ${shortName(stem ?? '')}. Pick the file with the same number.`,
        6000,
      );
    } else {
      toast('No missing videos found there', 5000);
    }
  }

  return { relink };
}
