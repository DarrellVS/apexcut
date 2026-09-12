/**
 * A popover or menu: open state plus the element it lives in, closed by a click outside or Escape
 * (composables/useDismiss.ts). Every floating thing in the app uses this, so they all behave alike.
 */
import { ref, type Ref } from 'vue';
import { useDismiss } from './useDismiss';

export interface Popover {
  open: Ref<boolean>;
  /** put this on the element that wraps both the button and the popover */
  root: Ref<HTMLElement | null>;
  toggle: () => void;
  close: () => void;
}

export function usePopover(onClose?: () => void): Popover {
  const open = ref(false);
  const root = ref<HTMLElement | null>(null);
  const close = (): void => {
    if (!open.value) return;
    open.value = false;
    onClose?.();
  };
  useDismiss(root, close);
  return { open, root, toggle: () => (open.value = !open.value), close };
}
