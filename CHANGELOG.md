# Changelog

All notable changes to ApexCut. The section of the version being released becomes the GitHub release
notes (and the “What’s new” text in the update banner).

## 0.4.18

- **Colours.** The Movie panel has a Colour section: seven looks previewed on your own footage
  (Moody, Punchy, Sunny, Golden hour, Film, Black & white), nine fine-tune sliders (brightness,
  contrast, highlights, shadows, colour, warmth, tint, dark edges, sharpen), live on the video as you
  drag, and in the export at full quality (10-bit stays 10-bit). Copy the colours to another movie in
  one click; a movie without colours offers to take a sibling's. Select one part and tick “Own colours
  for this part” to grade that part on its own, starting from the movie's; such parts carry a small
  mark on the timeline.

## 0.4.17

- New layout: the left panel is the **Ride** — the numbers of the open video and an outline of every
  video with its parts underneath. Click a part
  of any video to open it and go there. Video actions moved into the row’s menu; “How picky?” is a
  popover in the rail’s head. The right panel is the **Movie**, always visible — no more Parts /
  Movie / This video tabs. “Make ride card” moved to the project menu in the title bar.
- Every menu and popover now closes on a click outside or Escape.
- Title and end cards are gone: the movie starts with your first part and ends with your last.
- “Count acceleration pulls too” now only ever adds parts. It used to raise the “fun enough” line
  (a percentile of the score) and could lose borderline corners in the same video.
- New look. The window is one dark slab: panels sit edge to edge with hairlines between them, no
  glass, gradients or glow; colour is kept for the data (corners, braking) and for delete/stop. Light
  theme follows the same rules.
- Custom title bar: the brand, project menu, active part, undo/redo, settings and “Make my movie” live
  in the title bar; the Windows buttons stay native (snap layouts keep working).
- The hairline between the panels can be dragged; the widths are remembered.
- Timeline blocks show a colour stripe on their left edge and only as much label as fits, so narrow
  parts no longer read “Con” or “C”. Ruler with minor ticks and a playhead head.
- “Your ride in numbers” is now “This ride”, four rows that jump to the moment.
- Scan screen lists the videos and ticks them off as they finish.
- Light theme: the filmstrip under the parts is drawn as a real image (multiplied onto the light
  ground) and the blocks are tinted more strongly, so the timeline reads as well as in dark.
- Music plays whenever the playhead is inside a part that is in the movie, not only in Preview mode;
  the ride sound ducks under it as it will in the movie. The music lane says it runs in movie time
  (your parts back to back), which is why it does not line up with the recording above.

## 0.4.16

- New switch under “How picky?”: **Count acceleration pulls too**. Straight-line pulls (a few seconds
  of opening up with real speed gain) become parts; normally only braking and acceleration near a
  corner count. Off by default, per project; new scans and preset changes keep the choice.

## 0.4.15

- Ride card: “corners” now counts actual corners (lean past 20°) inside the parts of the movie — it used
  to count parts, so a long joined part counted as one corner. Sharpest lean and hardest braking are
  taken from the movie's parts too (braking used to look at the whole recording).
- Export card: times read as a clock (“23:26”, “1:02:05”, “30 s”) instead of “(1406 s)” and “23 min
  26 sec”.
- “1 parts” reads “1 part” everywhere.
- A part's lean / braking / acceleration figures follow its edges when you trim or drag them (they
  stayed at the values of the original pick); joined parts keep their pieces inside the new edges.

## 0.4.14

- Fixed: “Make my movie” / “Make clips” failed with “Something went wrong” (the same “could not be
  cloned” error that hit adding videos earlier). Every call from the window to the app core now goes
  through one wrapper that makes this impossible.

## 0.4.13

- Fixed: 0.4.12 could not find updates (a file the updater needs was left out of the package). If you
  are on 0.4.12, install this version once by hand; updates work again from here.
- Fixed: “Remove from this project” and “Scan again” on a video that was not scanned yet acted on the
  wrong video or did nothing. Unscanned videos now offer “Scan now”.
- Videos whose scan never finished (for example after the 0.4.9 scan failure) are scanned when the
  project opens.

## 0.4.12

(0.4.11 was tagged but never built.)

- Fixed: scanning failed in the installed app (“Something went wrong” right after adding videos) — the
  scan worker could not load part of its code from the package. Dev builds were unaffected, which is
  why it slipped through; the release build now checks for this.
- Adding videos to a project that already has scanned ones shows the scan screen too.

## 0.4.10

- The update banner now shows up while a new version downloads (with the percentage and a progress
  line), then turns into the “ready — restart to update” banner.

## 0.4.9

- Fixed: adding videos from several days at once failed with “An object could not be cloned”.
- Fixed: the “n of m videos done” line under the scan bar stayed at 0 until the whole scan finished.
- Fixed: the project card menu was cut off by the thumbnail; the quick tour no longer pops up on the
  projects screen.

## 0.4.8

- The new icon is used inside the app too (top bar, projects screen, empty project, About).

## 0.4.7

- App icon: the A of ApexCut with a racing line through its apex, on the brand gradient.

## 0.4.6

- App icon changed (superseded in 0.4.7).
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
