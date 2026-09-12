/**
 * The colours the stage shows: a selected part with its own colours wins, else the part under the
 * playhead, else the movie's. The SVG filter and the dark-edges overlay are built from the same
 * maths as the export (core/grade.ts), so the picture is a true preview. A finished movie is shown
 * as it is — its colours are already baked in.
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import { isNeutral, type Grade } from '@core/grade';
import { useEditorStore } from '@renderer/stores/editor';
import { useProjectsStore } from '@renderer/stores/projects';
import { gradeFilterMarkup, vignetteCss } from '@renderer/utils/gradeSvg';

export interface LiveGrade {
  grade: ComputedRef<Grade | null>;
  /** inner markup of the SVG <filter> the video points at */
  markup: ComputedRef<string>;
  /** style for the video element */
  style: ComputedRef<{ filter?: string }>;
  /** style for the dark-edges overlay, or null when there are none */
  vignette: ComputedRef<{ background: string } | null>;
  /** something is being changed about the colours: the stage says so */
  on: ComputedRef<boolean>;
}

export function useLiveGrade(watchingResult: Ref<string | null>): LiveGrade {
  const editor = useEditorStore();
  const projects = useProjectsStore();

  const grade = computed<Grade | null>(() => {
    const sel = editor.selectedParts;
    if (sel.length === 1 && sel[0].grade) return sel[0].grade;
    const t = editor.time;
    const at = editor.parts.find((p) => t >= p.start_s && t < p.end_s);
    return at?.grade ?? projects.active?.grade ?? null;
  });
  const markup = computed(() => gradeFilterMarkup(grade.value));
  const style = computed(() =>
    markup.value && !watchingResult.value ? { filter: 'url(#apexcut-grade-live)' } : {},
  );
  const vignette = computed(() => {
    const css = watchingResult.value ? '' : vignetteCss(grade.value);
    return css ? { background: css } : null;
  });
  const on = computed(() => !watchingResult.value && !isNeutral(grade.value));

  return { grade, markup, style, vignette, on };
}
