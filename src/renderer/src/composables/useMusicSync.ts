/**
 * The song under the video while you watch. It plays whenever the playhead is inside a part that is
 * in the movie — preview or not — with the ride sound turned down under it, and it follows movie
 * time, so what you hear is what the export will have. Watching a finished movie plays its own
 * sound instead.
 */
import { ref, type Ref } from 'vue';
import { useMovieTime } from '@renderer/composables/useMovieTime';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';
import { musicUrl } from '@renderer/utils/media';

export interface MusicSync {
  /** the <audio> element that plays the song */
  audio: Ref<HTMLAudioElement | null>;
  /** call whenever the picture moved or stopped */
  sync: () => void;
}

export function useMusicSync(
  video: Ref<HTMLVideoElement | null>,
  watchingResult: Ref<string | null>,
): MusicSync {
  const editor = useEditorStore();
  const projects = useProjectsStore();
  const { movieTimeOf, trackAt } = useMovieTime();
  const audio = ref<HTMLAudioElement | null>(null);
  let src = '';

  function sync(): void {
    const v = video.value;
    const a = audio.value;
    if (!v || !a) return;
    const settings = projects.active?.music;
    const t = v.currentTime;
    const inPart = editor.enabledParts.some((p) => t >= p.start_s && t < p.end_s);
    const active = inPart && !v.paused && !watchingResult.value && settings?.tracks.length;
    const hit = active ? trackAt(movieTimeOf(t)) : null;
    if (!hit) {
      if (!a.paused) a.pause();
      v.volume = 1;
      return;
    }
    const url = musicUrl(hit.track.path);
    if (src !== url) {
      src = url;
      a.src = url;
    }
    const want = hit.track.inS + (movieTimeOf(v.currentTime) - hit.offsetS);
    if (Math.abs(a.currentTime - want) > 0.35) a.currentTime = want;
    a.volume = Math.min(1, hit.track.gain * (settings?.musicGain ?? 0.8));
    v.volume = settings?.originalGain ?? 0.35;
    if (a.paused) a.play().catch(() => undefined);
  }

  return { audio, sync };
}
