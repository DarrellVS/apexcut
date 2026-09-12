/**
 * The numbers of a whole project for the ride card: measured inside the parts that are in the movie
 * only, so the card describes the movie the rider is about to share, not the raw recording.
 */
import { countCorners, rangeStats, twistiestMinute } from '@core/stats';
import type { RideStats } from '@shared/ipc';
import type { Analysis } from './analysis';
import type { Projects } from './projects';

export function rideStats(projects: Projects, analysis: Analysis): RideStats {
  const clips = projects.clipInfos().filter((c) => c.analyzed);
  let maxLean = 0;
  let maxBrake = 0;
  let twisty: { stem: string; tS: number; pct: number } | null = null;
  let nParts = 0;
  let nCorners = 0;
  let movieS = 0;
  const ranked: (RideStats['top'][number] & { score: number })[] = [];
  for (const c of clips) {
    const tl = analysis.timeline(c.stem);
    const t = (tl.data.t ?? []) as number[];
    const lean = tl.data.leanDeg ?? [];
    const aLon = tl.data.aLonG ?? [];
    const enabled = tl.parts.filter((p) => p.enabled);
    if (!enabled.length) continue;
    nCorners += countCorners(t, lean, enabled);
    const tw = twistiestMinute(t, lean, enabled);
    if (tw && (!twisty || tw.pct > twisty.pct)) twisty = { stem: c.stem, ...tw };
    for (const p of enabled) {
      const st = rangeStats(t, lean, aLon, p);
      maxLean = Math.max(maxLean, st.maxLeanDeg);
      maxBrake = Math.max(maxBrake, st.maxBrakeG);
      nParts++;
      movieS += p.end_s - p.start_s;
      ranked.push({
        stem: c.stem,
        tS: p.core_start_s ?? (p.start_s + p.end_s) / 2,
        reden: p.reden,
        maxLeanDeg: Math.round(st.maxLeanDeg * 10) / 10,
        score: p.score ?? 0,
      });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  const first = [...clips].sort((a, b) => a.stem.localeCompare(b.stem))[0];
  const m = first && /_(\d{4})(\d{2})(\d{2})\d{6}_/.exec(first.stem);
  return {
    name: projects.active.name,
    day: m ? `${m[1]}-${m[2]}-${m[3]}` : null,
    nVideos: clips.length,
    nParts,
    nCorners,
    movieS: Math.round(movieS),
    maxLeanDeg: Math.round(maxLean),
    maxBrakeG: Math.round(maxBrake * 100) / 100,
    twistyStem: twisty?.stem ?? null,
    twistyT: twisty?.tS ?? 0,
    twistyPct: twisty?.pct ?? 0,
    top: ranked
      .slice(0, 3)
      .map(({ stem, tS, reden, maxLeanDeg }) => ({ stem, tS, reden, maxLeanDeg })),
  };
}
