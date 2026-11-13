# Screensaver subscribe animation

Optional subscribe overlay for **static image** Screensaver exports. Disabled by default; when enabled, a short animated overlay is composited during export while the rest of the video stays at the project frame rate (typically 1 fps for static art).

## Behavior

- **Disabled:** same encode path as a normal static screensaver export.
- **Enabled:** the client renders a cropped transparent PNG sequence at **30 fps** for **7 seconds** (210 frames). The server encodes three segments (1 fps / 30 fps / 1 fps), concatenates them, then muxes one continuous audio track.

Settings live in **Subscribe Animation** under Screensaver Settings. They are **session-only** (not saved in IndexedDB); a full page reload resets to defaults.

## Editor

- Enable the toggle, pick a **style**, set **start time**, **position**, **size (% of output width)**, and **distance from edges**.
- **Show on preview canvas** loops the animation on the main editor canvas while tuning (default on).
- **Channel card** style: YouTube **Fetch** for channel name, avatar, and subscriber count (`POST /api/youtube-channel-lookup`).

### Styles

| Style | Default size (% output width) |
| --- | --- |
| Channel card | 27 |
| Subscribe button only | 12 |
| Subscribe + alerts | 18 |
| Like + subscribe + alerts | 25 |

Edge distance defaults to **0** for all styles. Changing style applies that style’s default size and resets edge to 0.

## Local development

```bash
npm install
npm run dev
```

## Automated verification

Short renders (5–30 s) require the test env flag:

```powershell
$env:RIBO_SCREENSAVER_TEST="1"
npm run test:screensaver-subscribe
```

Checks include baseline 1 fps output, hybrid segment frame spacing via `ffprobe show_frames`, and monotonic PTS.

## Benchmark

```bash
npm run bench:screensaver-subscribe
```

Writes `server/tmp/bench-screensaver-subscribe.json` with wall time, bytes, frame counts, and FFmpeg version.

## Upload limits

Export multipart may include up to **210** cropped `animationFrames` PNGs plus composition/audio (multer **214** files, **80 MB** per-file limit on screensaver export).

## Rendering

- Preview canvas and export share `renderSubscribeAnimationAt()` with explicit `timeSec` (deterministic frames, not CSS transitions).
- Hybrid encode: [`server/src/renderScreensaverHybrid.ts`](../server/src/renderScreensaverHybrid.ts) — segments A/C loop the composition PNG at 1 fps; segment B overlays the PNG sequence at 30 fps; concat with copy or re-encode fallback; audio muxed once for full duration.
