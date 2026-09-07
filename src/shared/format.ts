/** Time as a clock, no empty leading units: 5 s → "5 s", 70 s → "1:10", 3725 s → "1:02:05". */
export function fmtClock(seconds: number): string {
  const v = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  if (h) return `${h}:${two(m)}:${two(s)}`;
  if (m) return `${m}:${two(s)}`;
  return `${s} s`;
}
