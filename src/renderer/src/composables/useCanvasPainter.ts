/**
 * A canvas that redraws itself: when its size changes, when the theme changes (the drawings read the
 * design tokens) and when the data it shows changes. Every lane of the timeline and the gauge over
 * the video use this, so none of them can forget an observer or leave one behind.
 */
import { nextTick, onMounted, onUnmounted, watch, type Ref } from 'vue';

export interface Paint {
  ctx: CanvasRenderingContext2D;
  /** device pixels, what you draw in */
  W: number;
  H: number;
  dpr: number;
}

/** Size a canvas to its box in device pixels and hand back its context. */
export function setupCanvas(cv: HTMLCanvasElement): Paint | null {
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio;
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  return { ctx, W: cv.width, H: cv.height, dpr };
}

export function useCanvasPainter(
  cv: Ref<HTMLCanvasElement | null>,
  paint: (p: Paint) => void,
  deps: () => unknown,
): { redraw: () => void } {
  const redraw = (): void => {
    const el = cv.value;
    if (!el) return;
    const p = setupCanvas(el);
    if (p) paint(p);
  };
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;
  onMounted(() => {
    if (cv.value) {
      ro = new ResizeObserver(redraw);
      ro.observe(cv.value);
    }
    // the drawings take their colours from the design tokens: a theme change means a redraw
    mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    redraw();
  });
  onUnmounted(() => {
    ro?.disconnect();
    mo?.disconnect();
  });
  watch(deps, () => nextTick(redraw), { deep: true });
  return { redraw };
}

/** The design tokens as the canvas needs them: plain colour strings. */
export function tokens(): (name: string) => string {
  const css = getComputedStyle(document.documentElement);
  return (name: string) => css.getPropertyValue(name).trim();
}
