/**
 * Where the picture actually is inside the stage. The video is `object-fit: contain` in a black box
 * 8 px inside the panel, so the frame, the dark edges and the gauge all need the same rectangle.
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StageBox {
  box: Ref<Box>;
  /** measure now (after a resize, a new video, or a format change) */
  measure: () => void;
}

/** the black video box sits this far inside the stage */
const PAD = 8;

export function useStageBox(
  stage: Ref<HTMLElement | null>,
  video: Ref<HTMLVideoElement | null>,
): StageBox {
  const box = ref<Box>({ left: 0, top: 0, width: 0, height: 0 });
  function measure(): void {
    const v = video.value;
    const st = stage.value;
    if (!v || !st || !v.videoWidth) return;
    const W = st.clientWidth - 2 * PAD;
    const H = st.clientHeight - 2 * PAD;
    const ar = v.videoWidth / v.videoHeight;
    let w = W;
    let h = W / ar;
    if (h > H) {
      h = H;
      w = H * ar;
    }
    box.value = { left: PAD + (W - w) / 2, top: PAD + (H - h) / 2, width: w, height: h };
  }
  let ro: ResizeObserver | null = null;
  onMounted(() => {
    if (!stage.value) return;
    ro = new ResizeObserver(measure);
    ro.observe(stage.value);
  });
  onUnmounted(() => ro?.disconnect());
  return { box, measure };
}
