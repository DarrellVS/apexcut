/** Time/duration formatting used everywhere in the UI. */
export function fmtTime(t: number, tenths = false): string {
  const v = Math.max(0, t || 0);
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${m}:${String(s).padStart(2, '0')}${tenths ? `.${Math.floor((v % 1) * 10)}` : ''}`;
}

export function fmtDuration(t: number): string {
  return t < 60 ? `${Math.round(t)} sec` : `${fmtTime(t)} min`;
}

export function fmtElapsed(s: number): string {
  const v = Math.round(s);
  if (v < 60) return `${v} sec`;
  const m = Math.floor(v / 60);
  const r = v % 60;
  if (m < 60) return `${m} min${r ? ` ${r} sec` : ''}`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** "DJI_20260906104754_0034_D" → "Video 34" */
export function shortName(stem: string): string {
  const m = /_(\d{4})_/.exec(stem);
  return m ? `Video ${parseInt(m[1], 10)}` : stem;
}
