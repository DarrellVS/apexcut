# GoPro fixtures

The `gpmd` metadata tracks of GoPro's own sample recordings, taken from
[gopro/gpmf-parser](https://github.com/gopro/gpmf-parser) (`samples/`, Apache-2.0) with

```
ffmpeg -i samples/hero8.mp4 -map 0:d:1 -c copy -f data hero8.gpmf
```

Only the metadata track is kept — no picture, no sound. Between them they cover the three kinds of
camera ApexCut has to read:

| file        | camera     | recording | what makes it interesting                                    |
| ----------- | ---------- | --------- | ------------------------------------------------------------ |
| hero5.gpmf  | Hero5 Black| 34.576 s  | no axis strings; names its axes in words; stamps its uptime   |
| hero7.gpmf  | Hero7 Black| 12.715 s  | axis strings (`ORIN`/`ORIO`), camera pointing down            |
| hero8.gpmf  | Hero8 Black| 12.651 s  | the camera's own fused attitude (`CORI`), mounted upside down |
