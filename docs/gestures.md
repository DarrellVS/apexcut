# The rider's own mark

Two fingers held up to the camera while riding means "keep this bit". ApexCut looks for that in the
recording itself and turns every one it finds into a part that stands out from everything the app
picked by itself. Off unless asked for ("Keep the bits I pointed at", under How picky?).

Code: `src/core/gesture.ts` (pure, unit-tested), `src/main/actions/gesture.ts` (the ffmpeg pass),
`marksToParts` in `src/core/selection.ts`.

## What it looks for

No model runs, and nothing is recognised as a _thing_. A gloved hand in front of a helmet camera is
simply a big, flat, near-black shape that was not there a moment ago, with two fingers sticking out
of it — and that is exactly what is measured, on grey pictures of 256 × 256 at eight frames a
second:

| step          | rule                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| new and dark  | at least 35 levels and a third darker than a background that brightens at once and darkens three levels a frame, so a hand never joins it while a tunnel or a cloud does     |
| one lump, big | the largest connected dark area, 5–50 % of the picture (a hand at arm's length from a wide-angle lens is huge)                                                               |
| held in front | the middle of the lump sits below 35 % of the picture height: in front of the rider, not up in the sky                                                                       |
| flat          | less than 8 grey levels of variation inside it — a glove is one colour, a hedge or a row of houses is not; this is what keeps roadside darkness out                          |
| two fingers   | lines across the top 55 % of the lump cross exactly two runs on at least 45 % of them (and at least 12 lines), and four or more on at most 15 % (that would be an open hand) |
| held          | all of it for at least three frames in a row (⅜ s)                                                                                                                           |

## What a mark keeps

A rider marks a moment _after_ it happened, so the part runs from **ten seconds before** the fingers
went up to **two seconds after** (`MARK_BEFORE_S` / `MARK_AFTER_S`). Marks close together never
overlap: the later part starts where the earlier one ends. The parts are manual parts, so a new
preset, a different "how picky" or a rescan leaves them exactly as they are, and they are in the
movie from the moment they are found.

They are also unmistakable: a pink ring and "You marked this" on the block, a pink flag on the
timeline at the exact moment the hand went up (click it to jump there), the same pink in the ride
rail and in the title bar, and "your own marks" in the legend.

## How well it works

Measured on real recordings — two where the rider makes the gesture on purpose, and two ordinary
rides of about twenty minutes each:

| recording                          | what it should find | what it found               |
| ---------------------------------- | ------------------- | --------------------------- |
| gesture held ~1 s, twice           | 2                   | 2                           |
| gesture flashed 6 times, ~½ s each | 6                   | 4                           |
| evening ride, 22 min, no gestures  | 0                   | 0                           |
| night ride, 18 min, no gestures    | 0                   | 1 (a petrol station canopy) |

So: hold the gesture up for about a second and it is found; flash it and it may be missed; and in
the dark it marks something wrong about once every twenty minutes. A wrong mark is one part to
delete, which is why this is a switch and not a rule.

## What it costs

One ffmpeg pass over the small proxy, frames straight into the detector over a pipe (nothing is
written to disk, one frame is 64 kB): about fifteen seconds for a twenty minute recording. The
result is cached in `clips/<stem>/marks.json`, so switching the option off and on again is free.

## Why not a hand model

MediaPipe's hand landmarker and gesture recognizer were tried first, on these same recordings. On a
black glove held against a bright background they found a hand in 8 of 110 frames and never once
named the gesture — the models are trained on bare hands, and a glove in near-silhouette has none of
the detail they look for. The shape rules above were built from what the camera actually sees
instead, and are measured in the table above.
