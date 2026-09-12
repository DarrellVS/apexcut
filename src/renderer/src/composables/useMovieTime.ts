/**
 * Movie time: the parts lane shows one video's own time, the movie is every part of every video back
 * to back, in the order `useMovieOrder` keeps. The music lane, the movie lane and the preview all
 * map between the two through here.
 */
import { computed, type ComputedRef } from 'vue';
import type { MusicTrack } from '@shared/ipc';
import { useMovieOrder } from '@renderer/composables/useMovieOrder';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';

export interface PlacedTrack {
  track: MusicTrack;
  /** movie time where the song starts */
  offsetS: number;
  /** what plays of it, seconds */
  lengthS: number;
}

export interface MovieTime {
  /** length of the whole movie (all videos, the parts that are in it) */
  movieLen: ComputedRef<number>;
  /** the width the lanes span: the movie, or the music when that runs on longer */
  laneLen: ComputedRef<number>;
  /** movie time of a moment in the open video */
  movieTimeOf: (t: number) => number;
  /** songs laid back to back from movie time 0 */
  placed: ComputedRef<PlacedTrack[]>;
  /** the song under a movie time, if any */
  trackAt: (movieT: number) => PlacedTrack | null;
}

export function useMovieTime(): MovieTime {
  const editor = useEditorStore();
  const projects = useProjectsStore();
  const movie = useMovieOrder();

  const movieLen = movie.movieLen;

  /**
   * Where a moment of the open video falls in the movie: inside a part, its own offset plus how far
   * in you are; between parts, the start of the next one; after the last, the end of the movie.
   */
  function movieTimeOf(t: number): number {
    const mine = movie.parts.value.filter((p) => p.stem === editor.stem);
    const inside = mine.find((p) => t >= p.part.start_s && t < p.part.end_s);
    if (inside) return inside.offsetS + (t - inside.part.start_s);
    const next = mine.find((p) => p.part.start_s >= t);
    if (next) return next.offsetS;
    const last = mine[mine.length - 1];
    return last ? last.offsetS + last.lengthS : 0;
  }

  const placed = computed<PlacedTrack[]>(() => {
    const out: PlacedTrack[] = [];
    let offset = 0;
    for (const track of projects.active?.music.tracks ?? []) {
      const lengthS = Math.max(0, track.outS - track.inS);
      out.push({ track, offsetS: offset, lengthS });
      offset += lengthS;
    }
    return out;
  });

  const laneLen = computed(() =>
    Math.max(
      1,
      movieLen.value,
      placed.value.reduce((a, p) => a + p.lengthS, 0),
    ),
  );

  function trackAt(movieT: number): PlacedTrack | null {
    return placed.value.find((p) => movieT >= p.offsetS && movieT < p.offsetS + p.lengthS) ?? null;
  }

  return { movieLen, laneLen, movieTimeOf, placed, trackAt };
}
