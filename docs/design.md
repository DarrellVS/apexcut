# Design system

Influences: Flush (density, typography, colour-coded timeline blocks), CutCut (light theme, cards,
top bar), jellyfish-style glass panels and floating transport. Goal: an editor a non-technical rider
understands in one look, in light and dark.

## Layout

```
┌ top bar (glass) ─────────────────────────────────────────────────────────────┐
│ ◆ ApexCut  my-ride · Saved     [selected part: reason · time · why]   ↶ ↷  [Make my movie ▾] │
├ Videos (300) ┬ stage (video, floating transport) ┬ inspector (300): Parts | Movie | Settings ┤
├ timeline (glass): ruler · Score lane · Parts lane (filmstrip bg, blocks, join bars, floating toolbar) · legend ┤
```

- Panels are floating glass cards with 10 px gaps on a soft two-tone radial gradient backdrop.
- Sidebars are equal width (300 px). Left = videos. Right = tabs Parts / Movie / Settings.
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

## Type & shape

Inter (self-hosted), 14 px base, 12 px timeline/tables, 11 px uppercase section labels with 0.06em
tracking, `tabular-nums` for times. Radii: cards 14, controls 10, blocks 8, floating bars 12. Shadows
only on floating elements. Motion: opacity/transform only, 150–200 ms.

## Timeline

Ruler → Score lane (white overall score, orange leaning, teal braking, dashed threshold) → Parts lane
with the filmstrip as a dimmed background (opacity ≈ .28), blocks as 8 px-radius solid colour with
white label text and edge grips, dashed join bars above chains that likely belong together, hover
popover with values, legend row below.
