/**
 * How this movie is framed: the format (square / widescreen / 4:3 / vertical) and where the crop
 * window sits (0..1 along the cropped axis). Both belong to the project — one ride is filmed one
 * way — while the app's last choice (`settings.lastFormat`) is only the starting point for a
 * project that has never been framed. The Movie panel and the stage read the same values here.
 */
import { computed, type ComputedRef } from 'vue';
import type { ExportFormat } from '@shared/ipc';
import { FORMAT_SPEC } from '@shared/ipc';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';

/** the crop window a format makes on the open video */
export interface CropWindow {
  /** how much of the frame it keeps along the axis it crops (1 = the whole frame) */
  frac: number;
  /** it slides left and right (a tall format on a wide video), rather than up and down */
  horizontal: boolean;
}

export interface Framing {
  format: ComputedRef<ExportFormat>;
  framePos: ComputedRef<number>;
  /**
   * What the chosen format crops out of this recording. Which way the window slides depends on both
   * shapes, not on the format alone: 16:9 keeps the whole frame of a GoPro that already films 16:9,
   * while it takes a band out of DJI's square picture.
   */
  window: ComputedRef<CropWindow>;
  /** vertical movies only: the crop window leans into the corners */
  follow: ComputedRef<boolean>;
  /** the project's format; also remembered app-wide as the start for the next new project */
  setFormat(f: ExportFormat): Promise<void>;
  /** where the crop window sits; `commit` false while dragging, true on release */
  setFramePos(pos: number, commit?: boolean): Promise<void>;
  setFollow(on: boolean): Promise<void>;
}

export function useFraming(): Framing {
  const library = useLibraryStore();
  const projects = useProjectsStore();
  const settings = useSettingsStore();

  const format = computed<ExportFormat>(
    () => projects.active?.format ?? settings.settings?.lastFormat ?? '16x9',
  );
  const framePos = computed(
    () => projects.active?.framePos ?? settings.settings?.lastFramePos ?? 0.5,
  );
  const window = computed<CropWindow>(() => {
    const spec = FORMAT_SPEC[format.value];
    const clip = library.currentClip;
    const source = (clip?.width ?? 1) / (clip?.height ?? 1);
    if (!spec || !Number.isFinite(source) || source <= 0) return { frac: 1, horizontal: false };
    const want = spec.w / spec.h;
    return want < source
      ? { frac: want / source, horizontal: true }
      : { frac: source / want, horizontal: false };
  });

  // only the vertical format has room to move sideways, so only there does following mean anything
  const follow = computed(() => format.value === '9x16' && !!projects.active?.follow);

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

  const setFollow = (on: boolean): Promise<void> => projects.setFollow(on);

  return { format, framePos, window, follow, setFormat, setFramePos, setFollow };
}
