/**
 * Analysis of one clip: ffmpeg stream-copies the `djmd` track → core parses, derives IMU signals,
 * scores → results persisted under clips/<stem>/ (shared by all projects). Also rescoring from cached
 * signals, the timeline payload for the renderer, and saving the user's selection, which lives per
 * project (`selectionFile` is provided by the Projects service).
 */
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { DjmdHeader } from '@core/dji/djmd';
import type { GoproHeader } from '@core/gopro';
import type { ImuSignals } from '@core/imu';
import { pictureScore, type PictureStats } from '@core/picture';
import { compute, type ScoreResult, type ScoreSignals } from '@core/score';
import type { GestureMark } from '@core/gesture';
import { autoToParts, marksToParts, mergeSelection } from '@core/selection';
import type { Part, ScoreConfig, Segment } from '@core/types';
import type { TimelinePayload } from '@shared/ipc';
import { GestureScanAction } from '../actions/gesture';
import { PictureStatsAction } from '../actions/picture';
import { ThumbnailAction } from '../actions/thumbs';
import type { JobContext } from './jobs';
import type { ClipMeta, Library } from './library';
import { extractDataTrack, probe } from './media';
import log from 'electron-log/main';
import { ensureDir, paths, readJson, writeJson } from './store';

/** 10 Hz columns kept on disk and sent to the renderer. */
const SIGNAL_COLUMNS = [
  'leanDeg',
  'yawRateLpDps',
  'aLonG',
  'aLatG',
  'rollDeg',
  'speedGate',
  'accelGate',
  'leanYawGate',
  'nLean',
  'nYaw',
  'nAccel',
  'score',
  'picture',
] as const satisfies readonly (keyof ScoreSignals)[];

interface StoredSignals {
  fs: number;
  t: number[];
  imu: Record<
    keyof Pick<ImuSignals, 'leanDeg' | 'yawRateLpDps' | 'aLonG' | 'aLatG' | 'rollDeg'>,
    number[]
  >;
  imuT: number[];
}

interface StoredHighlights {
  threshold: number;
  config: ScoreConfig;
  segments: Segment[];
  signals: Record<string, (number | null)[]>;
}

/** Parse + IMU + scoring in a worker thread so the main process stays responsive. */
function runAnalysisWorker(
  raw: Uint8Array,
  cfg: Partial<ScoreConfig> | undefined,
  camera: Camera,
  durationS: number,
  signal: AbortSignal,
): Promise<{ header: CameraHeader; imu: ImuSignals; result: ScoreResult }> {
  return new Promise((resolve, reject) => {
    // bundled next to this file by electron-vite; unpacked from the asar in the packaged app
    const script = join(__dirname, 'workers', 'analyze.js').replace(
      'app.asar',
      'app.asar.unpacked',
    );
    const worker = new Worker(script, { workerData: { raw, cfg, camera, durationS } });
    const stop = (): void => {
      worker.terminate().catch(() => undefined);
      reject(new Error('cancelled'));
    };
    signal.addEventListener('abort', stop, { once: true });
    worker.once('message', (m: { error?: string } & Record<string, unknown>) => {
      signal.removeEventListener('abort', stop);
      if (m.error) reject(new Error(m.error));
      else resolve(m as unknown as { header: CameraHeader; imu: ImuSignals; result: ScoreResult });
    });
    worker.once('error', (e) => {
      signal.removeEventListener('abort', stop);
      reject(e);
    });
  });
}

/** which camera wrote the motion track of a video */
export type Camera = 'dji' | 'gopro';
type CameraHeader = Partial<DjmdHeader> & Partial<GoproHeader> & { model: string };
/** the data track each camera writes, in the order we look for them */
const TRACKS: { tag: string; camera: Camera }[] = [
  { tag: 'djmd', camera: 'dji' },
  { tag: 'gpmd', camera: 'gopro' },
];

const round = (v: number, d: number): number | null =>
  Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;

export class Analysis {
  constructor(
    private readonly library: Library,
    private readonly selectionFile: (stem: string) => string,
  ) {}

  private readSelection(stem: string): { parts: Part[]; frozen?: boolean } {
    return readJson<{ parts: Part[]; frozen?: boolean }>(this.selectionFile(stem), { parts: [] });
  }

  private writeSelection(stem: string, sel: { parts: Part[]; frozen?: boolean }): void {
    writeJson(this.selectionFile(stem), sel);
  }

  dir(stem: string): string {
    return ensureDir(paths.clipDir(stem));
  }

  async analyze(
    stem: string,
    cfg: Partial<ScoreConfig> | undefined,
    ctx: JobContext,
    base = 0,
    span = 1,
  ): Promise<void> {
    const rec = this.library.get(stem);
    const source = this.library.proxyOf(stem);
    const prog = (f: number, m: string): void => ctx.progress(base + f * span, m);
    prog(0.05, 'Reading metadata');
    const info = await probe(source);
    const track = TRACKS.find((t) => info.dataTags.includes(t.tag));
    if (!track) {
      throw new Error(
        `This video has no motion data (no camera sensor track in ${basename(source)}).`,
      );
    }
    const raw = await extractDataTrack(source, track.tag);
    if (ctx.signal.aborted) throw new Error('cancelled');
    prog(0.6, 'Reading your camera’s motion sensor');
    const {
      header,
      imu,
      result: motionResult,
    } = await runAnalysisWorker(raw, cfg, track.camera, info.duration, ctx.signal);
    prog(0.8, 'Scoring');
    const dir = this.dir(stem);

    // full-res dimensions come from the MP4; the proxy is what we analysed
    const full = rec.mp4 && rec.mp4 !== source ? await probe(rec.mp4).catch(() => info) : info;
    const meta: ClipMeta = {
      stem,
      durationS: info.duration,
      fps: info.fps,
      width: full.width,
      height: full.height,
      proxyWidth: info.width,
      proxyHeight: info.height,
      model: header.model,
      firmware: header.firmware,
      timecode: full.timecode,
      sourceKbps: full.kbps,
      tenBit: full.tenBit,
    };
    writeJson(join(dir, 'clip.json'), meta);

    // when the rider let the picture vote, this video has to be looked at before it is scored
    let result = motionResult;
    if (cfg?.picture_weight) {
      prog(0.82, 'Looking at the picture');
      await this.lookAtPicture(stem, ctx, 0.82, 0.1);
      result = compute(imu, cfg, this.pictureSignal(stem, cfg));
    }
    // card thumbnail for the video list: a frame 10 % in, past the parking-lot start
    await new ThumbnailAction()
      .execute(stem, source, info.duration * 0.1, 160, 'thumb.jpg')
      .catch((e) => ctx.log(`thumbnail failed: ${(e as Error).message}`));
    const stored: StoredSignals = {
      fs: imu.fs,
      imuT: Array.from(imu.t, (v) => round(v, 4) as number),
      t: Array.from(result.signals.t, (v) => round(v, 3) as number),
      imu: {
        leanDeg: Array.from(imu.leanDeg, (v) => round(v, 4) as number),
        yawRateLpDps: Array.from(imu.yawRateLpDps, (v) => round(v, 4) as number),
        aLonG: Array.from(imu.aLonG, (v) => round(v, 5) as number),
        aLatG: Array.from(imu.aLatG, (v) => round(v, 5) as number),
        rollDeg: Array.from(imu.rollDeg, (v) => round(v, 4) as number),
      },
    };
    writeJson(join(dir, 'signals.json'), stored);
    this.storeHighlights(dir, result);
    const previous = this.readSelection(stem);
    // an imported selection (from the legacy editor) is kept exactly as it was, once
    const parts = previous.frozen
      ? previous.parts
      : mergeSelection(previous.parts, result.segments);
    this.writeSelection(stem, { parts });
    log.info(
      `analysis ${stem}: ${result.segments.length} auto, selection now ${parts.length} parts (${parts.filter((p) => p.manual).length} manual, frozen=${!!previous.frozen}, previous=${previous.parts.length})`,
    );
    prog(1, 'Done');
  }

  /** Import a selection edited elsewhere; the next analysis keeps it untouched instead of merging. */
  importSelection(stem: string, parts: Part[]): void {
    this.writeSelection(stem, { parts, frozen: true });
  }

  private storeHighlights(dir: string, result: ScoreResult): void {
    const signals: Record<string, (number | null)[]> = {};
    for (const c of SIGNAL_COLUMNS) signals[c] = Array.from(result.signals[c], (v) => round(v, 3));
    const hl: StoredHighlights = {
      threshold: result.threshold,
      config: result.config,
      segments: result.segments,
      signals,
    };
    writeJson(join(dir, 'highlights.json'), hl);
  }

  /** Recompute score/segments from cached 30 Hz IMU signals (fast, no video access). */
  rescore(stem: string, cfg: Partial<ScoreConfig>): TimelinePayload {
    const dir = this.dir(stem);
    const stored = readJson<StoredSignals | null>(join(dir, 'signals.json'), null);
    if (!stored) throw new Error('not analysed');
    const f = (a: number[]): Float64Array => Float64Array.from(a);
    const imu: ImuSignals = {
      t: f(stored.imuT),
      fs: stored.fs,
      leanDeg: f(stored.imu.leanDeg),
      yawRateLpDps: f(stored.imu.yawRateLpDps),
      aLonG: f(stored.imu.aLonG),
      aLatG: f(stored.imu.aLatG),
      rollDeg: f(stored.imu.rollDeg),
      // not needed by the scorer
      pitchDeg: new Float64Array(0),
      yawDeg: new Float64Array(0),
      yawRateDps: new Float64Array(0),
      aVertG: new Float64Array(0),
    };
    const result = compute(imu, cfg, this.pictureSignal(stem, cfg));
    this.storeHighlights(dir, result);
    const previous = this.readSelection(stem).parts;
    const merged = mergeSelection(previous, result.segments);
    this.writeSelection(stem, { parts: merged });
    log.info(
      `rescore ${stem}: ${result.segments.length} auto, selection now ${merged.length} parts (${merged.filter((p) => p.manual).length} manual, previous=${previous.length})`,
    );
    return this.timeline(stem);
  }

  /**
   * What the picture had to say about this video, when the rider asked for it to vote. Null when
   * the weight is zero or the video has not been looked at yet.
   */
  private pictureSignal(
    stem: string,
    cfg: Partial<ScoreConfig>,
  ): ReturnType<typeof pictureScore> | null {
    if (!cfg.picture_weight) return null;
    const stats = this.picture(stem);
    return stats ? pictureScore(stats) : null;
  }

  /** The cached picture numbers of a video, if it has been looked at. */
  picture(stem: string): PictureStats | null {
    return readJson<PictureStats | null>(join(this.dir(stem), 'picture.json'), null);
  }

  /**
   * Look at the picture of a video and remember what it is like — a pass over the small proxy, ten
   * seconds or so for a long recording. Cached, so switching the vote off and on again is free.
   */
  async lookAtPicture(stem: string, ctx: JobContext, base = 0, span = 1): Promise<PictureStats> {
    const cached = this.picture(stem);
    if (cached) return cached;
    const source = this.library.proxyOf(stem);
    const meta = readJson<ClipMeta | null>(join(this.dir(stem), 'clip.json'), null);
    const stats = await new PictureStatsAction().execute(
      source,
      ctx.signal,
      (f) => ctx.progress(base + f * span, 'Looking at the picture'),
      meta?.durationS,
    );
    writeJson(join(this.dir(stem), 'picture.json'), stats);
    log.info(`picture ${stem}: ${stats.t.length} frames looked at`);
    return stats;
  }

  /** The moments the rider marked with two fingers, if this video has been looked at. */
  marks(stem: string): GestureMark[] | null {
    return readJson<GestureMark[] | null>(join(this.dir(stem), 'marks.json'), null);
  }

  /**
   * Look through a video for the rider's own marks and put them in the selection as parts. Cached
   * like the picture numbers, so switching it off and on again costs nothing.
   */
  async lookForMarks(stem: string, ctx: JobContext, base = 0, span = 1): Promise<GestureMark[]> {
    let marks = this.marks(stem);
    if (!marks) {
      const meta = readJson<ClipMeta | null>(join(this.dir(stem), 'clip.json'), null);
      marks = await new GestureScanAction().execute(
        this.library.proxyOf(stem),
        ctx.signal,
        (f) => ctx.progress(base + f * span, 'Looking for your marks'),
        meta?.durationS,
      );
      writeJson(join(this.dir(stem), 'marks.json'), marks);
      log.info(`marks ${stem}: ${marks.length} found`);
    }
    this.applyMarks(stem, marks);
    return marks;
  }

  /** Put the marks of a video into its selection (or take them out again when `on` is false). */
  applyMarks(stem: string, marks: GestureMark[] | null): void {
    const sel = this.readSelection(stem);
    const meta = readJson<ClipMeta | null>(join(this.dir(stem), 'clip.json'), null);
    const others = sel.parts.filter((p) => !p.marked);
    const mine = marks ? marksToParts(marks, meta?.durationS ?? 0) : [];
    const parts = [...others, ...mine].sort((a, b) => a.start_s - b.start_s);
    this.writeSelection(stem, { ...sel, parts });
  }

  /** The config the clip was last scored with, or null when not analysed. */
  configOf(stem: string): ScoreConfig | null {
    return (
      readJson<StoredHighlights | null>(join(this.dir(stem), 'highlights.json'), null)?.config ??
      null
    );
  }

  timeline(stem: string): TimelinePayload {
    const dir = this.dir(stem);
    const hl = readJson<StoredHighlights | null>(join(dir, 'highlights.json'), null);
    const stored = readJson<StoredSignals | null>(join(dir, 'signals.json'), null);
    const meta = readJson<ClipMeta | null>(join(dir, 'clip.json'), null);
    if (!hl || !stored || !meta) throw new Error('not analysed');
    const parts = existsSync(this.selectionFile(stem))
      ? this.readSelection(stem).parts
      : autoToParts(hl.segments);
    return {
      data: { t: stored.t, ...hl.signals },
      threshold: hl.threshold,
      config: hl.config,
      parts,
      auto: hl.segments,
      durationS: meta.durationS,
    };
  }

  saveParts(stem: string, parts: Part[]): void {
    log.info(
      `saveParts ${stem}: ${parts.length} parts (${parts.filter((p) => p.manual).length} manual)`,
    );
    this.writeSelection(stem, { parts: [...parts].sort((a, b) => a.start_s - b.start_s) });
  }

  parts(stem: string): Part[] {
    return this.readSelection(stem).parts;
  }

  /** the stored 30 Hz signals (for the telemetry overlay) */
  signals(stem: string): StoredSignals | null {
    return readJson<StoredSignals | null>(join(this.dir(stem), 'signals.json'), null);
  }

  meta(stem: string): ClipMeta | null {
    return readJson<ClipMeta | null>(join(this.dir(stem), 'clip.json'), null);
  }
}
