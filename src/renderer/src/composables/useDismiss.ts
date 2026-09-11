/**
 * Shared popover behaviour: a mousedown outside the root element, or Escape, closes it.
 * Every menu and popover in the app uses this, so they all behave the same.
 */
import { onMounted, onUnmounted, type Ref } from 'vue';

export function useDismiss(root: Ref<HTMLElement | null>, close: () => void): void {
  function onDown(e: MouseEvent): void {
    if (root.value && !root.value.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }
  onMounted(() => {
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
  });
  onUnmounted(() => {
    document.removeEventListener('mousedown', onDown);
    window.removeEventListener('keydown', onKey);
  });
}
