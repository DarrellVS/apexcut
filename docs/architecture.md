# Architecture

Single npm package, electron-vite (three Vite builds: main, preload, renderer), electron-builder.

```
src/
  core/        pure TypeScript, no Node/DOM imports — unit-tested, parity-tested against the Python oracle
               numeric.ts is the numpy/pandas toolbox the parity depends on; grade/ and overlay/ are
               folders (vocabulary vs maths, spec vs drawing vs the ffmpeg command stream)
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
    workers/        analysis runs in a worker_thread so the UI never stalls (the whole out/main is
                    asarUnpack'ed: the worker requires ../chunks/* with plain Node resolution;
                    scripts/check-package.mjs guards this in the release build)
  preload/     contextBridge → `window.apexcut` (typed, promise-based, plus event subscriptions)
  renderer/    Vue 3 + Pinia + Tailwind v4
    components/{Projects,Shell,Ride,Stage,Movie,Timeline,Library,Base}/
    composables/    useTimelineView, useUndo, useSuggestions, useKeyboard, useFraming
    stores/         projects, library (videos of the open project), editor (segments/selection/undo), jobs, settings
```

## Data flow

0. A project is one movie: a name, an ordered set of videos, and how that movie is made — transition,
   music, colours, telemetry overlay, **format and crop position** (`format` / `framePos`, absent =
   the app's last choice in `settings.lastFormat` / `lastFramePos`, which is only a starting point),
   whether the sound is evened out (`loudness`) and, when the rider dragged the parts around, the
   order the movie plays in (`order`: `"<stem>:<part id>"` keys; empty = the order they were ridden
   in). `Projects` keeps the list and which one
   is open; every `library:*` call works on the open project. A video can be in several projects; its
   scan (`clips/<stem>/`) is shared, its selection is per project (`projects/<id>/<stem>.json`).
1. User picks files → main `Library.add` registers video + proxy pairs (a DJI `.LRF` has the same
   name as its MP4, a GoPro `GL011234.LRV` belongs to `GX011234.MP4`) (folders are walked three levels
   deep, so the root of a memory card finds `DCIM/100MEDIA/*`) → `Projects.addClips` puts them in the
   open project (an already-scanned video starts from its automatic parts, no rescan) → renderer shows them.
2. `analysis.run(stems)` job: ffprobe says which motion track the file has — `djmd` (DJI) or `gpmd`
   (GoPro) — ffmpeg stream-copies it → core parses (`core/dji` hands over an attitude; `core/gopro`
   parses GPMF and fuses accelerometer + gyroscope into one at 30 Hz, see `docs/gopro-metadata.md`)
   → IMU → score →
   results written to `<appData>/ApexCut/data/clips/<stem>/{signals.json,highlights.json,clip.json}`.
   Progress events stream to the renderer. A video that cannot be read (no DJI track, damaged file)
   does not stop the others: the job finishes as `done` with a `failed: [{stem, error}]` list, the
   renderer keeps the reason per video (`library.scanErrors`) for the rail row and the stage notice;
   only when nothing at all could be read does the job itself fail. The scan can be stopped from
   the progress screen (the generic job cancel).
3. Renderer loads `timeline(stem)` (10 Hz signals + selection) and renders. Edits are saved with a
   250 ms debounce via `selection.save`.
4. Export job: `CutSegmentAction` per part (2 in parallel, GPU decode + encode, fallback chain) →
   `ConcatAction` → result path + `latest` in job state. Transitions (per project, default crossfade):
   `cut` joins as is (square stays a lossless copy); `dip` fades each part in/out 0.4 s; `crossfade`
   encodes parts with forced keyframes ½ s from each end, blends tail+head pairs with `XfadeAction`,
   cuts the middles losslessly at those keyframes (`TrimCopyAction`), builds one `acrossfade` audio
   track (`AudioCrossfadeAction`) and muxes. Square with dip/crossfade is re-encoded under the same
   quality rules (10-bit, CQ 18, bitrate cap) — a copy/encode mix cannot be concatenated safely.
   Colours (`core/grade.ts`): one set of maths for both sides. The renderer builds an SVG filter
   (`utils/gradeSvg.ts`: gains → contrast → saturate → tone-curve table → sharpen) for the live
   picture; the export puts `ffmpegGrade()` into the part's filter chain after the crop and before the
   fade — `colorchannelmixer` (gains + saturation as one matrix), `colorlevels` (contrast),
   `curves` fed the same 33 sampled points, `unsharp`; all keep 10-bit RGB (`eq`, `vignette` and
   8-bit `curves` paths are avoided). Dark edges are a PNG mask (`VignetteMaskAction`, one ffmpeg
   `geq` frame per size and strength) overlaid before the telemetry overlay. Any grade forces an
   encode.
   A vertical movie can let its crop window follow the corners (`follow` on the project, opt-in, 9:16
   only, `core/framing/follow.ts`): the yaw rate says how hard and which way the bike is turning
   (positive = right, checked against recordings), a deadband of 12°/s keeps steering corrections and
   shoulder checks still, 45°/s uses the whole travel (60 % of the room towards that edge), and a
   1 s smoother plus a speed limit of a quarter of the room per second make it a pan. The path is
   walked over the whole recording once and sampled per part at the export frame rate; main writes
   one `sendcmd` line per change and the crop becomes `crop@follow`, so the window moves during the
   encode. The stage draws the same path live (`composables/useFollowFrame.ts`), so what the rider
   frames is what the movie does.
   Then, in `finish()`: the music mix (`MusicMixAction`: songs trimmed, faded and concatenated, cut at
   the movie end, laid over the original audio with `amix`; video stream copied).
   Songs are referenced by path and served to the player through `apexcut://media/music/<base64url>`.
   Telemetry overlay: `core/overlay.ts` owns layout, drawing (a minimal 2D-context interface, so it is
   pure and unit-tested) and the `sendcmd` command stream; the renderer draws the same thing live on a
   canvas over the video and, at export, renders three sprites (bike, dial, needle) as PNGs; ffmpeg
   composes them inside each part's encode (`actions/overlay.ts`: `rotate@bike`, `rotate@needle`,
   `drawtext@num`, `drawbox@bar`, all driven per frame from the 30 Hz signals). Ride card:
   `projects:rideStats` sums the project, `analysis:frame` grabs frames of the best parts, the renderer
   draws the PNG (`utils/rideCard.ts`) and `app:saveImage` stores it next to the movies + clipboard.
   4b. Sharing a movie with a phone (`services/share.ts`): a plain HTTP server on an ephemeral port,
   bound to the machine's own network address, serving exactly one file behind a 32-character random
   path — `/<token>` a small page with a `<video>` and a save link, `/<token>/video` the file itself
   with Range support (phones ask for pieces). Only files under the app's own output folders may be
   shared (`share:start` refuses anything else), one share at a time, and it closes itself after 30
   minutes, on `share:stop`, or when the app quits. Windows asks once for permission to accept
   connections; nothing leaves the local network.
5. Media: `apexcut://media/<stem>/proxy` streams the LRF with Range support for the `<video>` element;
   filmstrip sprite and thumbnails served the same way.

### The picture vote

`projects:setPicture` runs a job (kind `picture`, so the editor does not switch to the scanning
screen) that looks at every scanned video of the project once — `PictureStatsAction`, one ffmpeg
pass over the proxy — writes `clips/<stem>/picture.json`, then rescores every video with
`picture_weight`. See `docs/scoring.md`.

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

The error card's "Restart ApexCut" sends `app:relaunch`, and main does `app.relaunch()` + `app.exit(0)`:
a reload would bring back only the renderer, while the fatal error is often in the main process.

## Quality gates

`npm run check` = ESLint + Prettier check + `tsc`/`vue-tsc` + Vitest. CI runs it on every push; a `v*`
tag builds and publishes the Windows installer + portable exe + update feed.

The end-to-end tests are the gate for a release, not for CI: `npm run check:pre-release` =
`npm run check` + `npm run test:e2e`, and `npm run build:win` depends on it, so an installer cannot
be built from a tree whose Playwright tests fail. `playwright.config.ts` refuses to run when `CI` is
set (a human who really means it can set `APEXCUT_ALLOW_CI_E2E=1`).

`npm run test:e2e` = `electron-vite build`, then Playwright drives the built app
(`playwright.config.ts`, `tests/**/*.spec.ts`; `_electron.launch` on `out/main/index.js`). Every test
gets a throw-away data folder with its own output folder (`tests/e2e/app.ts`), so runs never touch
the real library and do not collide with a running ApexCut. `tests/e2e/fixtures.ts` makes a plain
non-DJI MP4 and a corrupt file with the bundled ffmpeg; tests that need a real recording take
`APEXCUT_E2E_VIDEO` (or a small `.LRF` under `~/Downloads/dji-examples`) and skip without one;
`APEXCUT_E2E_BIG_VIDEO` (one or more large recordings, `;`-separated) enables the "stop scanning" test. Specs: `tests/smoke.spec.ts` (start-up),
`tests/e2e/projects.spec.ts` (projects screen, settings), `tests/e2e/scan-errors.spec.ts` (unreadable
videos, memory-card folders), `tests/e2e/editor.spec.ts` (scan → parts, keyboard, panels, export
name).

## Renderer → main calls

The renderer never calls `window.apexcut` directly (lint rule); it imports `api` from
`src/renderer/src/api.ts`, which wraps every bridge function and copies its arguments to plain data
(`src/shared/plain.ts`). Vue reactive proxies cannot cross the contextBridge (“An object could not be
cloned”); store state or computed results holding store arrays reached the bridge three times before
this wrapper existed.
