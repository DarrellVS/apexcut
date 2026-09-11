/**
 * A draggable, remembered panel width: drag the hairline between panels, the width is kept in
 * localStorage and clamped to [min, max]. `dir` says which way a rightward drag grows the panel.
 */
import { ref, type Ref } from 'vue';

export interface PanelWidth {
  width: Ref<number>;
  /** mousedown handler for the splitter element */
  start(e: MouseEvent): void;
  dragging: Ref<boolean>;
}

export function usePanelWidth(
  key: string,
  initial: number,
  min: number,
  max: number,
  dir: 1 | -1 = 1,
): PanelWidth {
  const stored = Number(localStorage.getItem(`apexcut.panel.${key}`));
  const width = ref(clamp(stored || initial));
  const dragging = ref(false);

  function clamp(w: number): number {
    return Math.max(min, Math.min(max, Math.round(w)));
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
  return { width, start, dragging };
}
