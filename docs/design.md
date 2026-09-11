# Design system — "Slab"

The window is one dark slab. Panels sit edge to edge, separated by 1 px hairlines; nothing floats,
blurs or glows. The chrome is achromatic so that colour means data (which kind of part a block is) or
danger (delete, stop). Goal unchanged: an editor a non-technical rider understands in one look, that
still reads as a serious tool next to Resolve or Final Cut.

Research behind it (Sept 2026): DaVinci Resolve, Premiere 25 / Spectrum 2, Final Cut Pro, CapCut,
Descript, Runway, Frame.io V4, Screen Studio, Recut, plus the "AI-generated UI" checklists that call
out gradients, glass, rounded-2xl, indigo accents, pill badges, glowing shadows and oversized friendly
copy. What nearly all pro editors share: a 4–5 step neutral grey ladder, one accent spent only on
state, square-ish clips, small tabular type, the same three-plus-one layout, a unified title bar.

## Layout

```
┌ title bar 40 px (drag handle; native ─ ☐ ✕ drawn by the OS at the right) ───────────────────┐
│ ⋀ ApexCut / Eifel test ▾  Video 24 · Saved     [Corners · 7:28 – 7:38 · 11 sec]   ↶ ↷ ⚙ [Make my movie ▾] │
├ Ride rail (300, draggable) │ stage (video in an 8 px black inset) │ Movie panel (300, draggable) ┤
├ timeline 300: ruler 20 · score 40 · parts lane · music 28+32 · legend 28 ───────────────────────┤
```

- **Title bar** (`Shell/TopBar.vue`): `titleBarStyle: 'hidden'` + `titleBarOverlay` so Windows keeps
  its own buttons (and Windows 11 snap layouts). The bar is `app-region: drag`; every clickable child
  is `no-drag`. Content stops at `env(titlebar-area-width)`. Double-click maximises. The renderer
  recolours the native buttons on every theme change (`window:setOverlay` with `--bg0` / `--fg2`) and
  the bar dims to 60 % when the window is not focused. Height is `TITLEBAR_HEIGHT` in `shared/ipc.ts`.
- **Splitters**: the hairline between panels has a 6 px invisible grip; widths are remembered per
  side (`composables/usePanelWidth.ts`, localStorage).
- **Panels** are `.panel` (flat `--bg1`) with a 32 px `.panel-head` (11 px caps) or a 32 px tab strip
  with a 2 px `--ink` underline under the open tab.
- Title bar centre shows the active part (hover, selection or playing): `Corners · 7:28 – 7:38 ·
11 sec · up to 27° lean`; otherwise the movie so far.
- Actions on a part live in the chip toolbar above the block (Play · Leave out / Put back · Star ·
  Join / Join with next · Delete). It stays on one line and shifts horizontally to remain in the lane.
- Empty state and scan progress are single centred columns with one primary action.

## Tokens (`src/renderer/src/assets/main.css`, exposed to Tailwind v4 via `@theme inline`)

| token                                | dark                        | light                       | use                                     |
| ------------------------------------ | --------------------------- | --------------------------- | --------------------------------------- |
| `--bg0`                              | #0f1012                     | #e4e5e9                     | window ground: title bar, stage, ruler  |
| `--bg1`                              | #16171a                     | #f3f3f5                     | panels, lanes                           |
| `--bg2`                              | #1d1f23                     | #ffffff                     | raised: buttons, inputs, rows, popovers |
| `--bg3`                              | #262931                     | #e9eaee                     | hover / pressed                         |
| `--line` / `--line2`                 | #2a2d33 / #3d414a           | #d3d5db / #b9bcc5           | hairlines / stronger hairline           |
| `--fg` / `--fg2` / `--fg3`           | #e8e9ec / #a0a4ac / #6c717b | #17181b / #5c6068 / #8a8e97 | text: primary / secondary / hint        |
| `--ink` / `--ink-fg`                 | #e8e9ec / #111214           | #17181b / #ffffff           | the inverse: primary button, progress   |
| `--sel` / `--play`                   | = `--ink`                   | = `--ink`                   | selection ring / playhead               |
| `--danger`                           | #e5484d                     | #d23b3b                     | delete, stop, missing file              |
| `--corner`                           | #d9a04a                     | #c98a2e                     | data: corners                           |
| `--brake`                            | #4fb3ad                     | #2f9d97                     | data: braking / acceleration            |
| `--both`                             | #9d8ce0                     | #7f6bcf                     | data: corners + braking                 |
| `--manual`                           | #8b8f98                     | #7c8089                     | data: added / joined                    |
| `--r-ctl` / `--r-card` / `--r-block` | 4 / 6 / 2 px                |                             | controls / cards, popovers / blocks     |

No gradients, no `backdrop-filter`, no glow. Shadows only on popovers (`--shadow`). Data colours are
semantic and identical in meaning across themes. Theme: `data-theme="light|dark"` on `<html>`,
"System" follows `prefers-color-scheme`; stored in settings.

## Components (utilities in `main.css`)

- `.btn` 28 px, hairline, `--bg2`; `.btn-pri` inverse (`--ink`); `.btn-ghost` transparent; `.btn-danger`;
  `.btn-mini` 22 px; `.btn-icon` 28×28. No pill buttons, no scale on press.
- `.input` 28 px; `.seg` / `.seg-item` segmented radio (the chosen item raised on `--bg2`);
  `.tile` a bordered choice card (`aria-pressed` = selected, `--sel` border); `.card` for grouped
  settings; `.row` / `.menu-item` 28 px rows.
- `.popover` on the chrome (`--bg2`, `--line2`, shadow; resets caps/nowrap/size so it can open from
  a panel head). Every menu and popover closes on a click outside or Escape through one composable,
  `composables/useDismiss.ts`. `.chip` / `.chip-btn` for anything that sits
  on video or the timeline (transport, toolbars, hover readout): dark in both themes because it is over
  media.
- `.label-caps` 11 px / 600 / 0.04em; `.num` tabular numerals — on every time, count and size.

## Screens

- **Projects**: left-aligned page header, `Import project…` (neutral) and `New project` (primary).
  Cards (min 280 px) with a 16:9 thumbnail, name, `N videos · N parts · length`, last edit. The open
  project has an `Open` tag and an `--sel` border; `···` opens Rename / Export project… / Archive /
  Delete (inline confirm). New project is an inline card. Search + sort appear with more than three
  projects; archived ones collapse at the bottom.
- **Empty project**: a dashed drop zone with `Choose videos…` (primary) and `Whole memory card…`.
- **Scanning**: title + percentage, a 4 px `--ink` bar, the stage text and `n of m videos done`, then
  the list of videos ticking off.
- **Ride rail** (`Ride/RideRail.vue`, left): the app's real model is one ride = several videos =
  one movie of parts, so the left panel is the ride, not a media bin. Head: `Ride` and the picky
  popover (`Sporty ▾`: preset segment, Fewer/More slider, “Count acceleration pulls too”, “Add part
  at …”). Then three label/value rows (sharpest lean,
  hardest braking, twistiest minute) that jump to the moment. Then the **outline**: every video as a
  row (grip · fold caret · thumb · name · `kept parts · length`, `···` menu: find moved file, scan
  again, EDL, how parts are picked, remove) with its parts underneath (checkbox, colour tick, time,
  reason, length, star). A part of any video opens that video and jumps there; drag a video row to
  change the movie's order. Footer: `+ Videos`, `+ Folder`.
- **Movie panel** (`Movie/MoviePanel.vue`, right, always visible — no tabs): head `Movie · N parts
from M videos · length`, made from all videos / only this one, name, 11 px caps labels over tiles
  (`One movie` / `Separate clips`; four formats), segments for transition and riding-data overlay,
  the result; the primary button is a fixed footer under the scrolling content. The ride card lives in the project menu
  of the title bar (`Make ride card`, `composables/useRideCard.ts`). Sections are 20 px apart; tiles
  carry an icon and a name only, the explanation is the tooltip. The crop frame is on the
  video whenever the format is not square; its drag hint appears on hover.
- **Settings**: near-fullscreen popover, left nav grouped App / Editing / Advanced, 640 px reading
  width. `Ctrl+,` toggles, Esc closes, focus is trapped and returned.
- **Import sheet**, **Export overlay**, **Error card**, **Quick tour**: centred popovers, base
  16 px titles, mini progress dots for the tour.
- **Update banner**: 32 px bar under the title bar; downloading shows the percentage and a 1 px
  `--ink` line along the bottom edge, then turns into “ready · What’s new · Restart to update · ×”.
- **Toast**: a popover under the title bar, centred, 3 s.
- **Ride card** / **telemetry overlay** draw on video, not on the theme: their colours are fixed
  (white, orange, teal) — see `src/core/overlay.ts` and `utils/rideCard.ts`.

## Type & shape

System UI (Segoe UI Variable on Windows, SF on macOS), 13 px base / 1.45, 12 px secondary and
timeline, 11 px caps labels, 16–18 px page titles; weights 400 / 500 / 600 carry the hierarchy, not
colour. `tabular-nums` on every number. Radii: controls 4, cards and popovers 6, timeline blocks 2,
panels 0. Motion: opacity/colour only, 120–150 ms; `prefers-reduced-motion` turns it off. Focus:
1.5 px `--sel` outline for keyboard focus only.

## Timeline

Ruler (20 px, `--bg0`, minor + major ticks, clock labels, a triangular playhead head) → Score lane
(40 px: `--fg` overall score with a faint area fill, `--corner` leaning, `--brake` braking, dashed
`--fg3` “fun enough” line) → Parts lane with the filmstrip as a dimmed background (`--strip-alpha` /
`--strip-blend`: .22 normal in dark, .45 multiply in light; saturation .6). Blocks (`.block`,
`.block-corner` …): 2 px radius, a 3 px solid stripe in the data colour on the left edge and a
`--block-mix` tint of the same colour as fill (40 % dark, 60 % light), `--fg` label + tabular length; left-out parts are 45 % with a
dashed stripe; the selection is a 1 px inset `--sel` ring. Join suggestions are 10 px dashed
`--corner` bars above chains that belong together. The playhead is a 1 px `--play` line in every
lane. Music lane: 28 px header (Music · Add music… · Music / Ride sound sliders · a hint that the lane
runs in movie time) and a 32 px lane with `--brake` blocks (dashed `--danger` when the file is
missing). The song under the playhead plays whenever the playhead is inside a kept part, preview or
not, with the ride sound ducked. Legend row: swatches, the movie
length, Zoom slider, Fit, help.
