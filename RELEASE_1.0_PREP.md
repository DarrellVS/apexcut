# ApexCut — architecture pass for v1.0.0

Date: 2026-09-12 · Starting point: v0.5.0 (`bd7c62e`) · Everything below is **local and uncommitted**.

The rule for this pass: **nothing the user sees or gets may change**. Not a pixel, not an
interaction, not a number out of the scoring engine, not an ffmpeg argument. What changed is where
the code lives, how much of it there is, and how hard it is to break the next time.

The proof is mechanical rather than a promise: the behaviour was frozen in tests **before** the
first line moved (16 pixel snapshots of the screens, panels and popovers; 43 end-to-end tests that
drive the built app; 69 unit tests including the Python-parity fixtures and, new in this pass, the
ffmpeg argument plan). Every one of them still passes, unchanged, on the refactored tree.

---

## 1 · What changed, per domain

### Main process (`src/main`)

| Before                                                                    | After                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ipc.ts`, 616 lines, every channel of every domain in one file            | `ipc/` — `projects.ts`, `library.ts` (videos + music), `analysis.ts`, `export.ts`, `system.ts`, with `index.ts` wiring them and the media protocol, `services.ts` for the service graph and `helpers.ts` for the dialogs and the naming rules                                                                                |
| the ride-card numbers computed inside an IPC handler                      | `services/rideStats.ts`, a pure function over the projects and the scans                                                                                                                                                                                                                                                     |
| `actions/cut.ts`, 645 lines: quality rules, filter graphs, joins, compile | `actions/cut/` — `types.ts`, `quality.ts` (pure rules: crop, output size, encoder arguments, bitrate cap), `encode.ts` (the cached ffprobe + the machine's encoder), `plan.ts` (**pure**: every ffmpeg argument for one part), `segment.ts` (running it, with the mask and the overlay), `join.ts`, `batch.ts`, `compile.ts` |
| three copies of "send this to every window"                               | `services/windows.ts` → `broadcast(channel, payload)`                                                                                                                                                                                                                                                                        |
| start-up chores inside `app.whenReady()`                                  | `startup.ts`: the command-line flags, the legacy import and the thumbnail backfill                                                                                                                                                                                                                                           |
| eight near-identical project setters                                      | one private `patchActive()`; the public methods stay one line each                                                                                                                                                                                                                                                           |
| dead code                                                                 | removed: `edl.markersCsv`, `protocol.pathJoin`, `jobs.get`, `report.REPORT_CONTENTS` (its promise to the user is now a comment where the zip is built)                                                                                                                                                                       |

`src/main/index.ts` is down to 140 lines and does what its name says: make the window, wire the
services, hand over.

### Core engine (`src/core`)

- **`numeric.ts` is new**: the numpy/pandas behaviour the parity depends on (`interp`, `roll`,
  `nanpercentile`, `nanmedian`, `robustPos`, `robustScale`, `median`, the clamps and the rounding)
  now sits in one place instead of being spread over `score.ts` and `imu.ts`. `score.ts` dropped
  from 399 to 307 lines and reads as what it is: the rules of the scoring.
- **`grade/`**: `looks.ts` (what a grade is, the sliders, the seven looks) and `maths.ts` (matrix,
  tone table, sharpen, vignette, the ffmpeg chain, with the 10-bit pitfalls written down), behind an
  unchanged `@core/grade`.
- **`overlay/`**: `spec.ts` (what an overlay is and where its pieces land), `draw.ts` (the canvas
  subset both the preview and the sprites use), `sendcmd.ts` (the per-frame command stream for
  ffmpeg), behind an unchanged `@core/overlay`.
- **No algorithm was touched.** The parity fixtures against the Python prototype pass byte for byte.

### Renderer (`src/renderer`)

Every monolith is now a shell that composes named pieces:

| Component        | Before | After | Split into                                                                                                                            |
| ---------------- | -----: | ----: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Timeline.vue`   |    619 |   280 | `TimelineRuler`, `ScoreLane`, `PartBlock`, `PartToolbar`, `TimelineLegend` + `useEdgeSnap`, `useCanvasPainter`                        |
| `VideoStage.vue` |    547 |   174 | `StageNotice`, `FramingWindow`, `OverlayGauge`, `StageTransport` + `useVideoTransport`, `useStageBox`, `useMusicSync`, `useLiveGrade` |
| `App.vue`        |    467 |   224 | `PanelSplitter` + `useImport`, `useEditorShortcuts`, `useScanLifecycle`                                                               |
| `MoviePanel.vue` |    456 |   148 | `FormatSection`, `OverlaySection`, `ExportResultCard` + `useMovieExport`                                                              |
| `RideRail.vue`   |    400 |   131 | `RideNumbers`, `ClipRow`, `ClipParts`                                                                                                 |
| `MusicLane.vue`  |    305 |   148 | `MusicMixHeader`, `MusicToolbar` + `useMusicTracks`                                                                                   |
| `TopBar.vue`     |    295 |   110 | `ProjectMenu`, `ActivePartLabel`, `MakeMovieButton`                                                                                   |
| `ColourSection`  |    270 |   100 | `LookTiles`, `GradeSliders`, `GradeDonor`, `GradeCopy`                                                                                |
| `ScoringSection` |    255 |   103 | the knob table moved to `settings/scoringFields.ts` (data, not markup)                                                                |

Duplication that is gone:

- **Dragging**: five hand-rolled `mousemove`/`mouseup` dances (panel splitter, playhead scrub, part
  edge, crop frame, music trim) are one `startDrag({ start, move, end, cursor })`, which cannot leak
  a listener and restores the cursor itself.
- **Popovers**: seven copies of "open ref + root ref + `useDismiss`" are one `usePopover()`.
- **Canvases**: the ruler, the score lane, the filmstrip and the gauge share `useCanvasPainter`,
  which sizes for the device pixel ratio and redraws on resize, on a theme change and on new data —
  and disconnects its observers (the old theme observer never did).
- **Media URLs**: `thumbUrl()` / `musicUrl()` / `hideBrokenImage()` in `utils/media.ts` instead of
  three hand-written `apexcut://media/clip/…` strings and three inline error handlers.
- **The movie's parts**: the Movie panel had its own copy of the cache in `useRideParts`; it now
  uses the composable (and `ride.ready()` before an export).
- Dead code removed: `fmtElapsed`, `editor.deletedAuto` / `editor.restore`, `useRideParts.invalidate`,
  `useTimelineView.zoomAt` / `pan`, the unused `.row` CSS utility.

### Shared contract (`src/shared`)

`ipc.ts` (445 lines) became `ipc/`: `movie.ts` (formats, crops, transition lengths), `dto.ts` (the
plain objects), `schemas.ts` (zod for everything the renderer sends), `api.ts` (the calls), behind an
unchanged `@shared/ipc`. `XFADE_S` and `DIP_S` live there now, so the Movie panel's length
prediction and the exporter cannot drift apart — the panel used to declare its own copy.

### Configuration and tooling

- `tsconfig.node.json` / `tsconfig.web.json`: `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride` on top of `strict`.
- ESLint: `@typescript-eslint/no-explicit-any`, `explicit-function-return-type`, `no-console`
  (the renderer logger and the CLI scripts are the two sanctioned exceptions), `eqeqeq`,
  `object-shorthand`, `prefer-const`; Playwright output ignored by ESLint and Prettier.
- `vitest.config.ts`: `@main` alias and `src/main/**` in the coverage set, so the export can be
  unit-tested at all.
- `package.json`: `check:pre-release` = `check` + `test:e2e`, and `build:win` depends on it.

---

## 2 · CI and the end-to-end tests

**The Playwright tests never run in CI.** They start a real Electron window, decode video and call
ffmpeg; on a hosted runner that is slow, flaky and expensive in minutes.

- `.github/workflows/ci.yml` runs lint, format, typecheck, the unit tests and a build — with a
  comment saying why the end-to-end tests are not there and where they run instead.
- `.github/workflows/release.yml` runs `npm run check` (the same four) before building installers.
- `playwright.config.ts` **refuses to start** when `CI` is set, unless someone deliberately sets
  `APEXCUT_ALLOW_CI_E2E=1`. A workflow that adds them by accident fails loudly instead of burning
  minutes quietly.
- Locally they are mandatory before a release: `npm run check:pre-release`, which `npm run build:win`
  depends on, so no installer can be built from a tree whose tests fail.

---

## 3 · Proof: the runs behind this document

Final runs on this machine, after the last refactor:

```
npm run lint          → clean
npm run typecheck     → clean (tsc + vue-tsc, with the stricter flags above)
npm run format:check  → "All matched files use Prettier code style!"
npm test              → 10 files, 69 tests passed
npm run test:e2e      → 43 passed (8 specs)
npm run check:pre-release → all of the above in one go, green
```

What those 69 unit tests cover: the DJI parsing and IMU maths, the scoring against the Python
fixtures (`tests/core/parity.test.ts`), pulls, selection, presets, statistics, the colour maths, and
— new in this pass — `tests/main/cutPlan.test.ts`, which freezes the ffmpeg arguments: the stream
copy for a plain square part, the crop of each format and how it slides, 10-bit on every encoder,
the bitrate cap, the filter order (crop → colours → fade), the keyframes a crossfade forces, and
where the dark-edges mask and the telemetry overlay attach.

What the 43 end-to-end tests cover: start-up, the projects screen and settings, unreadable and
corrupt videos, a memory-card folder tree, the scan and stopping it, the editor (parts, keyboard,
panels, framing per project, the ride card, the scoring page), the colours (looks, sliders, a part
with its own), the telemetry overlay, **a real ffmpeg export written to disk and probed**, and the
16 pixel snapshots. The snapshots are the visual freeze: they were taken before the refactor and are
byte-identical after it.

Reproducing them needs a DJI recording on the machine; the suite looks in `~/Videos/DJI-RAW` (or
`APEXCUT_E2E_VIDEO`) and skips those tests cleanly when there is none.

---

## 4 · What was deliberately left alone

- **The scoring, the IMU maths and the colour maths.** Parity with the Python oracle is the
  contract; a cleaner-looking formula is not worth a changed number.
- **The ffmpeg arguments.** Same list, same order, same fallbacks — now built by a pure function and
  pinned by tests.
- **Two latent issues found while reading, left as they are because fixing them changes behaviour:**
  the probe cache in `actions/cut/encode.ts` is never cleared (a relinked file keeps the old probe
  for the life of the process), and `services/analysis.ts` writes `null` into arrays typed
  `number[]` when a sample is NaN. Both belong in a normal fix, with their own test.
- **No commits, no pushes.** The tree is dirty on purpose; `git status` shows the whole pass.

---

## 5 · Ready for v1.0.0

The gate to run before tagging:

```bash
npm run check:pre-release
```

Then the usual release: bump, changelog section, tag, push. `npm run build:win` runs the same gate
again, so an installer can only come from a green tree.
