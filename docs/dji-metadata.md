# DJI Osmo Action 6 metadata

Findings from clip `DJI_20260906104754_0034_D` (firmware 02.01.19, RockSteady on, 3840×3840 HEVC Main 10,
~100 Mbps, 29.97 fps). Extracted with `ffmpeg -map 0:<djmd stream> -c copy -f data`.

## Tracks

| tag    | in        | content                                                                              |
| ------ | --------- | ------------------------------------------------------------------------------------ |
| `djmd` | MP4 + LRF | protobuf `dvtm_ac206.proto`, one record per frame, **identical in both files**       |
| `dbgi` | MP4 only  | ~10 KB/frame ISP/auto-exposure debug (`dbginfo_ac206.proto`, sensor OV68A40); no IMU |
| `tmcd` | both      | timecode                                                                             |

No raw gyro track when RockSteady is on; the 30 Hz attitude is the integrated gyro output.
`telemetry-parser` (Gyroflow) 0.3.0 does not recognise these files.

## `djmd` record layout (field numbers)

```
1 header: 1{1 proto, 2 firmware, 5 serial, 6 ?, 9 start_ts_us, 10 model}
3 frame:  1{2 ts_us, 3 idx}
          2{3{1 f32 iso-like}, 4{1 bytes shutter?}, 6{1 varint exposure?},
            9{1..4 f32 quaternion w,x,y,z}, 10{2,3,4 f32 accel x,y,z (g)}, 13{2,3 varint}}
```

## Frames

- Quaternion: unit norm, camera → world, Hamilton. Euler ZYX gives roll (+ right side down), pitch
  (+ nose up), yaw (+ clockwise from above = right turn). Yaw follows the road heading.
- Accelerometer: specific force in g, camera frame x forward, y right, z down (≈ (0,0,−1) at rest;
  pitch −40° at start gives ax ≈ sin(−40°) ✓).
- The camera sits on a helmet chin mount: everything follows the rider's head. Head roll under-reads
  the bike's lean; the gravity-compensated lateral g (`a_lat = ay + sin(roll)cos(pitch)`) ≈ tan(lean)
  is the better lean proxy. Head yaw (shoulder checks, looking through corners) contaminates yaw rate.
- Validated against the dashboard in frame: 43 → 76 km/h in 3 s = 0.35–0.4 g on `a_lon`.

## LRF

Low-resolution proxy (720×720 H.264, ~5.8 Mbps), same duration/fps/frame count as the MP4, same `djmd`.
Used for analysis (fast to read), filmstrips, thumbnails and the in-app player. Exports use the MP4.
