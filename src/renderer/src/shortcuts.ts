/**
 * One table of keyboard shortcuts: the handlers in App.vue and the list in Settings → Shortcuts
 * both read it, so they cannot drift apart.
 */
export interface Shortcut {
  keys: string[];
  label: string;
}
export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Playback',
    items: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['L'], label: 'Play forward; press again for 2× and 4×' },
      { keys: ['K'], label: 'Pause (and back to normal speed)' },
      { keys: ['J'], label: 'Jump back 10 seconds' },
      { keys: [','], label: 'One frame back' },
      { keys: ['.'], label: 'One frame forward' },
      { keys: ['←', '→'], label: '5 seconds back / forward' },
      { keys: ['['], label: 'Previous part' },
      { keys: [']'], label: 'Next part' },
    ],
  },
  {
    title: 'Parts',
    items: [
      { keys: ['I'], label: 'Set the start of the selected part at the playhead' },
      { keys: ['O'], label: 'Set the end of the selected part at the playhead' },
      { keys: ['Shift', 'I'], label: 'Trim the start to where the action really begins' },
      { keys: ['Shift', 'O'], label: 'Trim the end to where the action really ends' },
      { keys: ['N'], label: 'New part at the playhead' },
      { keys: ['M'], label: 'Join the selected parts' },
      { keys: ['F'], label: 'Star / unstar the selected parts' },
      { keys: ['Delete'], label: 'Delete the selected parts' },
      { keys: ['Esc'], label: 'Clear the selection' },
    ],
  },
  {
    title: 'App',
    items: [
      { keys: ['Ctrl', 'Z'], label: 'Undo' },
      { keys: ['Ctrl', 'Y'], label: 'Redo' },
      { keys: ['Ctrl', ','], label: 'Settings' },
      { keys: ['?'], label: 'This list' },
    ],
  },
];
