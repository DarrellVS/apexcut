# Design system

Influences: Flush (density, typography, colour-coded timeline blocks), CutCut (light theme, cards,
top bar), jellyfish-style glass panels and floating transport. Goal: an editor a non-technical rider
understands in one look, in light and dark.

## Layout

```
┌ top bar (glass) ─────────────────────────────────────────────────────────────┐
│ ◆ ApexCut  my-ride · Saved     [selected part: reason · time · why]   ↶ ↷  [Make my movie ▾] │
├ Videos (300) ┬ stage (video, floating transport) ┬ inspector (300): Parts | Movie | This video ┤
├ timeline (glass): ruler · Score lane · Parts lane (filmstrip bg, blocks, join bars, floating toolbar) · legend ┤
```

- Panels are floating glass cards with 10 px gaps on a soft two-tone radial gradient backdrop.
- Sidebars are equal width (300 px). Left = videos. Right = tabs Parts / Movie / This video.
- Settings open as a near-fullscreen rounded modal (gear in the top bar, `Ctrl+,`, Esc closes): left nav
  grouped App / Editing / Advanced, one section at a time on the right, 680 px reading width. Nothing
  global lives in the sidebar any more.
- Top bar centre shows the active part (hover, selection or playing): `Corners · 7:28 – 7:38 · 11 sec · up to 27° lean`.
- Actions on a part live in the floating toolbar above the block (Play · Leave out / Put back · Join /
  Join with next · Delete). It must stay on one line and shift horizontally to remain inside the lane.
- Empty state and scan progress are full-screen with one primary action.

## Tokens (`src/renderer/src/assets/tokens.css`, exposed to Tailwind v4 via `@theme`)

| token              | light                 | dark                      | use                                        |
| ------------------ | --------------------- | ------------------------- | ------------------------------------------ |
| `--bg` / `--bg2`   | #eef0f6 / #f7f3ff     | #0d0d14 / #1a1030         | page backdrop gradient                     |
| `--glass`          | rgba(255,255,255,.72) | rgba(28,28,38,.72)        | panel fill (blur 18px)                     |
| `--s2` / `--s3`    | rgba(0,0,0,.045/.08)  | rgba(255,255,255,.06/.10) | buttons, rows, hover                       |
| `--line`           | rgba(20,20,40,.08)    | rgba(255,255,255,.09)     | 1 px borders                               |
| `--fg` / `--muted` | #15161c / #6d6e7a     | #eeeef3 / #9394a3         | text                                       |
| `--acc1 → --acc2`  | #ff7a3d → #ff3d81     | same                      | brand gradient: logo, primary button, Join |
| `--corner`         | #f0862c               | #ffa04a                   | data: corners                              |
| `--brake`          | #1fa3a3               | #4dd0d0                   | data: braking/acceleration                 |
| `--both`           | #8b5cf6               | #b394ff                   | data: corners + braking                    |
| `--manual`         | #8d8d98               | #a0a0ab                   | data: added / joined                       |
| `--sel` / `--play` | #3b82f6 / #ff3d5a     | same                      | selection outline / playhead               |
| `--r` / `--rs`     | 14 px / 10 px         |                           | card radius / control radius               |

Data colours are semantic and identical in meaning across themes. Primary buttons use the brand
gradient; everything else is neutral. Theme: `data-theme="light|dark"` on `<html>`, "System" follows
`prefers-color-scheme`; stored in settings.

## Projects screen

Shown before the editor (and via the brand button / project menu in the top bar). Header: logo, "Your
projects" + one-line explanation, `Import project…` (neutral) and `New project` (primary). Cards in an
auto-fill grid (min 280 px): 16:9 thumbnail of the first scanned video, name, `N videos · N parts · length`,
last edit ("today 14:27", "yesterday", "Mon 7 Sep"). The open project has a `Open` pill and a selection
ring. A `···` button on hover opens Rename / Export project… / Delete; delete confirms inline on the card
("Your videos and their scans stay; only this project's picks go."). New project = an inline card with a
name field. The top bar reads `ApexCut / <project> ▾ · Video 34 · Saved`; the project menu offers All
projects / Rename (inline) / Export project…. With more than three projects a search field and a sort
segment (Last edited / Name / Movie length) appear; the card menu also has Archive, which moves the card
into a collapsed “Archived · n” section at the bottom.

- **How picky? (Parts tab)**: preset segment, the Fewer/More parts slider, then a checkbox “Count
  acceleration pulls too” with a one-line plain-words explanation (per project; toggling rescoring
  every video and toasting the new count), then “Add part at …”.

## Sheets, banners and the tour

- **Import sheet**: a pick or drop that spans several recording days asks first — one row per day with a
  checkbox and an editable name, and the choice One project per day (recommended) / All into this project.
- **Update banner**: a slim glass bar above the top bar once a new version has downloaded: “ApexCut 0.3.0 It appears already while the update downloads (icon pulses, percentage, a 2 px gradient progress line along the bottom edge) and turns into the ready state in place.
  is ready · What’s new · Restart to update · ×”.
- **Error card**: a centred `popover` card for anything we could not recover from — plain title and hint
  from `utils/errors.ts`, Details disclosure with the raw text, Restart ApexCut, Report a problem (zip in
  Documents), Continue anyway.
- **Quick tour**: three steps with a spotlight (a rounded hole in a 60 % black overlay) on the parts lane,
  Preview and Make my movie; a 340 px card that clamps to the window. Shown once, replayable from Settings.
- **Music lane**: under the parts lane, in movie time (all enabled parts back to back): songs as teal
  blocks laid end to end with trim handles, a dashed line where the movie ends, a floating toolbar for
  the selected song (volume, fade in/out, earlier/later, remove), and Music / Ride sound sliders in the
  lane header. Missing files show dashed in `--play`. Preview plays the song that covers the playhead
  and ducks the ride sound to the chosen level.
- **Movie tab**: transition segment (Crossfade / Cut / Dip to black) with a plain-words hint,
  title card and end card toggles, “Only the starred parts”.
- **Telemetry overlay**: white bike silhouette and angle number (Lean angle) or dial + orange needle +
  teal/orange g-bar (Dashboard) in a chosen corner, sizes S/M/L as a share of the frame height; drawn
  live on the stage inside the export crop so it lands where it will be. Colours are fixed (white,
  `#ff7a3d`, `#4dd0d0`) because they sit on video, not on the app theme.
- **Ride card**: 1080×1350 and 1200×630 PNG — dark or light ground (follows the theme) with the brand
  glow, mark + project name + date, three thumbnails of the best parts, four stat tiles, footer with the
  twistiest minute and “Made with ApexCut”. Every number is measured inside the parts that are in the
  movie (`src/core/stats.ts`): corners = lean excursions past 20° (ending under 12°, same-side dips
  under 0.6 s merged, blips under 0.4 s dropped); sharpest lean / hardest braking are the extremes in
  those parts; the twistiest minute is the 60 s window with the most time above 10° of lean.
- **Export overlay**: while a movie is made, a centred `popover` card (520 px) with a 56 px percentage,
  the step, elapsed/left, a brand-gradient bar and the note that the project is locked; × or Esc asks
  “Stop the export?” inline before cancelling; when done the card shows Watch it / Open folder / Done.
- **Focus**: every interactive element shows a 2 px `--sel` ring for keyboard focus only; timeline blocks
  are focusable (arrows move, Enter plays, Space toggles, Delete removes). `prefers-reduced-motion` turns
  transitions off.

## Type & shape

Inter (self-hosted), 14 px base, 12 px timeline/tables, 11 px uppercase section labels with 0.06em
tracking, `tabular-nums` for times. Radii: cards 14, controls 10, blocks 8, floating bars 12. Shadows
only on floating elements. Motion: opacity/transform only, 150–200 ms.

## Timeline

Ruler → Score lane (white overall score, orange leaning, teal braking, dashed threshold) → Parts lane
with the filmstrip as a dimmed background (opacity ≈ .28), blocks as 8 px-radius solid colour with
white label text and edge grips, dashed join bars above chains that likely belong together, hover
popover with values, legend row below.
