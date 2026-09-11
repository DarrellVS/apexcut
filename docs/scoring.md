# Scoring

`src/core/score.ts` — port of the Python oracle; `tests/core/parity.test.ts` proves equality on clip 0034.

## Inputs (30 Hz → 10 Hz)

From `src/core/imu.ts`: `lean_deg = atan(a_lat)`, `yaw_rate_lp` (1 Hz low-pass), `a_lon` (1.5 Hz low-pass).
Resampled with linear interpolation to a 10 Hz grid `t = 0, 0.1, …`.

## Features (2 s windows, centred)

| feature   | what                                                                        | gates                                                   |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `f_lean`  | mean of \|lean\|                                                            | × speed gate × lean-yaw gate                            |
| `f_yaw`   | mean of sustained \|yaw rate\| (rolling median 1.2 s kills shoulder checks) | × soft gate on `f_lean` (0 at 0°, 1 at 6°) × speed gate |
| `f_accel` | mean of \|a_lon\|                                                           | × "corner nearby" gate                                  |

Gates, all soft (0…1 ramps):

- **Speed gate** — `v ≈ Σ|a_lat|·g / Σ|yaw|` over 4 s. Junction turns have huge yaw and little lateral g
  → tiny v → corner features zeroed (ramp 3…6 m/s). No gating when there is hardly any yaw (< 3°/s mean).
  The estimate underestimates true speed (head yaw inflates yaw) but separates the classes.
- **Lean-yaw gate** — lean counts only with sustained yaw nearby (max of the 1.2 s median over the 2 s
  window, ramp 2…6 °/s). Lateral g without steering (swerve, camber) is not a corner.
- **Corner-nearby gate** — braking/acceleration counts only if gated lean within ±6 s reaches 8…15°.
  Braking for a junction on a straight does not score.

## Normalisation and score

Each feature → positive robust z-score: `(x − median) / max(1.4826·MAD, (p90 − median)/1.2816)`,
clipped to [0, 4]. The p90 fallback prevents blow-ups when a feature is mostly zero.
`score_raw = (0.5·n_lean + 0.2·n_yaw + 0.3·n_accel) / 1.0`, then a 4 s centred mean.

## Segments

Threshold = percentile of the smoothed score (UI slider: 92 / 85 / 75 / 65 / 55; default 75) or an
absolute value. Runs above threshold → merge gaps < 3 s → drop shorter than 5 s → pad 1.5 s.
Reason: `bochten` if corner part > 2× accel part, `accel/rem` if the reverse, else `beide`.

## User selection (`selection.ts`)

Auto segments are replaced on every rescore; manual/joined parts are kept, and auto segments that
overlap a manual part by > 30 % of the shorter one are dropped. Join = one part from first start to
last end (the gap is included), `reden = samengeplakt`. Join suggestions: neighbouring parts whose gap
is ≤ 4 s, or whose mean score in the gap ≥ 45 % of the threshold, or whose minimum ≥ 25 % with gap ≤ 12 s;
consecutive suggestions form one chain.

## Presets (`presets.ts`)

Three ride types stored per project; Sporty equals the defaults above, so the parity fixture is the
Sporty preset. Only these keys differ; weights and smoothing stay.

| key                 | Relaxed | Sporty | Track |
| ------------------- | ------- | ------ | ----- |
| `threshold_pct`     | 65      | 75     | 85    |
| `min_dur_s`         | 8       | 5      | 3     |
| `merge_gap_s`       | 5       | 3      | 2     |
| `pad_s`             | 2       | 1.5    | 1     |
| `speed_gate_lo_mps` | 2       | 3      | 4     |
| `speed_gate_hi_mps` | 5       | 6      | 8     |
| `lean_yaw_lo_dps`   | 1.5     | 2      | 3     |
| `lean_yaw_hi_dps`   | 5       | 6      | 10    |
| `accel_near_lean_s` | 8       | 6      | 4     |

`presetOf(config)` says which preset a config equals on those keys, or `custom` once a slider moved.
Choosing a preset rescoring every scanned video of the project from cached signals (no ffmpeg);
manual and joined parts survive through `mergeSelection`.

## Acceleration pulls (switch, off by default)

Braking and acceleration only count near a corner (`accel_near_lean_s`, `accel_lean_lo/hi_deg`),
so a stop at a traffic light or a launch on a straight never scores. Riders who want their
straight-line pulls have a switch under “How picky?” (per project, `ProjectRecord.pulls`). With it
on, `detectPulls` marks runs where forward acceleration stays above `pull_min_g` (0.12 g) for at
least `pull_min_s` (2.5 s) **and** the run adds up to `pull_min_dv_mps` (6 m/s ≈ 22 km/h) of speed
gain; inside such a run the acceleration gate is 1, so the pull scores like acceleration next to a
corner and becomes an “Acceleration / braking” part. The pull term is scaled like the base
acceleration (`robustScale` of the near-corner signal) and _added_; the threshold percentile is taken
from the score without pulls, so the switch can only add parts, never lose one (fixture test).
Braking on straights stays out (usually traffic). Off, the pipeline is unchanged, so the parity fixture is untouched; new scans and preset
changes carry the project's switch (`projects.scoreConfig()`). Tests: `tests/core/pulls.test.ts`.

## Changing the rules

Change `DEFAULT_CONFIG`/logic → regenerate the fixture from the Python oracle only if the change is
also made there; otherwise update `clip0034.expected.json` deliberately and describe the new behaviour here.
