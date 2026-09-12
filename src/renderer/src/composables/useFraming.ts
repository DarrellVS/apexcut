/**
 * How this movie is framed: the format (square / widescreen / 4:3 / vertical) and where the crop
 * window sits (0..1 along the cropped axis). Both belong to the project — one ride is filmed one
 * way — while the app's last choice (`settings.lastFormat`) is only the starting point for a
 * project that has never been framed. The Movie panel and the stage read the same values here.
 */
import { computed, type ComputedRef } from 'vue';
import type { ExportFormat } from '@shared/ipc';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';

export interface Framing {
  format: ComputedRef<ExportFormat>;
  framePos: ComputedRef<number>;
  /** the project's format; also remembered app-wide as the start for the next new project */
  setFormat(f: ExportFormat): Promise<void>;
  /** where the crop window sits; `commit` false while dragging, true on release */
  setFramePos(pos: number, commit?: boolean): Promise<void>;
}

export function useFraming(): Framing {
  const projects = useProjectsStore();
  const settings = useSettingsStore();

  const format = computed<ExportFormat>(
    () => projects.active?.format ?? settings.settings?.lastFormat ?? '16x9',
  );
  const framePos = computed(
    () => projects.active?.framePos ?? settings.settings?.lastFramePos ?? 0.5,
  );

  async function setFormat(f: ExportFormat): Promise<void> {
    await Promise.all([projects.setFormat(f), settings.update({ lastFormat: f })]);
  }
  async function setFramePos(pos: number, commit = true): Promise<void> {
    const v = Math.min(1, Math.max(0, pos));
    // dragging writes the live value only; the release persists it (and remembers it app-wide)
    if (!commit) {
      if (projects.active) projects.active.framePos = v;
      return;
    }
    await Promise.all([projects.setFramePos(v), settings.update({ lastFramePos: v })]);
  }

  return { format, framePos, setFormat, setFramePos };
}
