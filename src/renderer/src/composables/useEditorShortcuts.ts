/**
 * The keyboard of the editor. The table people read lives in `shortcuts.ts`; this is the same table
 * as behaviour. Keys are ignored while a text field has focus, while Settings is open, and when a
 * focused timeline block already handles them itself.
 */
import { onMounted, onUnmounted } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { useUiStore } from '@renderer/stores/ui';
import { toast } from '@renderer/components/Base/ToastHost.vue';

/** what the stage can do for the keyboard (VideoStage exposes exactly these) */
export interface TransportKeys {
  togglePlay: () => void;
  shuttle: (dir: 'play' | 'pause') => number;
  seek: (t: number) => void;
  frameStep: (dir: 1 | -1) => void;
  seekPart: (dir: 1 | -1) => void;
}

const TYPING = ['INPUT', 'SELECT', 'TEXTAREA'];
/** a focused block owns these (Timeline/PartBlock); the window must not act on them as well */
const BLOCK_KEYS = [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'];

export function useEditorShortcuts(opts: {
  /** the editor is on screen */
  active: () => boolean;
  stage: () => TransportKeys | null;
}): void {
  const editor = useEditorStore();
  const ui = useUiStore();

  function onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === ',') {
      e.preventDefault();
      ui.toggleSettings();
      return;
    }
    if (!opts.active() || ui.settingsOpen) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      e.shiftKey ? editor.redo() : editor.undo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      editor.redo();
      return;
    }
    const target = e.target as HTMLElement;
    if (TYPING.includes(target.tagName)) return;
    if (target.closest('[data-part]') && BLOCK_KEYS.includes(e.key)) return;

    const stage = opts.stage();
    // I / O: set an edge of the selected part at the playhead (a new part when none is selected)
    const trim = (edge: 'start_s' | 'end_s', toCore: boolean): void => {
      let p = editor.selectedParts.length === 1 ? editor.selectedParts[0] : null;
      if (!p && !toCore) p = editor.addAt(editor.time);
      if (!p) return;
      const ok = toCore ? editor.trimToCore(p, edge) : editor.trimTo(p, edge, editor.time);
      if (!ok)
        toast(toCore ? 'This part has no scanned core to trim to' : 'Cannot move the edge there');
    };
    switch (e.key) {
      case ' ':
        e.preventDefault();
        stage?.togglePlay();
        break;
      case 'l':
      case 'L': {
        const rate = stage?.shuttle('play') ?? 1;
        if (rate > 1) toast(`${rate}× speed`, 1200);
        break;
      }
      case 'k':
      case 'K':
        stage?.shuttle('pause');
        break;
      case 'j':
      case 'J':
        stage?.seek(editor.time - 10);
        break;
      case ',':
        stage?.frameStep(-1);
        break;
      case '.':
        stage?.frameStep(1);
        break;
      case 'i':
      case 'I':
        trim('start_s', e.shiftKey);
        break;
      case 'o':
      case 'O':
        trim('end_s', e.shiftKey);
        break;
      case '?':
        ui.openSettings('shortcuts');
        break;
      case 'ArrowLeft':
        stage?.seek(editor.time - (e.shiftKey ? 1 : 5));
        break;
      case 'ArrowRight':
        stage?.seek(editor.time + (e.shiftKey ? 1 : 5));
        break;
      case 'Home':
        stage?.seek(0);
        break;
      case 'End':
        stage?.seek(editor.duration);
        break;
      case ']':
        stage?.seekPart(1);
        break;
      case '[':
        stage?.seekPart(-1);
        break;
      case 'Delete':
      case 'Backspace':
        if (editor.selectedParts.length) {
          editor.remove(editor.selectedParts);
          toast('Part deleted — Ctrl+Z brings it back');
        }
        break;
      case 'm':
        editor.join(editor.selectedParts);
        break;
      case 'f':
        editor.toggleStar(editor.selectedParts);
        break;
      case 'n':
        editor.addAt(editor.time);
        toast('Part added — drag the edges to fit');
        break;
      case 'Escape':
        editor.clearSelection();
        break;
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey));
  onUnmounted(() => window.removeEventListener('keydown', onKey));
}
