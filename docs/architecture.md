# Architecture

Single npm package, electron-vite (three Vite builds: main, preload, renderer), electron-builder.

```
src/
  core/        pure TypeScript, no Node/DOM imports — unit-tested, parity-tested against the Python oracle
    dji/pb.ts       schema-less protobuf wire decoder
    dji/djmd.ts     DJI `djmd` track → per-frame {t, quaternion, accel}
    imu.ts          quaternion → Euler, gravity compensation, Butterworth low-pass (scipy-compatible filtfilt)
    score.ts        features, robust normalisation, gates, segments (see docs/scoring.md)
    selection.ts    user selection: auto vs manual parts, overlap rule, join, suggestions
    edl.ts          CMX3600 EDL + markers CSV
  shared/      IPC contract: zod schemas + TS types, constants (formats, defaults)
  main/        Electron main process
    index.ts        window, protocol, updater
    ipc/            one handler module per domain (library, analysis, export, media, settings)
    services/       Library (registry of known videos, relink, per-day inspect), Projects (name + ordered
                    videos + per-project selections, preset, archive, `.apexcut` export/import), Jobs
                    (progress/ETA/cancel), Updater (electron-updater → status events), Storage (scan cache
                    size + clean-up), Report (problem-report zip, own store-only zip writer), Media (ffprobe/ffmpeg
                    paths, hardware encoder detection), Thumbnails/Filmstrip, Protocol (apexcut:// with Range)
    actions/        one class per ffmpeg operation: ExtractMetadataAction, CutSegmentAction, ConcatAction,
                    FilmstripAction, ThumbnailAction
    workers/        analysis runs in a worker_thread so the UI never stalls
  preload/     contextBridge → `window.apexcut` (typed, promise-based, plus event subscriptions)
  renderer/    Vue 3 + Pinia + Tailwind v4
    components/{Projects,Shell,Library,Stage,Inspector,Timeline,Base}/
    composables/    useTimelineView, useUndo, useSuggestions, useKeyboard, useFraming
    stores/         projects, library (videos of the open project), editor (segments/selection/undo), jobs, settings
```

## Data flow

0. A project is one movie: a name plus an ordered set of videos. `Projects` keeps the list and which one
   is open; every `library:*` call works on the open project. A video can be in several projects; its
   scan (`clips/<stem>/`) is shared, its selection is per project (`projects/<id>/<stem>.json`).
1. User picks files → main `Library.add` registers MP4/LRF pairs → `Projects.addClips` puts them in the
   open project (an already-scanned video starts from its automatic parts, no rescan) → renderer shows them.
2. `analysis.run(stems)` job: ffmpeg stream-copies the `djmd` track → core parses → IMU → score →
   results written to `<appData>/ApexCut/data/clips/<stem>/{signals.json,highlights.json,clip.json}`.
   Progress events stream to the renderer.
3. Renderer loads `timeline(stem)` (10 Hz signals + selection) and renders. Edits are saved with a
   250 ms debounce via `selection.save`.
4. Export job: `CutSegmentAction` per part (2 in parallel, GPU decode + encode, fallback chain) →
   `ConcatAction` → result path + `latest` in job state. Transitions (per project, default crossfade):
   `cut` joins as is (square stays a lossless copy); `dip` fades each part in/out 0.4 s; `crossfade`
   encodes parts with forced keyframes ½ s from each end, blends tail+head pairs with `XfadeAction`,
   cuts the middles losslessly at those keyframes (`TrimCopyAction`), builds one `acrossfade` audio
   track (`AudioCrossfadeAction`) and muxes. Square with dip/crossfade is re-encoded under the same
   quality rules (10-bit, CQ 18, bitrate cap) — a copy/encode mix cannot be concatenated safely.
   Then, in `finish()`: title/end cards (`CardAction`, ffmpeg gradients + drawtext, encoded like the
   parts, concatenated around the movie) and the music mix (`MusicMixAction`: songs trimmed, faded and
   concatenated, cut at the movie end, laid over the original audio with `amix`; video stream copied).
   Songs are referenced by path and served to the player through `apexcut://media/music/<base64url>`.
   Telemetry overlay: `core/overlay.ts` owns layout, drawing (a minimal 2D-context interface, so it is
   pure and unit-tested) and the `sendcmd` command stream; the renderer draws the same thing live on a
   canvas over the video and, at export, renders three sprites (bike, dial, needle) as PNGs; ffmpeg
   composes them inside each part's encode (`actions/overlay.ts`: `rotate@bike`, `rotate@needle`,
   `drawtext@num`, `drawbox@bar`, all driven per frame from the 30 Hz signals). Ride card:
   `projects:rideStats` sums the project, `analysis:frame` grabs frames of the best parts, the renderer
   draws the PNG (`utils/rideCard.ts`) and `app:saveImage` stores it next to the movies + clipboard.
5. Media: `apexcut://media/<stem>/proxy` streams the LRF with Range support for the `<video>` element;
   filmstrip sprite and thumbnails served the same way.

## Persistence

`%APPDATA%/ApexCut/data/`: `library.json` (every known video: stem, mp4, lrf), `projects.json`
(projects + the open one), `projects/<id>/<stem>.json` (that project's selection of that video),
`clips/<stem>/…` (scan results, filmstrip, thumbnail — shared by projects), `settings.json` (theme, output
folder, last export options). First start after the projects feature moves the old `clips/<stem>/selection.json`
into a project called “My rides”. Output: `<Videos>/ApexCut/{movies,clips}` by default, changeable in Settings.

A project exported from the app is a `.apexcut` JSON file (`projectFileSchema` in `src/shared/ipc.ts`): name,
the videos' paths and the selections — never the videos or the scan. Importing it on a computer that has the
same files re-discovers them next to the recorded paths and scans what has not been scanned there yet.

`APEXCUT_USER_DATA=<folder>` points a run at its own data folder (and single-instance lock) — used for
smoke tests next to a running installed copy.

## Quality gates

`npm run check` = ESLint + Prettier check + `tsc`/`vue-tsc` + Vitest. CI runs it on every push; a `v*`
tag builds and publishes the Windows installer + portable exe + update feed.
