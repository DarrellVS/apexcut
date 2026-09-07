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
    services/       Library (JSON persistence in app data), Jobs (progress/ETA/cancel), Media (ffprobe/ffmpeg
                    paths, hardware encoder detection), Thumbnails/Filmstrip, Protocol (apexcut:// with Range)
    actions/        one class per ffmpeg operation: ExtractMetadataAction, CutSegmentAction, ConcatAction,
                    FilmstripAction, ThumbnailAction
    workers/        analysis runs in a worker_thread so the UI never stalls
  preload/     contextBridge → `window.apexcut` (typed, promise-based, plus event subscriptions)
  renderer/    Vue 3 + Pinia + Tailwind v4
    components/{Shell,Library,Stage,Inspector,Timeline,Base}/
    composables/    useTimelineView, useUndo, useSuggestions, useKeyboard, useFraming
    stores/         library, editor (segments/selection/undo), jobs, settings
```

## Data flow

1. User picks files → main `Library.add` finds MP4/LRF pairs → renderer shows them.
2. `analysis.run(stems)` job: ffmpeg stream-copies the `djmd` track → core parses → IMU → score →
   results written to `<appData>/apexcut/clips/<stem>/{signals.json,highlights.json,selection.json,clip.json}`.
   Progress events stream to the renderer.
3. Renderer loads `timeline(stem)` (10 Hz signals + selection) and renders. Edits are saved with a
   250 ms debounce via `selection.save`.
4. Export job: `CutSegmentAction` per part (2 in parallel, GPU decode + encode, fallback chain) →
   `ConcatAction` → result path + `latest` in job state.
5. Media: `apexcut://media/<stem>/proxy` streams the LRF with Range support for the `<video>` element;
   filmstrip sprite and thumbnails served the same way.

## Persistence

`%APPDATA%/apexcut/library.json` (clips: stem, mp4, lrf), `clips/<stem>/…` (analysis + selection),
`settings.json` (theme, output folder, last export options). Output: `<Videos>/ApexCut/{movies,clips}` by
default, changeable in Settings.

## Quality gates

`npm run check` = ESLint + Prettier check + `tsc`/`vue-tsc` + Vitest. CI runs it on every push; a `v*`
tag builds and publishes the Windows installer + portable exe + update feed.
