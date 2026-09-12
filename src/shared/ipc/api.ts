/**
 * Everything the renderer can call. Implemented in preload (a thin `ipcRenderer.invoke` each),
 * served by main (src/main/ipc/), and used through `@renderer/api`, which makes the arguments safe
 * for the bridge.
 */
import type { Grade } from '@core/grade';
import type { PresetId } from '@core/presets';
import type { Part, ScoreConfig } from '@core/types';
import type { ExportFormat, Transition } from './movie';
import type {
  ClipInfo,
  EncoderInfo,
  ImportGroup,
  JobState,
  MusicSettings,
  MusicTrack,
  OverlaySpecDto,
  ProjectInfo,
  RideStats,
  Settings,
  StorageInfo,
  TimelinePayload,
  UpdateStatus,
  WindowState,
} from './dto';
import type { ExportRequest } from './schemas';

export interface ApexcutApi {
  projects: {
    list(): Promise<ProjectInfo[]>;
    /** id of the open project */
    active(): Promise<string>;
    open(id: string): Promise<void>;
    create(name: string): Promise<ProjectInfo>;
    rename(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
    /** save dialog + write `.apexcut`; null when cancelled */
    exportFile(id: string): Promise<{ file: string } | null>;
    /** open dialog + import `.apexcut` as a new project; null when cancelled */
    importFile(): Promise<{ id: string; missing: string[] } | null>;
    /** sensitivity preset of the open project; rescoring every scanned video of it */
    setPreset(preset: PresetId): Promise<void>;
    /** count straight-line acceleration pulls in the open project; rescoring every scanned video */
    setPulls(on: boolean): Promise<void>;
    /** move a project to / out of the Archived section; an archived open project closes */
    archive(id: string, archived: boolean): Promise<void>;
    /** how the open project's parts are joined in the movie */
    setTransition(transition: Transition): Promise<void>;
    /** the open project's music lane */
    setMusic(music: MusicSettings): Promise<void>;
    /** the open project's telemetry overlay (null = off) */
    setOverlay(overlay: OverlaySpecDto | null): Promise<void>;
    /** the movie's colours; `id` targets another project (copy to…), default the open one */
    setGrade(grade: Grade | null, id?: string): Promise<void>;
    /** shape of the open project's movie */
    setFormat(format: ExportFormat): Promise<void>;
    /** where the crop window sits for the open project (0..1) */
    setFramePos(pos: number): Promise<void>;
    /** even the volume of the open project's movie out when it is made */
    setLoudness(on: boolean): Promise<void>;
    /** the order the parts play in (`"<video>:<part id>"` keys); empty goes back to the natural one */
    setOrder(order: string[]): Promise<void>;
    /** the numbers of the open project for the ride card */
    rideStats(): Promise<RideStats>;
    /**
     * Add videos in groups: `name` null = into the open project, otherwise a new project with that
     * name. Returns the stems added, which of them still need a scan, and the first project created.
     */
    addGroups(
      groups: { name: string | null; paths: string[] }[],
    ): Promise<{ stems: string[]; toScan: string[]; firstProject: string | null }>;
  };
  library: {
    /** videos of the open project, in movie order */
    list(): Promise<ClipInfo[]>;
    /** file/folder dialog; returns what was picked (nothing is added yet) */
    pick(kind: 'files' | 'dir'): Promise<{ paths: string[]; cancelled: boolean }>;
    /** what a pick/drop contains, per recording day, without adding */
    inspect(paths: string[]): Promise<ImportGroup[]>;
    add(paths: string[]): Promise<{ added: string[] }>;
    /** take a video out of the open project (its scan is kept for other projects) */
    remove(stem: string): Promise<void>;
    /** new order of all videos (also the order in the movie) */
    reorder(stems: string[]): Promise<void>;
    /**
     * Video files moved: pick one file for `stem`, or a folder to fix every missing video found in it.
     * `relinked` = stems fixed; `mismatch` = the picked file belongs to another video; null = cancelled.
     */
    relink(
      kind: 'file' | 'dir',
      stem?: string,
    ): Promise<{ relinked: string[]; mismatch?: string } | null>;
  };
  files: {
    /** absolute path of a File dropped from Explorer (Electron webUtils) */
    pathOf(file: File): string;
  };
  music: {
    /** file dialog for songs; returns them probed (name, length) and ready for the lane */
    pick(): Promise<MusicTrack[]>;
    /** probe files (e.g. dropped ones) the same way */
    add(paths: string[]): Promise<MusicTrack[]>;
    /** does the file still exist? */
    exists(path: string): Promise<boolean>;
  };
  analysis: {
    run(stems: string[], config?: Partial<ScoreConfig>): Promise<string>;
    rescore(stem: string, config: Partial<ScoreConfig>): Promise<TimelinePayload>;
    timeline(stem: string): Promise<TimelinePayload>;
    saveParts(stem: string, parts: Part[]): Promise<void>;
    filmstrip(stem: string): Promise<{ url: string; step: number; n: number; size: number }>;
    /** one frame of a video as a JPEG data URL (for the ride card) */
    frame(stem: string, tS: number, width?: number): Promise<string>;
  };
  exporter: {
    start(req: ExportRequest): Promise<string>;
    cancel(jobId: string): Promise<void>;
    edl(stem: string): Promise<{ file: string }>;
  };
  jobs: {
    list(): Promise<JobState[]>;
    onUpdate(cb: (job: JobState) => void): () => void;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    encoders(): Promise<EncoderInfo>;
    /** folder picker for the output folder; null when cancelled */
    pickOutputDir(): Promise<Settings | null>;
  };
  shell: {
    openFolder(path: string): Promise<void>;
  };
  storage: {
    info(): Promise<StorageInfo>;
    /** delete scans of videos that are in no project */
    cleanup(): Promise<{ removed: string[]; freedBytes: number }>;
  };
  updater: {
    status(): Promise<UpdateStatus>;
    /** start a check; the outcome arrives through onStatus */
    check(): Promise<UpdateStatus>;
    /** quit and install a downloaded update */
    install(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
  window: {
    /** colours of the native window buttons drawn over the custom title bar (Windows / Linux) */
    setOverlay(color: string, symbolColor: string): Promise<void>;
    /** maximised / full screen / focused, pushed by main on every change and once after load */
    onState(cb: (s: WindowState) => void): () => void;
    /** double-click on the title bar: maximise or restore (macOS follows the system preference) */
    titlebarDoubleClick(): void;
  };
  app: {
    version(): Promise<string>;
    /** zip of logs + project list + settings + app info in Documents; returns its path */
    report(): Promise<{ file: string }>;
    /** renderer warnings/errors also land in main.log */
    log(level: 'warn' | 'error', message: string): void;
    /** quit and start ApexCut again (the error card's "Restart ApexCut") */
    relaunch(): void;
    /** main-process crash that the renderer should show */
    onFatal(cb: (err: { message: string; stack?: string }) => void): () => void;
    /** save a PNG data URL into the output folder and put it on the clipboard; returns the file */
    saveImage(dataUrl: string, name: string): Promise<{ file: string }>;
  };
}
