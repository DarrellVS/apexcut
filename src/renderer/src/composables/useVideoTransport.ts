/**
 * Driving the player: play, pause, seek, shuttle, step a frame, jump to a part, and the preview that
 * plays only the parts that are in the movie. The playhead in the store follows the video per
 * animation frame while it plays, because `timeupdate` only fires about four times a second.
 */
import { nextTick, ref, type Ref } from 'vue';
import { useEditorStore } from '@renderer/stores/editor';
import { useLibraryStore } from '@renderer/stores/library';
import { toast } from '@renderer/components/Base/ToastHost.vue';

export interface VideoTransport {
  /** preview mode: only the parts that are in the movie, back to back */
  previewOn: Ref<boolean>;
  /** the finished movie being watched instead of the recording, by URL */
  watchingResult: Ref<string | null>;
  seek: (t: number) => void;
  play: (t?: number) => void;
  togglePlay: () => void;
  shuttle: (dir: 'play' | 'pause') => number;
  frameStep: (dir: 1 | -1) => void;
  seekPart: (dir: 1 | -1) => void;
  startPreview: () => void;
  togglePreview: () => void;
  watchResult: (url: string) => void;
  /** wire these to the <video> element */
  onTime: () => void;
  onPlay: () => void;
  onPause: () => void;
}

export function useVideoTransport(
  video: Ref<HTMLVideoElement | null>,
  onFrame: () => void,
): VideoTransport {
  const editor = useEditorStore();
  const library = useLibraryStore();
  const previewOn = ref(false);
  const watchingResult = ref<string | null>(null);

  const enabledInOrder = (): ReturnType<typeof editor.enabledParts.slice> =>
    editor.enabledParts.slice().sort((a, b) => a.start_s - b.start_s);

  function onTime(): void {
    const v = video.value;
    if (!v) return;
    editor.time = v.currentTime;
    editor.playing = !v.paused;
    if (previewOn.value && !v.paused && !watchingResult.value) {
      const on = enabledInOrder();
      const inside = on.find((p) => v.currentTime >= p.start_s && v.currentTime < p.end_s);
      if (!inside) {
        const next = on.find((p) => p.start_s > v.currentTime);
        if (next) v.currentTime = next.start_s;
        else {
          v.pause();
          previewOn.value = false;
          toast('That was your movie. Happy? Click "Make my movie".');
        }
      }
    }
  }

  function seek(t: number): void {
    const v = video.value;
    if (!v) return;
    if (watchingResult.value) watchingResult.value = null;
    v.currentTime = Math.max(0, Math.min(editor.duration || t, t));
    // the clock follows at once: a second key press right after this one must start from here,
    // not from the time before 'timeupdate' has fired
    editor.time = v.currentTime;
  }
  function play(t?: number): void {
    const v = video.value;
    if (!v) return;
    if (t !== undefined) seek(t);
    v.play().catch(() => undefined);
  }
  function togglePlay(): void {
    const v = video.value;
    if (!v?.src) return;
    v.paused ? v.play().catch(() => undefined) : v.pause();
  }
  /** L: play, and faster on every press (1× → 2× → 4×); K: pause and back to 1×. */
  function shuttle(dir: 'play' | 'pause'): number {
    const v = video.value;
    if (!v?.src) return 1;
    if (dir === 'pause') {
      v.pause();
      v.playbackRate = 1;
      return 1;
    }
    if (v.paused) {
      v.playbackRate = 1;
      v.play().catch(() => undefined);
    } else v.playbackRate = v.playbackRate >= 4 ? 1 : v.playbackRate * 2;
    return v.playbackRate;
  }
  /** , and . : one frame back / forward (pauses). */
  function frameStep(dir: 1 | -1): void {
    const v = video.value;
    if (!v?.src) return;
    v.pause();
    const fps = library.currentClip?.fps || 30;
    seek(v.currentTime + dir / fps);
    onTime();
  }
  function seekPart(dir: 1 | -1): void {
    const list = editor.parts.slice().sort((a, b) => a.start_s - b.start_s);
    const t = editor.time;
    const p =
      dir > 0
        ? list.find((x) => x.start_s > t + 0.5)
        : [...list].reverse().find((x) => x.start_s < t - 1);
    if (p) {
      editor.select(p.id);
      play(p.start_s);
    }
  }
  function startPreview(): void {
    const on = enabledInOrder();
    if (!on.length) {
      toast('No parts selected');
      return;
    }
    previewOn.value = true;
    const cur = on.find((p) => editor.time >= p.start_s && editor.time < p.end_s);
    play(cur ? editor.time : on[0].start_s);
  }
  function togglePreview(): void {
    if (previewOn.value) previewOn.value = false;
    else startPreview();
  }
  function watchResult(url: string): void {
    previewOn.value = false;
    watchingResult.value = url;
    nextTick(() => video.value?.play().catch(() => undefined));
    toast('This is your movie. Click a block to go back to the recording.');
  }

  // smooth clock while playing
  let raf = 0;
  function tick(): void {
    const v = video.value;
    if (!v || v.paused) {
      raf = 0;
      return;
    }
    editor.time = v.currentTime;
    onFrame();
    raf = requestAnimationFrame(tick);
  }
  function onPlay(): void {
    editor.playing = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function onPause(): void {
    editor.playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    onTime();
    onFrame();
  }

  return {
    previewOn,
    watchingResult,
    seek,
    play,
    togglePlay,
    shuttle,
    frameStep,
    seekPart,
    startPreview,
    togglePreview,
    watchResult,
    onTime,
    onPlay,
    onPause,
  };
}
