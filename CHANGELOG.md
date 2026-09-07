# Changelog

All notable changes to ApexCut. The section of the version being released becomes the GitHub release
notes (and the “What’s new” text in the update banner).

## 0.4.6

- New app icon: a twisty road with the camera lens at the end, in the brand gradient.
- Ride card: both sizes lay out properly — thumbnails fill the space, tiles are capped, numbers are
  centred; nothing overlaps the footer any more.

## 0.4.5

- Exporting now takes over the window: a card with the percentage, the step and the time left. Closing
  it asks first and then stops the export, so the project cannot change while a movie is being made.
  The same card shows the result with Watch it / Open folder.

## 0.4.4

- Part counts in the video list, the top bar and the Movie tab now follow every edit at once (they
  could lag behind until a rescan).
- Ride card: the big numbers shrink to fit their tile; in the app the Ride card button sits under its
  text instead of squeezed beside it.

## 0.4.3

- The video list shows the number of parts in the movie (“6 parts”) instead of “1/3 parts”.

## 0.4.2

- The telemetry overlay no longer prints a label (“Joined”, “Corners”) under the gauge — just the
  meter and the angle.

## 0.4.1

- Removed: the target-length picker (“How long should it be?”). Stars and the Parts list stay the way
  to shape the movie.

## 0.4.0 — Telemetry

- **Riding data on the picture**: a lean gauge on the exported movie — “Lean angle” (a leaning bike
  with the angle) or “Dashboard” (dial with needle plus a braking / acceleration bar). Pick the corner
  and the size; it shows live on the video while you edit and is drawn at full resolution on export.
- **Ride card**: one click makes a picture with the numbers of the ride (sharpest lean, hardest braking,
  corners, riding time) and its three best moments — portrait for Instagram, wide for chats. Saved next
  to your movies and copied to the clipboard.

## 0.3.0 — Better movies

- **Transitions** between parts: crossfade (default), cut or dip to black, per project.
- **Title card and end card**: the project name with the date and the numbers of the ride, and a
  “Made with ApexCut” card, in the movie's own format and quality.
- **Music lane**: drop songs under the movie. They play back to back; trim each, set its volume and
  fades, and choose how much of the ride sound stays. Preview plays the music in sync.
- **Stars**: mark favourite parts (F); export only the starred ones.
- **Keyboard trimming**: J/K/L, frame steps with , and ., I/O set the edges of the selected part,
  Shift+I/O trim to where the action really is. Full list under Settings → Shortcuts or `?`.
- **Snapping** while dragging edges (Settings → Editing, off by default; hold Alt to invert).
- Fixed: changing one setting (for example the theme) reset the others and brought the quick tour back.

## 0.2.0 — Trust

- **Projects**: one project per ride, each with its own videos and picks. A video can be in several
  projects without a second scan. Export a project as a `.apexcut` file and import it elsewhere.
- **Projects screen** with search, sort and an Archived section.
- **Settings** moved to a full-window panel (gear in the top bar or `Ctrl+,`): appearance, output folder,
  storage, quick tour, updates & about, and the advanced scoring sliders.
- **Find moved videos**: when a memory card or folder moved, point ApexCut at the new place — per video or
  for a whole folder — and every part stays.
- **Sensitivity presets** Relaxed / Sporty / Track per project.
- **Several days in one pick**: ApexCut offers one project per day.
- **Update banner** with release notes and a Restart to update button; Check for updates in Settings.
- **Storage**: see how much the scan cache takes and clean up scans no project uses.
- **Friendly errors**: plain-language error card and export errors, with a Report a problem zip.
- **Quick tour** after the first scan (three steps), replayable from Settings.
- Keyboard and screen-reader improvements: focus rings, focusable timeline blocks, labelled buttons,
  reduced-motion support.
- Scanning runs in a worker thread, so the app stays responsive while several videos are scanned.

## 0.1.0

- First release: scan DJI Osmo Action recordings for corners, braking and acceleration, edit the parts
  on a timeline, export a movie at full quality (square, 16:9, 4:3 or 9:16).
