/**
 * Movie time: the timeline shows one video's own time, the movie is all enabled parts of all videos
 * back to back. The music lane and the preview need to map between the two.
 */
import { computed, type ComputedRef } from 'vue';
import type { MusicTrack } from '@shared/ipc';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { useProjectsStore } from '@renderer/stores/projects';

export interface PlacedTrack {
  track: MusicTrack;
  /** movie time where the song starts */
  offsetS: number;
  /** what plays of it, seconds */
  lengthS: number;
}

export interface MovieTime {
  /** length of the whole movie (all videos, enabled parts) */
  movieLen: ComputedRef<number>;
  /** movie time of the playhead in the open video */
  movieTimeOf: (t: number) => number;
  /** songs laid back to back from movie time 0 */
  placed: ComputedRef<PlacedTrack[]>;
  /** the song under a movie time, if any */
  trackAt: (movieT: number) => PlacedTrack | null;
}

export function useMovieTime(): MovieTime {
  const editor = useEditorStore();
  const library = useLibraryStore();
  const projects = useProjectsStore();

  /** enabled seconds of the open video come from the editor (live), of the others from the list */
  const lengthOf = (stem: string): number =>
    stem === editor.stem
      ? editor.enabledParts.reduce((a, p) => a + p.end_s - p.start_s, 0)
      : (library.clips.find((c) => c.stem === stem)?.highlightS ?? 0);

  const movieLen = computed(() => library.analyzed.reduce((a, c) => a + lengthOf(c.stem), 0));

  function movieTimeOf(t: number): number {
    let before = 0;
    for (const c of library.analyzed) {
      if (c.stem === editor.stem) break;
      before += lengthOf(c.stem);
    }
    const inside = editor.enabledParts
      .filter((p) => p.start_s < t)
      .reduce((a, p) => a + Math.min(p.end_s, t) - p.start_s, 0);
    return before + inside;
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

  function trackAt(movieT: number): PlacedTrack | null {
    return placed.value.find((p) => movieT >= p.offsetS && movieT < p.offsetS + p.lengthS) ?? null;
  }

  return { movieLen, movieTimeOf, placed, trackAt };
}

/** apexcut:// URL of a song for the <audio> element (the main process allows its folder). */
export function musicUrl(path: string): string {
  const enc = btoa(unescape(encodeURIComponent(path)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `apexcut://media/music/${enc}`;
}
