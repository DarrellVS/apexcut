/**
 * The ride card: the numbers of the project as a shareable picture (portrait + landscape), saved
 * next to the movies and put on the clipboard. Offered from the project menu in the title bar.
 */
import { ref, type Ref } from 'vue';
import { api } from '@renderer/api';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { renderRideCard } from '@renderer/utils/rideCard';

export function useRideCard(): { busy: Ref<boolean>; make: () => Promise<void> } {
  const busy = ref(false);
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
      toast(`Ride card copied to the clipboard and saved next to your movies: ${r.file}`, 8000);
    } catch (e) {
      toast(`Could not make the ride card: ${(e as Error).message}`, 6000);
    } finally {
      busy.value = false;
    }
  }
  return { busy, make };
}
