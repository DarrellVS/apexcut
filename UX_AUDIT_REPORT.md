# ApexCut — UX audit (multi-persona, code + end-to-end)

Date: 2026-09-12 · Version audited: 0.4.18 (commit `ac2ae1a`) · Auditor: autonomous session
(Principal UX / E2E / full-stack), user away.

Method: full read of `src/renderer` (Vue 3 + Pinia + Slab design system), `src/main` (IPC, jobs,
ffmpeg), `src/shared/ipc.ts` (zod contract), `docs/design.md`; Playwright driving the built Electron
app (`npm run test:e2e`) with a fresh data folder per test; synthetic edge-case files (a plain
non-DJI MP4, a 4 kB random `.mp4`) and, when present on the machine, a small real DJI LRF.

Severity: **Critical** = data loss, crash-like screen or a dead end · **Major** = the persona fails
or is misled · **Minor** = friction, copy, polish. Every item has an action; the ones marked ✅ were
fixed locally in this session (see `CHANGELOG_FIXES.md`).

---

## Personas

1. **Track-day rider (power user)** — wants exact trims, telemetry numbers, keyboard speed.
2. **Sunday tourer (non-technical)** — one-click; panics at words like "quaternion"; uses the
   whole memory card.
3. **Social-media creator** — 9:16 first, ride card for Instagram, fast turnaround.
4. **UI ergonomics inspector** — panels, title bar, menus, popovers, overload.
5. **Edge-case tester** — missing IMU data, corrupt files, ffmpeg failures, cancellation.

---

## Critical

### C1 · Empty movie name shows the full-screen error card ✅

- **Who**: everyone. **Where**: `Movie/MoviePanel.vue` (`go()`), `shared/ipc.ts`
  (`exportRequestSchema.name: min(1)`).
- **What**: clear the name field and press _Make my movie_: zod rejects the request in main, the
  renderer's promise rejects unhandled, and `main.ts` turns that into the fatal
  "Something went wrong" card with a stack trace. The field has no `maxlength` either (limit is 80).
- **Action**: fall back to `my-ride`, `maxlength="80"`, catch errors from `exporter.start` and show
  the friendly toast instead of the fatal card.

### C2 · One unreadable video aborts the whole scan and leaves a silent, empty editor ✅

- **Who**: Sunday tourer, edge-case tester. **Where**: `main/ipc.ts` (`analysis:run`), `App.vue`
  (job handler), `Ride/RideRail.vue`, `Stage/VideoStage.vue`.
- **What**: the scan job runs the videos in sequence and throws on the first failure, so the
  remaining videos are never scanned. The only feedback is an 8 s toast; afterwards the editor shows
  a black stage with `0:00 / 0:00`, an empty timeline and rows that just say "not scanned". Nothing
  says which video failed or why, or what to do.
- **Action**: scan every video, collect failures per video, finish the job as _done_ with a
  `failed` list; remember the failure per video in the renderer; the rail row says
  "scan failed" with the friendly reason as tooltip; the stage shows a message for a video that is
  not scanned / failed / missing, with a _Scan now_ button; one toast summarises.

### C3 · Keyboard on a timeline block fires twice ✅

- **Who**: track-day rider, accessibility. **Where**: `App.vue` (`onKey`) and
  `Timeline/Timeline.vue` (`blockKey`).
- **What**: a focused block handles Space (toggle in/out), Enter (play), ←/→ (neighbour), Delete.
  The same keydown then bubbles to the window handler: Space also toggles playback, ←/→ also seek
  ±5 s, Delete deletes again (an empty mutation = an extra undo step + a second toast).
- **Action**: the window handler ignores those keys when the event comes from a block.

---

## Major

### M1 · "Whole memory card…" finds nothing on a real card ✅

- **Who**: Sunday tourer. **Where**: `main/services/library.ts` (`discover`), `App.vue`
  (`importPaths`).
- **What**: the camera writes to `DCIM/100MEDIA/`; `discover` reads one folder level only, so
  picking the card root (what the button suggests) yields "No DJI videos found in what you picked".
- **Action**: walk sub-folders (depth 3, skipping system folders); the toast explains where to look.

### M2 · Clicking an unscanned video row keeps another video on the stage ✅

- **Who**: everyone. **Where**: `App.vue` (`openClip`), `Stage/VideoStage.vue`.
- **What**: the row highlights, but `openClip` returns early for an unscanned clip, so the previous
  video keeps playing and its parts stay on the timeline. The rail says one thing, the rest another.
- **Action**: close the editor state and clear the video element; show the stage message (C2).

### M3 · A scan cannot be stopped ✅

- **Who**: everyone with a full card. **Where**: `ScanProgress.vue`.
- **What**: jobs are cancellable (`AbortController`), but the full-screen scan has no Stop. Twenty
  videos = several minutes with no way out except quitting.
- **Action**: a _Stop scanning_ button; remaining videos can be scanned later from their menu.

### M4 · Friendly errors miss the most common failures ✅

- **Who**: Sunday tourer, edge-case tester. **Where**: `renderer/utils/errors.ts`.
- **What**: a non-DJI video fails with `no 'djmd' track in …`, a corrupt or half-copied file with
  `moov atom not found … Invalid data found when processing input`; neither rule matches, so the
  user reads "Something went wrong". Worse: an ffprobe failure can match the `ffmpeg` rule and
  advise updating the graphics driver. A missing song fails with `no music files` → generic.
- **Action**: rules for no DJI track, unreadable file, missing music; ffmpeg rule limited to
  encoding.

### M5 · Live colour sliders reload every other video over IPC on each pixel ✅

- **Who**: performance / everyone with several videos. **Where**: `Movie/MoviePanel.vue`.
- **What**: the cache of the other videos' parts is invalidated by a watch on
  `JSON.stringify(projects.active.grade)`; sliders write the grade live (`apply(next, false)`), so
  every `input` event drops the cache and re-requests every timeline.
- **Action**: cache raw parts; apply the grade when the export items are built.

### M6 · Missing video files break the export half-way ✅

- **Who**: everyone whose card is unplugged. **Where**: `Movie/MoviePanel.vue`.
- **What**: parts of videos marked "not found" are still in the export list; ffmpeg fails after the
  earlier parts were rendered.
- **Action**: skip those parts and say so in the panel ("2 videos not found · their parts are
  skipped · Find them from the Ride panel").

### M7 · Side panels can squash the stage to a sliver ✅

- **Who**: ergonomics inspector. **Where**: `composables/usePanelWidth.ts`, `App.vue`.
- **What**: both panels clamp to 520 px independently; at the 1100 px minimum window the stage is
  left with 58 px. There is no gesture to reset a width.
- **Action**: the maximum follows the window and the other panel (stage ≥ 420 px); double-click a
  splitter to reset.

---

## Minor

- **m1 · Stale copy** ✅ — tour step 3 and Settings → Timeline say "Movie tab"; there are no tabs
  since layout v2. The snapping hint promises "a thin blue line"; Slab's guide is neutral.
- **m2 · False lock claim** ✅ — the export overlay says "the project is locked until this is
  done". It is not; editing continues and the export uses the snapshot it was started with.
- **m3 · Hex in components** ✅ — `text-[#ff8080]` on the chip Delete/Remove buttons
  (`Timeline.vue`, `MusicLane.vue`) breaks the tokens-only rule. Add a `chip-danger` token.
- **m4 · Movie head overflow** ✅ — the summary in the Movie panel head has no `truncate`; at
  240 px it runs under the splitter.
- **m5 · Disabled primary without a reason** ✅ — _Make my movie_ is disabled with no tooltip.
- **m6 · Seek granularity (power user)** ✅ — no fine seek; add Shift+←/→ = 1 s and Home/End,
  listed in Settings → Shortcuts.
- **m7 · ARIA nits** ✅ — rail row menu is `role="menu"` without `menuitem`s; look tiles carry both
  `aria-pressed` and `aria-checked` (one is enough for a radio).
- **m8 · "Restart ApexCut" reloaded the renderer only** ✅ — a main-process fatal survived it.
  Fixed: `app:relaunch` → `app.relaunch()` + `app.exit(0)` in main.
- **m9 · Ride card result had no _Open folder_** ✅ — an 8 s toast named the file and scrolled away.
  Fixed: a result card with the picture itself, the file, _Open folder_ and _Done_.
- **m10 · Format was a global setting** ✅ — `lastFormat` was app-wide, so a creator alternating a
  16:9 and a 9:16 project re-picked every time, and the crop dragged for one ride moved the other.
  Fixed: `format` and `framePos` live on the project; the app's last choice is only the starting
  point for a project that was never framed.
- **m11 · Drop on the Projects screen did nothing** ✅ — silently. Fixed: it makes a project per
  riding day, named after it, and opens the first; music dropped there says to open a project first.
- **m12 · Advanced scoring labels** ✅ — "threshold", "smoothing", "°/s" with no explanation. Fixed:
  three named groups, plain-words labels, one explaining line per knob that ends with the technical
  name, and nothing applies until _Try it on this video_.

---

## What already works well (keep)

- One project = one ride = one movie is legible in one look; the rail outline and the movie panel
  are the whole model.
- Plain words everywhere the tourer looks ("Corners", "Leave out", "Make my movie"); jargon stays
  under Advanced.
- The 9:16 workflow is two clicks (tile, drag the frame) with the gauge previewed inside the crop.
- Every popover closes the same way (`useDismiss`); focus is trapped and returned in Settings.
- Errors keep the raw text under _Details_ and offer _Report a problem_; originals are never
  written.
- Undo covers every mutation, including re-scoring.

## Still open

Nothing from this audit. Ideas that came up while fixing it, not part of the findings: a per-project
default name for the movie file, and a "reveal in folder" for the EDL export.

## Test coverage added

19 Playwright tests: `tests/smoke.spec.ts` (start, window, empty project, bridge, no renderer
errors), `tests/e2e/projects.spec.ts` (projects screen, create/open, duplicate names, search,
settings modal, theme, every settings section, archive), `tests/e2e/scan-errors.spec.ts` (non-DJI
file and corrupt file: friendly reason, rail status, stage message; one bad video among good ones;
a memory-card folder tree), `tests/e2e/editor.spec.ts` (with a real DJI recording: scan → parts,
project menu, keyboard on a block, fine seek, splitter clamp and reset, movie name fallback, stop
scanning, format and crop per project, the ride-card sheet, the scoring wording). Final run:
22 passed.
