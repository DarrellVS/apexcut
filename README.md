# ApexCut

Finds the fun parts of your DJI helmet-cam motorcycle footage — corners, acceleration, braking — and
turns them into one movie. Windows desktop app (Electron + Vue 3 + TypeScript), everything runs locally.

- Reads the motion sensor data DJI Osmo Action cameras embed in every recording (30 Hz attitude
  quaternion + accelerometer). No re-encoding, no cloud, originals are never modified.
- Timeline editor: filmstrip background, score curves, parts as blocks, join suggestions, undo/redo.
- Export: square (lossless stream copy) or widescreen 16:9 / 4:3 / vertical 9:16 at full resolution,
  10-bit HEVC via NVENC/QSV/AMF (libx265 fallback), draggable framing, ETA, parallel cutting.
- EDL export for DaVinci Resolve / Premiere.

## Development

Requirements: Node 22 (`.nvmrc`), npm. ffmpeg/ffprobe come from npm (`ffmpeg-static`, gyan.dev
build with NVENC/QSV/AMF).

```bash
npm install
npm run dev          # Electron + Vite with HMR
npm run check        # lint + typecheck + tests
npm run build:win    # installer + portable exe in dist/
```

Project layout: see [docs/architecture.md](docs/architecture.md). Design system: [docs/design.md](docs/design.md).
Scoring rules: [docs/scoring.md](docs/scoring.md). DJI metadata findings: [docs/dji-metadata.md](docs/dji-metadata.md).

The Python prototype this project was ported from lives in `C:\Users\darre\dji-highlights` and acts as
the parity oracle: `tests/fixtures/` holds its raw metadata extract and expected output for one clip.

## Release

Tag `vX.Y.Z` on `main` → GitHub Actions builds the installer + portable exe and publishes a GitHub
Release with the auto-update feed (`electron-updater`).

## License

MIT © Darrell van Swinderen
