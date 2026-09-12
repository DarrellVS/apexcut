/**
 * The ride card: the numbers of the project as a shareable picture (portrait + landscape), saved
 * next to the movies and put on the clipboard. Offered from the project menu in the title bar.
 * The state is module-level so the title bar can start it and the shell can show the result
 * (`Ride/RideCardSheet.vue`) — the same way the export shows what it made.
 */
import { ref, type Ref } from 'vue';
import { api } from '@renderer/api';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { renderRideCard } from '@renderer/utils/rideCard';

export interface RideCardResult {
  /** the saved portrait PNG (the landscape one sits next to it) */
  file: string;
  /** data URL of the portrait card, for the preview */
  preview: string;
}

const busy = ref(false);
const result = ref<RideCardResult | null>(null);

export interface RideCard {
  busy: Ref<boolean>;
  /** the card just made, until it is dismissed */
  result: Ref<RideCardResult | null>;
  make: () => Promise<void>;
  close: () => void;
}

export function useRideCard(): RideCard {
  async function make(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
      const stats = await api.projects.rideStats();
      const thumbs = await Promise.all(
        stats.top.map((t) => api.analysis.frame(t.stem, t.tS, 960).catch(() => '')),
      );
      const dark = document.documentElement.dataset.theme !== 'light';
      const base = `${stats.name} - ride card`;
      const portrait = await renderRideCard(stats, thumbs, 'portrait', dark);
      const landscape = await renderRideCard(stats, thumbs, 'landscape', dark);
      await api.app.saveImage(landscape, `${base} (wide)`);
      const r = await api.app.saveImage(portrait, base);
      result.value = { file: r.file, preview: portrait };
    } catch (e) {
      toast(`Could not make the ride card: ${(e as Error).message}`, 6000);
    } finally {
      busy.value = false;
    }
  }
  function close(): void {
    result.value = null;
  }
  return { busy, result, make, close };
}
