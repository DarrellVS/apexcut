/**
 * Editing state for the open video: timeline data, parts, selection, undo/redo, playhead.
 * Every mutation goes through `mutate()` so undo snapshots and debounced saving stay consistent.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  joinParts,
  manualPart,
  missingAuto,
  suggestions as computeSuggestions,
} from '@core/selection';
import type { Part, ScoreConfig, Segment } from '@core/types';
import type { TimelinePayload } from '@shared/ipc';
import { useLibraryStore } from '@renderer/stores/library';
import { logger } from '@renderer/utils/logger';

export const AMOUNT_LEVELS = [92, 85, 75, 65, 55];

export const useEditorStore = defineStore('editor', () => {
  const stem = ref<string | null>(null);
  const data = ref<Record<string, (number | null)[]>>({});
  const threshold = ref(0);
  const config = ref<ScoreConfig | null>(null);
  const auto = ref<Segment[]>([]);
  const parts = ref<Part[]>([]);
  const duration = ref(0);
  const selection = ref<string[]>([]);
  const hoverId = ref<string | null>(null);
  const time = ref(0);
  const playing = ref(false);
  const history = ref<string[]>([]);
  const future = ref<string[]>([]);
  const dirty = ref(false);
  const filmstrip = ref<{ url: string; step: number; n: number; size: number } | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const selectedParts = computed(() => parts.value.filter((p) => selection.value.includes(p.id)));
  const enabledParts = computed(() => parts.value.filter((p) => p.enabled));
  const movieLength = computed(() =>
    enabledParts.value.reduce((a, p) => a + p.end_s - p.start_s, 0),
  );
  const activePart = computed(() => {
    if (hoverId.value) return parts.value.find((p) => p.id === hoverId.value) ?? null;
    if (selectedParts.value.length === 1) return selectedParts.value[0];
    return parts.value.find((p) => time.value >= p.start_s && time.value <= p.end_s) ?? null;
  });
  const suggestions = computed(() =>
    computeSuggestions(parts.value, (data.value.score ?? []) as number[], threshold.value),
  );
  const deletedAuto = computed(() => missingAuto(parts.value, auto.value));
  const amountIndex = computed(() => {
    const i = AMOUNT_LEVELS.indexOf(config.value?.threshold_pct ?? 75);
    return i >= 0 ? i : 2;
  });

  function load(s: string, payload: TimelinePayload): void {
    if (s !== stem.value) {
      history.value = [];
      future.value = [];
      filmstrip.value = null;
    }
    stem.value = s;
    data.value = payload.data;
    threshold.value = payload.threshold;
    config.value = payload.config;
    auto.value = payload.auto;
    parts.value = payload.parts;
    duration.value = payload.durationS;
    selection.value = [];
    dirty.value = false;
  }

  async function open(s: string): Promise<void> {
    load(s, await window.apexcut.analysis.timeline(s));
    window.apexcut.analysis.filmstrip(s).then((f) => {
      if (stem.value === s) filmstrip.value = f;
    });
  }

  function snapshot(): void {
    history.value.push(JSON.stringify(parts.value));
    if (history.value.length > 100) history.value.shift();
    future.value = [];
  }

  function save(): void {
    dirty.value = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!stem.value) return;
      parts.value.sort((a, b) => a.start_s - b.start_s);
      await window.apexcut.analysis.saveParts(stem.value, JSON.parse(JSON.stringify(parts.value)));
      dirty.value = false;
      // counts in the video list, top bar and Movie tab follow the saved picks
      useLibraryStore().refresh();
    }, 250);
  }

  /** Write a pending debounced save right now (before switching project or leaving the editor). */
  async function flush(): Promise<void> {
    if (!saveTimer || !stem.value) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    parts.value.sort((a, b) => a.start_s - b.start_s);
    await window.apexcut.analysis.saveParts(stem.value, JSON.parse(JSON.stringify(parts.value)));
    dirty.value = false;
    await useLibraryStore().refresh();
  }

  /** Leave the current video/project: save what is pending and clear everything. */
  async function close(): Promise<void> {
    await flush();
    stem.value = null;
    data.value = {};
    threshold.value = 0;
    config.value = null;
    auto.value = [];
    parts.value = [];
    duration.value = 0;
    selection.value = [];
    hoverId.value = null;
    time.value = 0;
    playing.value = false;
    history.value = [];
    future.value = [];
    filmstrip.value = null;
  }

  /** Apply a change with an undo snapshot and a debounced save. */
  function mutate(fn: () => void): void {
    snapshot();
    fn();
    save();
  }

  function undo(): void {
    const prev = history.value.pop();
    if (prev === undefined) return;
    future.value.push(JSON.stringify(parts.value));
    parts.value = JSON.parse(prev);
    selection.value = [];
    save();
  }
  function redo(): void {
    const next = future.value.pop();
    if (next === undefined) return;
    history.value.push(JSON.stringify(parts.value));
    parts.value = JSON.parse(next);
    selection.value = [];
    save();
  }

  function select(id: string, extend = false): void {
    if (extend) {
      selection.value = selection.value.includes(id)
        ? selection.value.filter((x) => x !== id)
        : [...selection.value, id];
    } else selection.value = [id];
  }
  function clearSelection(): void {
    selection.value = [];
  }

  function join(list: Part[]): Part | null {
    if (list.length < 2) return null;
    const merged = joinParts(list);
    mutate(() => {
      parts.value = parts.value.filter((p) => !list.includes(p));
      parts.value.push(merged);
    });
    selection.value = [merged.id];
    return merged;
  }
  function nextOf(p: Part): Part | undefined {
    return parts.value
      .filter((x) => x.start_s > p.start_s)
      .sort((a, b) => a.start_s - b.start_s)[0];
  }
  function setEnabled(list: Part[], enabled: boolean): void {
    mutate(() => list.forEach((p) => (p.enabled = enabled)));
  }
  /** Star / unstar: all become starred unless every one already is. */
  function toggleStar(list: Part[]): void {
    if (!list.length) return;
    const on = !list.every((p) => p.starred);
    mutate(() => list.forEach((p) => (p.starred = on || undefined)));
  }
  function remove(list: Part[]): void {
    mutate(() => (parts.value = parts.value.filter((p) => !list.includes(p))));
    selection.value = [];
  }
  function addAt(t: number): Part {
    const p = manualPart(t, duration.value);
    mutate(() => parts.value.push(p));
    selection.value = [p.id];
    return p;
  }
  function restore(seg: Segment): Part {
    const p: Part = { ...seg, id: `r${Date.now()}`, enabled: true, manual: true };
    mutate(() => parts.value.push(p));
    selection.value = [p.id];
    return p;
  }
  /** Drag edit: caller snapshots once on drag start, then calls `setEdge` repeatedly and `save` on release. */
  /**
   * Keyboard trim (I/O): move one edge to `t`, never past the neighbouring parts, with undo + save.
   * Returns false when nothing could move.
   */
  function trimTo(p: Part, edge: 'start_s' | 'end_s', t: number): boolean {
    const others = parts.value.filter((x) => x !== p);
    let v = t;
    if (edge === 'start_s') {
      const prevEnd = Math.max(
        0,
        ...others.filter((x) => x.end_s <= p.end_s - 1).map((x) => x.end_s),
      );
      v = Math.max(v, prevEnd);
    } else {
      const nextStart = Math.min(
        duration.value,
        ...others.filter((x) => x.start_s >= p.start_s + 1).map((x) => x.start_s),
      );
      v = Math.min(v, nextStart);
    }
    const before = p[edge];
    mutate(() => setEdge(p, edge, v));
    return p[edge] !== before;
  }
  /** Shift+I / Shift+O: trim to where the scan saw the action itself (the core of the part). */
  function trimToCore(p: Part, edge: 'start_s' | 'end_s'): boolean {
    const core = edge === 'start_s' ? p.core_start_s : p.core_end_s;
    if (core === undefined) return false;
    return trimTo(p, edge, core);
  }
  function setEdge(p: Part, edge: 'start_s' | 'end_s', t: number): void {
    let v = Math.round(Math.max(0, Math.min(duration.value, t)) * 10) / 10;
    if (edge === 'start_s') v = Math.min(v, p.end_s - 1);
    else v = Math.max(v, p.start_s + 1);
    p[edge] = v;
    p.manual = true;
  }

  async function rescore(patch: Partial<ScoreConfig>): Promise<void> {
    if (!stem.value || !config.value) return;
    snapshot();
    const cfg = {
      ...config.value,
      ...patch,
      weights: { ...config.value.weights, ...(patch.weights ?? {}) },
    };
    const payload = await window.apexcut.analysis.rescore(stem.value, cfg);
    load(stem.value, payload);
    logger.info('rescored', stem.value, payload.parts.length, 'parts');
  }

  return {
    stem,
    data,
    threshold,
    config,
    auto,
    parts,
    duration,
    selection,
    hoverId,
    time,
    playing,
    filmstrip,
    history,
    future,
    dirty,
    selectedParts,
    enabledParts,
    movieLength,
    activePart,
    suggestions,
    deletedAuto,
    amountIndex,
    open,
    close,
    flush,
    load,
    mutate,
    snapshot,
    save,
    undo,
    redo,
    select,
    clearSelection,
    join,
    nextOf,
    setEnabled,
    toggleStar,
    remove,
    addAt,
    restore,
    setEdge,
    trimTo,
    trimToCore,
    rescore,
  };
});
