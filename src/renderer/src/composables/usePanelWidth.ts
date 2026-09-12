/**
 * A draggable, remembered panel width: drag the hairline between panels, the width is kept in
 * localStorage and clamped to [min, max]. `dir` says which way a rightward drag grows the panel.
 */
import { ref, type Ref } from 'vue';

export interface PanelWidth {
  width: Ref<number>;
  /** mousedown handler for the splitter element */
  start(e: MouseEvent): void;
  /** back to the initial width (double-click on the splitter) */
  reset(): void;
  dragging: Ref<boolean>;
}

/**
 * `max` may be a function so the limit can follow the window and the other panel (the stage in
 * the middle must keep room).
 */
export function usePanelWidth(
  key: string,
  initial: number,
  min: number,
  max: number | (() => number),
  dir: 1 | -1 = 1,
): PanelWidth {
  const stored = Number(localStorage.getItem(`apexcut.panel.${key}`));
  const width = ref(clamp(stored || initial));
  const dragging = ref(false);

  function clamp(w: number): number {
    let hi = Number.POSITIVE_INFINITY;
    try {
      hi = typeof max === 'function' ? max() : max;
    } catch {
      // a limit that reads the other panel is not available while this one is being set up
    }
    return Math.max(min, Math.min(Math.max(min, hi), Math.round(w)));
  }
  function reset(): void {
    width.value = clamp(initial);
    localStorage.setItem(`apexcut.panel.${key}`, String(width.value));
  }
  function start(e: MouseEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width.value;
    dragging.value = true;
    document.body.style.cursor = 'col-resize';
    const move = (ev: MouseEvent): void => {
      width.value = clamp(w0 + (ev.clientX - x0) * dir);
    };
    const up = (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      dragging.value = false;
      document.body.style.cursor = '';
      localStorage.setItem(`apexcut.panel.${key}`, String(width.value));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  return { width, start, reset, dragging };
}
