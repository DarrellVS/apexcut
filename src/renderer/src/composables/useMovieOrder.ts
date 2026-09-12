/**
 * The movie as a list: every part that is in it, in the order it plays, with the moment it starts.
 * Naturally that is the videos in the order of the ride and the parts in the order they happened;
 * dragging a part in the movie lane writes an explicit order on the project, and everything — the
 * lane, movie time, the music under it and the export — reads it from here, so they cannot disagree.
 */
import { computed, type ComputedRef } from 'vue';
import type { Part } from '@core/types';
import { useRideParts } from '@renderer/composables/useRideParts';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';

export interface MoviePart {
  /** `"<video>:<part id>"`, the name this part has in the saved order */
  key: string;
  stem: string;
  part: Part;
  /** movie time where it starts, and how long it plays */
  offsetS: number;
  lengthS: number;
}

export interface MovieOrder {
  /** the parts that are in the movie, in the order they play */
  parts: ComputedRef<MoviePart[]>;
  movieLen: ComputedRef<number>;
  /** the movie has an order of its own, not the natural one */
  custom: ComputedRef<boolean>;
  /** move a part in front of `beforeKey`, or to the end when that is null */
  move: (key: string, beforeKey: string | null) => Promise<void>;
  /** back to the natural order */
  reset: () => Promise<void>;
}

export const partKey = (stem: string, partId: string): string => `${stem}:${partId}`;

export function useMovieOrder(): MovieOrder {
  const library = useLibraryStore();
  const projects = useProjectsStore();
  const ride = useRideParts();

  /** every part that is in the movie, in the natural order: the ride's videos, then time */
  const natural = computed(() =>
    library.analyzed
      .filter((c) => c.exists)
      .flatMap((c) =>
        ride
          .partsOf(c.stem)
          .filter((p) => p.enabled)
          .map((part) => ({ key: partKey(c.stem, part.id), stem: c.stem, part })),
      ),
  );
  const saved = computed(() => projects.active?.order ?? []);
  const custom = computed(() => saved.value.length > 0);

  const parts = computed<MoviePart[]>(() => {
    const list = [...natural.value];
    if (custom.value) {
      const at = new Map(saved.value.map((k, i) => [k, i]));
      // a part the saved order does not know (a new one, or one that came back) keeps its place
      // among the others by falling in behind them
      list.sort((a, b) => (at.get(a.key) ?? Infinity) - (at.get(b.key) ?? Infinity));
    }
    let offsetS = 0;
    return list.map(({ key, stem, part }) => {
      const lengthS = Math.max(0, part.end_s - part.start_s);
      const placed = { key, stem, part, offsetS, lengthS };
      offsetS += lengthS;
      return placed;
    });
  });
  const movieLen = computed(() => parts.value.reduce((a, p) => a + p.lengthS, 0));

  async function move(key: string, beforeKey: string | null): Promise<void> {
    const keys = parts.value.map((p) => p.key).filter((k) => k !== key);
    const at = beforeKey ? keys.indexOf(beforeKey) : -1;
    if (at < 0) keys.push(key);
    else keys.splice(at, 0, key);
    await projects.setOrder(keys);
  }
  const reset = (): Promise<void> => projects.setOrder([]);

  return { parts, movieLen, custom, move, reset };
}
