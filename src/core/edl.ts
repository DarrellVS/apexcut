/**
 * CMX3600 EDL + markers CSV. Importing the EDL in DaVinci Resolve / Premiere gives a timeline with only
 * the selected parts, linked to the original MP4 by clip name and source timecode.
 */
import type { Part } from './types';
import { REASON_LABEL, reasonOf } from './selection';

/** Frames-based timecode. `baseTc` is the source start timecode ("HH:MM:SS:FF"). */
export function timecode(seconds: number, fps: number, baseTc = '00:00:00:00'): string {
  const fr = Math.round(fps);
  const [h, m, s, f] = baseTc.replace(/;/g, ':').split(':').map(Number);
  const base = ((h * 60 + m) * 60 + s) * fr + f;
  const total = base + Math.round(seconds * fps);
  const ff = total % fr;
  const ss = Math.floor(total / fr) % 60;
  const mm = Math.floor(total / (fr * 60)) % 60;
  const hh = Math.floor(total / (fr * 3600));
  const p = (v: number): string => String(v).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

export function edl(
  parts: Part[],
  clipName: string,
  sourceFileName: string,
  fps: number,
  sourceTc = '00:00:00:00',
): string {
  const lines = [`TITLE: ${clipName} highlights`, 'FCM: NON-DROP FRAME', ''];
  let rec = 0;
  parts.forEach((p, i) => {
    const dur = p.end_s - p.start_s;
    lines.push(
      `${String(i + 1).padStart(3, '0')}  AX       AA/V  C        ${timecode(p.start_s, fps, sourceTc)} ${timecode(p.end_s, fps, sourceTc)} ${timecode(rec, fps)} ${timecode(rec + dur, fps)}`,
      `* FROM CLIP NAME: ${sourceFileName}`,
      `* COMMENT: ${REASON_LABEL[reasonOf(p)]} score ${(p.score ?? 0).toFixed(2)}`,
      '',
    );
    rec += dur;
  });
  return lines.join('\n');
}

export function markersCsv(parts: Part[], clipName: string, fps: number): string {
  const rows = [
    'clip,start_s,end_s,start_tc,end_tc,duration_s,reason,score,max_lean_deg,max_brake_g',
  ];
  for (const p of parts) {
    rows.push(
      [
        clipName,
        p.start_s,
        p.end_s,
        timecode(p.start_s, fps),
        timecode(p.end_s, fps),
        (p.end_s - p.start_s).toFixed(2),
        REASON_LABEL[reasonOf(p)],
        p.score ?? '',
        p.max_lean_deg ?? '',
        p.max_brake_g ?? '',
      ].join(','),
    );
  }
  return rows.join('\n');
}
