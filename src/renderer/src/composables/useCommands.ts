/**
 * Everything you can ask ApexCut to do, as a list: what it is called, where it belongs, and what it
 * does. The command palette (Ctrl+K) searches this; nothing here is new behaviour, every entry calls
 * something that already exists, so the palette cannot drift away from the buttons.
 */
import { computed, type ComputedRef } from 'vue';
import { api } from '@renderer/api';
import { LOOKS } from '@core/grade';
import { FORMATS, TRANSITION_LABEL, TRANSITIONS, type ExportFormat } from '@shared/ipc';
import { useFraming } from '@renderer/composables/useFraming';
import { useRideCard } from '@renderer/composables/useRideCard';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUiStore } from '@renderer/stores/ui';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { fmtTime, shortName } from '@renderer/utils/format';

export interface Command {
  id: string;
  /** what it is called, in the words the buttons use */
  label: string;
  /** where it lives, shown after the name */
  group: string;
  /** extra words that should find it */
  keywords?: string;
  /** the keyboard shortcut that does the same, if there is one */
  keys?: string;
  run: () => void | Promise<void>;
}

const FORMAT_LABEL: Record<ExportFormat, string> = {
  original: 'Square (as recorded)',
  '16x9': 'Widescreen 16:9',
  '4x3': 'Classic 4:3',
  '9x16': 'Vertical 9:16',
};

/** what the palette needs from the parts of the app it cannot reach on its own */
export interface CommandContext {
  inEditor: () => boolean;
  goHome: () => void | Promise<void>;
  pick: (kind: 'files' | 'dir') => void | Promise<void>;
  make: (scope: 'all' | 'current') => void;
  seek: (t: number) => void;
  play: (t: number) => void;
  togglePreview: () => void;
}

export function useCommands(ctx: CommandContext): ComputedRef<Command[]> {
  const editor = useEditorStore();
  const library = useLibraryStore();
  const projects = useProjectsStore();
  const settings = useSettingsStore();
  const ui = useUiStore();
  const framing = useFraming();
  const rideCard = useRideCard();

  return computed<Command[]>(() => {
    const out: Command[] = [];
    const add = (c: Command): number => out.push(c);

    // ---- the app
    add({
      id: 'projects',
      label: 'All projects',
      group: 'App',
      keywords: 'home switch project',
      run: () => ctx.goHome(),
    });
    add({
      id: 'settings',
      label: 'Settings',
      group: 'App',
      keys: 'Ctrl+,',
      run: () => ui.openSettings(),
    });
    add({
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      group: 'App',
      keys: '?',
      run: () => ui.openSettings('shortcuts'),
    });
    add({
      id: 'theme',
      label:
        settings.settings?.theme === 'dark'
          ? 'Switch to the light theme'
          : 'Switch to the dark theme',
      group: 'App',
      keywords: 'appearance colours dark light',
      run: () => settings.update({ theme: settings.settings?.theme === 'dark' ? 'light' : 'dark' }),
    });
    add({
      id: 'add-videos',
      label: 'Add videos…',
      group: 'Ride',
      run: () => ctx.pick('files'),
    });
    add({
      id: 'add-folder',
      label: 'Add a whole folder…',
      group: 'Ride',
      keywords: 'memory card import',
      run: () => ctx.pick('dir'),
    });

    // ---- the open project
    for (const p of projects.projects.filter((p) => !p.archived && p.id !== projects.activeId)) {
      add({
        id: `open-${p.id}`,
        label: `Open “${p.name}”`,
        group: 'Projects',
        keywords: 'switch ride',
        run: () => projects.open(p.id),
      });
    }
    if (!ctx.inEditor()) return out;

    // ---- the editor
    add({
      id: 'make',
      label: 'Make my movie',
      group: 'Movie',
      keywords: 'export render',
      run: () => ctx.make('all'),
    });
    add({
      id: 'preview',
      label: 'Preview the movie',
      group: 'Movie',
      keywords: 'play parts',
      run: () => ctx.togglePreview(),
    });
    add({
      id: 'ride-card',
      label: 'Make ride card',
      group: 'Movie',
      keywords: 'picture share instagram',
      run: () => rideCard.make(),
    });
    for (const f of FORMATS) {
      add({
        id: `format-${f}`,
        label: `Format: ${FORMAT_LABEL[f]}`,
        group: 'Movie',
        keywords: 'shape crop widescreen vertical square',
        run: () => framing.setFormat(f),
      });
    }
    for (const t of TRANSITIONS) {
      add({
        id: `transition-${t}`,
        label: `Between the parts: ${TRANSITION_LABEL[t].label}`,
        group: 'Movie',
        keywords: 'transition join crossfade cut dip',
        run: () => projects.setTransition(t),
      });
    }
    for (const l of LOOKS) {
      add({
        id: `look-${l.id}`,
        label: `Colours: ${l.label}`,
        group: 'Movie',
        keywords: `look grade ${l.hint}`,
        run: () => projects.setGrade(l.id === 'none' ? null : { ...l.grade }),
      });
    }

    // ---- the video and its parts
    for (const c of library.analyzed.filter((c) => c.stem !== library.current)) {
      add({
        id: `video-${c.stem}`,
        label: `Open ${shortName(c.stem)}`,
        group: 'Ride',
        keywords: 'video clip',
        run: () => {
          library.current = c.stem;
        },
      });
    }
    add({
      id: 'scan-again',
      label: 'Scan this video again',
      group: 'Ride',
      keywords: 'analyse parts',
      run: async () => {
        if (!editor.stem) return;
        await api.analysis.run([editor.stem]);
        toast('Scanning again…');
      },
    });
    add({
      id: 'add-part',
      label: `Add a part at ${fmtTime(editor.time)}`,
      group: 'Parts',
      keys: 'N',
      run: () => {
        editor.addAt(editor.time);
        toast('Part added — drag the edges to fit');
      },
    });
    if (editor.selectedParts.length) {
      const n = editor.selectedParts.length;
      add({
        id: 'star',
        label: n === 1 ? 'Star this part' : `Star ${n} parts`,
        group: 'Parts',
        keys: 'F',
        run: () => editor.toggleStar(editor.selectedParts),
      });
      add({
        id: 'leave-out',
        label: n === 1 ? 'Leave this part out' : `Leave ${n} parts out`,
        group: 'Parts',
        run: () => editor.setEnabled(editor.selectedParts, !editor.selectedParts[0].enabled),
      });
      add({
        id: 'delete',
        label: n === 1 ? 'Delete this part' : `Delete ${n} parts`,
        group: 'Parts',
        keys: 'Delete',
        run: () => {
          editor.remove(editor.selectedParts);
          toast('Part deleted — Ctrl+Z brings it back');
        },
      });
    }
    if (editor.history.length) {
      add({ id: 'undo', label: 'Undo', group: 'Parts', keys: 'Ctrl+Z', run: () => editor.undo() });
    }
    if (editor.future.length) {
      add({ id: 'redo', label: 'Redo', group: 'Parts', keys: 'Ctrl+Y', run: () => editor.redo() });
    }
    // jump straight to a part
    for (const p of editor.parts.slice(0, 50)) {
      add({
        id: `jump-${p.id}`,
        label: `Go to ${fmtTime(p.start_s)}`,
        group: 'Parts',
        keywords: `${p.reden} part jump`,
        run: () => {
          editor.select(p.id);
          ctx.play(p.start_s);
        },
      });
    }
    add({
      id: 'start',
      label: 'Go to the start of the video',
      group: 'Parts',
      keys: 'Home',
      run: () => ctx.seek(0),
    });
    return out;
  });
}
