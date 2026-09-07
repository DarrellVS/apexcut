# CLAUDE.md — working agreements for ApexCut

Read this first. Then `docs/architecture.md` for structure and `docs/design.md` before touching UI.

## What this is

Electron + Vue 3 + TypeScript desktop app that finds highlights (corners, braking, acceleration) in
DJI Osmo Action motorcycle helmet-cam footage using the embedded 30 Hz IMU metadata, and exports a
movie. Port of the Python prototype in `C:\Users\darre\dji-highlights` (the parity oracle — do not
modify it).

## Hard rules

- **UI language is English.** Plain words for riders, no tech jargon in the UI ("via GPU", "keyframe",
  "NVENC", "EDL" only under Settings). Reason keys stored on disk stay as they are
  (`bochten`, `accel/rem`, `beide`, `handmatig`, `samengeplakt`) for compatibility; map to labels in the UI.
- **Never downscale exports.** Formats crop the 3840×3840 source at full resolution; 10-bit stays 10-bit;
  bitrate cap ≈ source bitrate scaled by kept pixels. Square = stream copy (lossless).
- **Originals are read-only.** Only ffmpeg stream copy / read access; outputs go to the user's output folder.
- **Scoring parity.** `src/core` must reproduce the Python results on `tests/fixtures` within tolerance.
  Change scoring only with a matching fixture update and a note in `docs/scoring.md`.
- **Floating UI never wraps.** Toolbar/popover/menu stay on one line and shift left/right to stay inside
  their container.
- No emojis in the timeline. Phosphor icons only.

## Structure (short)

`src/core` pure TS (no Node/DOM) — parsing, IMU maths, scoring, selection, EDL. Unit-tested.
`src/main` Electron main — ffmpeg/ffprobe, jobs, library persistence, media protocol, dialogs.
`src/preload` typed bridge `window.apexcut`. `src/renderer` Vue app (Pinia setup stores, Tailwind v4).
`src/shared` IPC contract (zod schemas + types) used by main, preload and renderer.

## Conventions

- `<script setup lang="ts">` first, then `<template>`; Tailwind utilities, no `<style>` blocks;
  design tokens only (no hex in components).
- Stores `useXStore` in `stores/`, composables `useX` in `composables/`, one component per file, PascalCase.
- Main: one class per ffmpeg operation (`XAction.execute(input)`), long work runs as a job with progress,
  never awaited inside an IPC handler.
- Logging via `electron-log` (main) and `@renderer/utils/logger` (renderer); no bare `console`.
- Conventional Commits, enforced by commitlint. `npm run check` must pass before a commit.
- Docs live next to the code they describe; update them in the same change.
