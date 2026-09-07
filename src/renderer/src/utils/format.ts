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

/** 1234567 → "1.2 MB" */
export function fmtBytes(n: number): string {
  if (n < 1e6) return `${Math.round(n / 1e3)} kB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}

/** When something was last edited, the way people say it: "today 14:27", "yesterday", "Mon 7 Sep". */
export function fmtWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const dayStart = (x: Date): number =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `today ${hm}`;
  if (days === 1) return `yesterday ${hm}`;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "DJI_20260906104754_0034_D" → "Video 34" */
export function shortName(stem: string): string {
  const m = /_(\d{4})_/.exec(stem);
  return m ? `Video ${parseInt(m[1], 10)}` : stem;
}

/** "1 part", "6 parts" */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
