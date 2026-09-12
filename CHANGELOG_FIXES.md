# Fixes log — autonomous UX audit session (2026-09-12)

Everything below is **local and uncommitted** (no `git commit`, no `git push`, as instructed). Start
from `UX_AUDIT_REPORT.md` for the findings; this file says what changed where, and what was verified.

## 1 · Resolved issues, per file

Codes (C1…, M1…, m1…) refer to `UX_AUDIT_REPORT.md`.

| File                                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ipc.ts`                                                   | **C2** `ScanFailure {stem, error}`; the analyze `JobResult` carries `failed?: ScanFailure[]`. Zod schemas untouched.                                                                                                                                                                                                                                                                                                                                                    |
| `src/main/ipc.ts`                                                     | **C2** `analysis:run` scans every video, collects per-video failures, finishes `done` with `failed`; the job fails only when nothing at all could be read. Cancellation still aborts.                                                                                                                                                                                                                                                                                   |
| `src/main/services/library.ts`                                        | **M1** `discover` walks folders three levels deep (`DCIM/100MEDIA`), skipping system folders (`System Volume Information`, `$RECYCLE.BIN`, `MISC`, dot-folders).                                                                                                                                                                                                                                                                                                        |
| `src/renderer/src/utils/errors.ts`                                    | **M4** rules for a video without a DJI track (`no 'djmd' track`), an unreadable file (`Invalid data found`, `moov atom`, `no video stream`), missing music (`no music files`); the ffmpeg rule now matches encoding failures only (`nvenc/qsv/amf/encoder/ffmpeg exit`), so an ffprobe error no longer blames the graphics card.                                                                                                                                        |
| `src/renderer/src/stores/library.ts`                                  | **C2** `scanErrors` (per video, raw text) + `noteScanFailures()`; cleared when a video is scanned.                                                                                                                                                                                                                                                                                                                                                                      |
| `src/renderer/src/App.vue`                                            | **C2** job handler stores failures, one summarising toast, toast on a stopped scan. **C3** window shortcuts step aside for Space/Enter/←/→/Delete coming from a timeline block. **M1** clearer "nothing found" toast (where the files are on a card). **M2** `openClip` of an unscanned video closes the editor state. **M7** panel maxima follow the window (stage ≥ 420 px), double-click on a splitter resets. **m6** Shift+←/→ = 1 s, Home/End. Stage emits `scan`. |
| `src/renderer/src/components/Stage/VideoStage.vue`                    | **M2** an empty source clears the `<video>` (`removeAttribute('src')` + `load()`). **C2** stage notice (not scanned / scan failed with plain-words reason + _Scan now / Scan again_ / not found / no scanned video yet), `data-stage-notice`. **m6** `seek()` updates the clock at once so quick key presses chain correctly.                                                                                                                                           |
| `src/renderer/src/components/Ride/RideRail.vue`                       | **C2** row status `scan failed` (danger) with the friendly reason as tooltip; `data-clip` on rows (tests). **m7** `role="menuitem"` on the row menu items.                                                                                                                                                                                                                                                                                                              |
| `src/renderer/src/components/ScanProgress.vue`                        | **M3** _Stop scanning_ button (generic job cancel).                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/renderer/src/components/Movie/MoviePanel.vue`                    | **C1** empty name → `my-ride`, `maxlength="80"`, `aria-label`, `try/catch` around the export request → friendly toast. **M5** cache raw parts, apply the grade when items are built; grade dropped from the invalidation key. **M6** parts of missing videos skipped + dashed danger note. **m4** head summary truncates. Plural fix ("1 part").                                                                                                                        |
| `src/renderer/src/components/Movie/ColourSection.vue`                 | No broken look thumbnails for an unscanned video (thumb only for a scanned clip, `@error` hides). **m7** dropped the duplicate `aria-pressed` on the look radios.                                                                                                                                                                                                                                                                                                       |
| `src/renderer/src/components/Shell/TopBar.vue`                        | **m5** tooltip on _Make my movie_ ("Pick at least one part first" when disabled).                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/renderer/src/components/Timeline/Timeline.vue`                   | **m3** `text-chip-danger` instead of `text-[#ff8080]`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/renderer/src/components/Timeline/MusicLane.vue`                  | **m3** same.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/renderer/src/assets/main.css`                                    | **m3** token `--chip-danger` → `text-chip-danger`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/renderer/src/composables/usePanelWidth.ts`                       | **M7** `max` may be a function; `reset()`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/renderer/src/shortcuts.ts`                                       | **m6** the two new rows (shown under Settings → Shortcuts).                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/renderer/src/components/Onboarding/TourOverlay.vue`              | **m1** "Movie tab" → "Movie panel".                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/renderer/src/components/Settings/EditingSection.vue`             | **m1** "Movie tab" → "Movie panel"; no "blue line".                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/renderer/src/components/Export/ExportOverlay.vue`                | **m2** no more "the project is locked"; says the movie is made from the parts as they were when the button was pressed.                                                                                                                                                                                                                                                                                                                                                 |
| `docs/design.md`, `docs/architecture.md`, `README.md`, `CHANGELOG.md` | Documented: stage notice, row states, Stop scanning, splitter limits/reset, `--chip-danger`, keyboard rules, per-video scan failures, folder walking, the e2e setup; an _Unreleased_ changelog section.                                                                                                                                                                                                                                                                 |
| `eslint.config.mjs`, `.prettierignore`, `.gitignore`                  | Playwright output (`test-results`, `playwright-report`) ignored — ESLint otherwise hung on the minified report bundle.                                                                                                                                                                                                                                                                                                                                                  |

Not changed on purpose: `src/core/**` (IMU parsing, scoring, grading maths), every zod schema, the
Python oracle. Recommendations m8–m12 in the report are left open.

## 2 · Playwright setup

- `@playwright/test` 1.63.0 installed (dev dependency; Electron needs no browser download).
- `playwright.config.ts`: `testDir: tests`, `**/*.spec.ts`, one worker, 60 s per test, list + HTML
  reporter (`test-results/html`), trace + screenshot on failure.
- `tests/e2e/app.ts`: `launchApp({ args, settings })` → `_electron.launch` on `out/main/index.js` with a
  fresh `APEXCUT_USER_DATA` temp folder (own single-instance lock, own output folder, tour marked as
  seen); `close()` removes it. `status(page, text)` finds a toast.
- `tests/e2e/fixtures.ts`: a plain non-DJI MP4 (bundled ffmpeg), a corrupt `.mp4`, and a real DJI
  recording when one exists (`APEXCUT_E2E_VIDEO`, else the smallest `.LRF` ≥ 15 MB under
  `~/Downloads/dji-examples`); `APEXCUT_E2E_BIG_VIDEO` (`;`-separated) for the stop test. A portable
  DJI fixture is not possible: ffmpeg cannot remux the `djmd` data track into a synthetic MP4.
- Scripts: `test:e2e` = `playwright test` (with `pretest:e2e` = `electron-vite build`), `test:e2e:ui`.
- Specs (19 tests): `tests/smoke.spec.ts` (4), `tests/e2e/projects.spec.ts` (4),
  `tests/e2e/scan-errors.spec.ts` (5), `tests/e2e/editor.spec.ts` (6; 5 need a DJI recording, 1 needs
  the big-video variable — they skip cleanly otherwise).

## 3 · Test and linter results (final runs, 2026-09-12)

```
npm run lint          → exit 0
npm run typecheck     → exit 0 (tsc + vue-tsc)
npm run format:check  → "All matched files use Prettier code style!"
npm run test          → 10 files, 55 tests passed (vitest; core parity fixtures unchanged)
npm run check         → passed
npm run test:e2e      → 19 passed (10.0 s) with APEXCUT_E2E_BIG_VIDEO set to three recordings;
                        without DJI recordings on the machine: 13 pass, 6 skip
```

Visual self-check (screenshots via Playwright, dark and light): the stage notice with _Scan again_
for a failed video, the light editor with a scanned recording, the editor after a full scan of a
3 min ride (3 parts, gauge preview, toast).

## 4 · Second round: m8–m12

Asked for after the first round; the same rules (local only, no commits).

| File                                                                       | Change                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc.ts`             | **m8** `app.relaunch()` over the bridge (`app:relaunch`) → `app.relaunch()` + `app.exit(0)`. **m10** `ProjectInfo.format` / `.framePos`, `projects.setFormat` / `.setFramePos` (zod-checked: `FORMATS`, 0..1).                 |
| `src/renderer/src/components/Base/ErrorScreen.vue`                         | **m8** "Restart ApexCut" calls it instead of `location.reload()`.                                                                                                                                                              |
| `src/renderer/src/composables/useRideCard.ts`                              | **m9** module-level state (`busy`, `result`) so the title bar starts it and the shell shows the outcome; the toast is kept for failures only.                                                                                  |
| `src/renderer/src/components/Ride/RideCardSheet.vue` (new), `App.vue`      | **m9** the result card: the picture, "on your clipboard", the file, _Open folder_, _Done_; closes on a click outside or Escape (`useDismiss`).                                                                                 |
| `src/main/services/projects.ts`                                            | **m10** `ProjectRecord.format` / `.framePos` + setters; both in `info()`.                                                                                                                                                      |
| `src/renderer/src/composables/useFraming.ts` (new)                         | **m10** one place for the format and the crop: project value → app's last choice → `16x9` / `0.5`; `setFramePos(pos, commit)` so a drag writes live and persists once on release.                                              |
| `src/renderer/src/stores/projects.ts`                                      | **m10** optimistic `setFormat` / `setFramePos`.                                                                                                                                                                                |
| `src/renderer/src/components/Movie/MoviePanel.vue`, `Stage/VideoStage.vue` | **m10** both read `useFraming`; the tiles and the crop frame write to the project (the drag used to send an IPC call per mouse move).                                                                                          |
| `src/renderer/src/App.vue`, `utils/format.ts`, `Library/ImportSheet.vue`   | **m11** a drop on the projects screen makes a project per day (`dayLabel` moved to `utils/format.ts` and shared with the import sheet); the drop hint says what will happen; music dropped there explains itself.              |
| `src/renderer/src/components/Settings/ScoringSection.vue`                  | **m12** three groups with an intro, plain-words labels, a number field + slider + one explaining line per knob ending in the technical name, "Try it on this video" (disabled until something changed) and a count of changes. |

Tests added to `tests/e2e/editor.spec.ts`: the format and the crop are stored on the project (read
back through the bridge), the ride-card sheet appears with its picture and closes, and the scoring
page reads as plain words and applies only on demand. m11 cannot be driven by Playwright (a real
Explorer drag is needed for `webUtils.getPathForFile`); it was checked by hand in the running app.

Final runs after this round: `npm run check` passed (55 unit tests), `npm run test:e2e` 22 passed.

## 4 · Done

The audit, every finding (Critical, Major and all Minor, m8–m12 included), the docs and the tests
are complete and saved locally; nothing was committed or pushed. Next steps when you are back: read
`UX_AUDIT_REPORT.md`, run `npm run test:e2e` once yourself, and commit in whatever slices you prefer
(suggested subjects: `fix(ux): scan failures per video, stop scanning, keyboard and export guards`,
`feat(movie): format and crop per project`, `feat(ride): show the ride card that was made`,
`test(e2e): playwright tests for the app`).
