/**
 * The crop window while it follows the corners: the same path `core/framing` burns into the export,
 * walked over the open video's signals so the frame on the stage moves exactly as the movie will.
 * Falls back to the resting position when the video has no signals (or the setting is off).
 */
import { computed, type ComputedRef } from 'vue';
import { followAt, followPath } from '@core/framing';
import { useFraming } from '@renderer/composables/useFraming';
import { useEditorStore } from '@renderer/stores/editor';

export interface FollowFrame {
  /** where the window sits right now (0..1); the resting position when it does not follow */
  pos: ComputedRef<number>;
  on: ComputedRef<boolean>;
}

export function useFollowFrame(): FollowFrame {
  const editor = useEditorStore();
  const framing = useFraming();

  const path = computed(() => {
    if (!framing.follow.value) return null;
    const t = editor.data.t as number[] | undefined;
    const yaw = editor.data.yawRateLpDps;
    if (!t?.length || !yaw?.length) return null;
    return { t, path: followPath(t, yaw, { p0: framing.framePos.value }) };
  });

  const on = computed(() => !!path.value);
  const pos = computed(() =>
    path.value ? followAt(path.value.t, path.value.path, editor.time) : framing.framePos.value,
  );
  return { pos, on };
}
