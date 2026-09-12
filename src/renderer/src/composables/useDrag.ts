/**
 * The one drag in the app: press, move, release. Every draggable thing (a part's edge, the crop
 * frame, a song's trim handle, a panel splitter, the playhead) follows the same shape — remember
 * where the press started, update while the mouse moves, write the result once on release — so they
 * all behave the same and none of them can leak a listener.
 */
export interface DragHandlers<T> {
  /** what the press starts from: the value being dragged, measured once */
  start: (e: MouseEvent) => T;
  /** while dragging, as often as the mouse moves */
  move: (e: MouseEvent, from: T) => void;
  /** on release: the place to persist the result */
  end?: (e: MouseEvent, from: T) => void;
  /** CSS cursor for the duration of the drag */
  cursor?: string;
}

/** Begin a drag from a mousedown handler. Left button only; other buttons are ignored. */
export function startDrag<T>(e: MouseEvent, handlers: DragHandlers<T>): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const from = handlers.start(e);
  const previousCursor = document.body.style.cursor;
  if (handlers.cursor) document.body.style.cursor = handlers.cursor;
  const onMove = (ev: MouseEvent): void => handlers.move(ev, from);
  const onUp = (ev: MouseEvent): void => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (handlers.cursor) document.body.style.cursor = previousCursor;
    handlers.end?.(ev, from);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
