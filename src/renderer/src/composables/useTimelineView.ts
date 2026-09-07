/**
 * Visible time window of the timeline: zoom (wheel), pan (shift+wheel), follow the playhead, and
 * time ↔ x% mapping shared by every lane.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';

export interface TimelineView {
  t0: Ref<number>;
  t1: Ref<number>;
  span: ComputedRef<number>;
  zoom: ComputedRef<number>;
  fit(): void;
  xPct(t: number): number;
  tOfEvent(e: MouseEvent, el: HTMLElement): number;
  zoomAt(tCenter: number, factor: number): void;
  pan(fraction: number): void;
  setZoom(z: number, center: number): void;
  follow(t: number): void;
  onWheel(e: WheelEvent, el: HTMLElement): void;
}

export function useTimelineView(duration: Ref<number>): TimelineView {
  const t0 = ref(0);
  const t1 = ref(1);

  const span = computed(() => t1.value - t0.value);
  const zoom = computed(() => (duration.value ? 1 - span.value / duration.value : 0));

  function fit(): void {
    t0.value = 0;
    t1.value = Math.max(1, duration.value);
  }
  function clampWindow(a: number, b: number): void {
    const d = duration.value;
    if (b - a > d) {
      a = 0;
      b = d;
    }
    if (a < 0) {
      b -= a;
      a = 0;
    }
    if (b > d) {
      a -= b - d;
      b = d;
    }
    t0.value = Math.max(0, a);
    t1.value = Math.min(d, b);
  }
  function xPct(t: number): number {
    return ((t - t0.value) / span.value) * 100;
  }
  function tOfEvent(e: MouseEvent, el: HTMLElement): number {
    const r = el.getBoundingClientRect();
    return t0.value + ((e.clientX - r.left) / r.width) * span.value;
  }
  function zoomAt(tCenter: number, factor: number): void {
    clampWindow(tCenter - (tCenter - t0.value) * factor, tCenter + (t1.value - tCenter) * factor);
  }
  function pan(fraction: number): void {
    const d = span.value * fraction;
    clampWindow(t0.value + d, t1.value + d);
  }
  function setZoom(z: number, center: number): void {
    const s = Math.max(5, duration.value * (1 - z));
    const c = Math.min(Math.max(center, s / 2), duration.value - s / 2);
    clampWindow(c - s / 2, c + s / 2);
  }
  /** keep the playhead visible while playing */
  function follow(t: number): void {
    if (t < t0.value || t > t1.value) {
      const s = span.value;
      clampWindow(t - s * 0.1, t - s * 0.1 + s);
    }
  }
  function onWheel(e: WheelEvent, el: HTMLElement): void {
    e.preventDefault();
    if (e.shiftKey) pan(0.15 * Math.sign(e.deltaY));
    else zoomAt(tOfEvent(e, el), e.deltaY > 0 ? 1.25 : 0.8);
  }

  return { t0, t1, span, zoom, fit, xPct, tOfEvent, zoomAt, pan, setZoom, follow, onWheel };
}
