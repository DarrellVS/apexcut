# GoPro metadata (GPMF)

What ApexCut reads out of a GoPro recording, and how that becomes the same numbers a DJI recording
gives. The code is `src/core/gopro/` (pure, unit-tested against the fixtures in
`tests/fixtures/gopro/`); nothing below is guessed — it was measured on GoPro's own sample
recordings and, where the sign mattered, on the picture itself.

## The track

Every GoPro from the Hero5 on writes a data track next to the picture, tagged `gpmd`. ffmpeg copies
it out in one go, the same way the DJI `djmd` track is taken:

```
ffmpeg -i GX011234.MP4 -map 0:d:<index of gpmd> -c copy -f data out.gpmf
```

The format is GPMF, key-length-value: four-character key, a one-character type, the size of one
item, how many items follow, padded to four bytes. Type `\0` means the value is more KLV, so the
track is a tree — a payload (`DEVC`, one per second of recording, give or take) holds streams
(`STRM`), and a stream holds its numbers next to the things that explain them:

| key    | what it is                                                               |
| ------ | ------------------------------------------------------------------------ |
| `ACCL` | accelerometer, metres per second squared, ~200 Hz                        |
| `GYRO` | gyroscope, radians per second, 200–400 Hz                                |
| `SCAL` | divide the raw numbers by this (one per axis, or one for all)            |
| `STNM` | the stream's name in words ("Accelerometer (up/down, right/left, …)")    |
| `ORIN` | which axes the sensor produced                                           |
| `ORIO` | which axes the numbers are in now, e.g. `ZXY` (lower case = negated)     |
| `CORI` | the camera's own fused attitude, Hero8 and newer, ~30 Hz                 |
| `GRAV` | gravity in the camera's frame, Hero8 and newer (the samples write zeros) |
| `STMP` | when the payload starts, microseconds — a Hero5 writes `TICK` (uptime)   |

## Axes

The camera's own frame is X right, Y forward, Z up. `ORIO` says which of those each column holds; a
Hero5 writes no `ORIO` and names its axes in words instead — up, right, forward — which is the same
as `ZXY`, so that is the fallback. ApexCut turns whatever it finds into the one frame the rest of
the app uses: **x forward, y right, z down, acceleration in g**, so an upright camera at rest reads
`az ≈ −1`, exactly like DJI.

A camera mounted upside down (GoPro turns the picture the right way up, the sensors stay as they
are) is noticed from where gravity sits on average over the whole recording, and turned back up with
a half turn about the forward axis. The Hero8 sample is such a recording, which is what pins that
behaviour in the tests.

## Attitude

DJI hands over an attitude quaternion; GoPro before the Hero8 hands over nothing of the sort, so
ApexCut works it out itself with a Mahony complementary filter (`core/gopro/attitude.ts`): the
gyroscope carries the fast movement, the accelerometer pulls the horizon level so it cannot drift
away, and a slow integral term learns the gyroscope's bias. Yaw drifts, as it must without a
compass — only its rate is ever used, so that costs nothing. The result is written at a steady
30 Hz, the rate the scoring is tuned for, and from there the pipeline is shared with DJI: IMU maths
(`core/imu.ts`), scoring, the timeline, the overlay.

The same filter runs for every generation, including the ones that carry `CORI`. That keeps one
behaviour for every camera, and `CORI` is what measures it: over GoPro's Hero8 sample, the attitude
ApexCut works out never differs from the camera's own by more than 6°.

## Sign, checked against the picture

Positive yaw rate has to mean _turning right_, the same as DJI, or everything from the corner
scoring to the vertical frame that follows the corners would be mirrored. Measured, not assumed:
between 15.0 s and 15.2 s of the Hero5 sample the scene slides 56 px to the left (found by matching
the two frames), so the camera swung right, and the yaw rate there is positive. `tests/core/gopro.test.ts`
keeps that honest.

## What it does not do

- **GPS** (`GPS5`) is parsed but not used yet: speed, distance and place names are a separate job.
- **Fusion, not stabilisation.** A GoPro's own horizon levelling changes the picture, not the
  sensors, so a levelled recording still scores on how the bike moved.
- **Playback and filmstrips** use the small `.LRV` copy the camera writes next to the recording when
  it is there (`GL011234.LRV` belongs to `GX011234.MP4`, matched on the last six characters). Copy
  the whole folder off the card and that comes along; without it the app plays the full recording,
  which a 4K HEVC file may be slow at.
