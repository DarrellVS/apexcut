# Changelog

All notable changes to ApexCut. The section of the version being released becomes the GitHub release
notes (and the “What’s new” text in the update banner).

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
