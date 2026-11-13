# Optimized CFR production integration

Integrated 2026-11-13. The Screensaver export path now supports **Optimized CFR** (default for new image projects) and **Fast VFR** (legacy). The standalone PoC (`npm run poc:optimized-cfr`) is unchanged and retained.

## 1. Architecture

| Module | Responsibility |
| --- | --- |
| `server/src/screensaverCfr/timeline.ts` | Frame-accurate region plan (static / dynamic); static segment planner |
| `server/src/screensaverCfr/encodingConfig.ts` | CRF / preset / GOP / H.264 level / timescale resolver |
| `server/src/screensaverCfr/segmentCache.ts` | Project-scoped content-hashed segment cache (job work dir) |
| `server/src/screensaverCfr/renderScreensaverCfr.ts` | Encode → concat stream-copy → audio mux → CFR validate |
| `server/src/screensaverCfr/validate.ts` | Streaming ffprobe packet grid check (PTS sorted, DTS monotonic) |
| `renderScreensaver.ts` | Routes Optimized CFR vs Fast VFR hybrid vs legacy still encode |
| `renderScreensaverHybrid.ts` | Fast VFR subscribe path (timestamp fix) |
| `shared/screensaver.ts` | Render mode, CFR fps, quality enums |
| Client Output settings | Mode / CFR fps / quality UI |

## 2. Files created or modified

**Created:** `server/src/screensaverCfr/*`, `server/scripts/verify-screensaver-cfr.ts`, `server/scripts/bench-screensaver-cfr.ts`, `server/scripts/export-screensaver-cfr-youtube.ts`, `shared/screensaverCfr.test.ts`, `docs/screensaver-cfr-bench.md`, `docs/optimized-cfr-production-report.md`

**Modified:** `shared/screensaver.ts`, `server/src/renderScreensaver.ts`, `server/src/renderScreensaverHybrid.ts`, `server/src/index.ts`, `client/.../stores/screensaver.ts`, `client/.../types.ts`, `client/.../ScreensaverSettingsPanel.vue`, root/`server` `package.json`, deep project docs under `.cursor/skills/vvr-project/`

## 3. Rendering modes

- **Optimized CFR (default, new image projects):** Genuine constant frame rate. Encodes unique static segments once, references them in an ffconcat list, stream-copies assembly, validates the PTS grid. Smooth subscribe animation at the selected CFR rate.
- **Fast VFR (legacy):** Existing low-frame-rate static + high-fps animation hybrid. Saved projects without `renderingMode` keep this path.

## 4. Production encoder settings

| Preset | CRF | Preset | GOP | Notes |
| --- | ---: | --- | ---: | --- |
| High Quality | 18 | medium | 2 s | Fine artwork detail |
| Balanced (default) | 20 | veryfast | 2 s | Matches YouTube-validated PoC |
| Compact | 24 | veryfast | 5 s | Smaller files, acceptable still quality |

Common: libx264 High profile, yuv420p, bt.709, closed GOP, 2 B-frames, timescale **60000**, stillimage tune on static segments only. H.264 level is selected per resolution/fps (5.2 for 4K60).

720p quality bench (20 s @ 30 fps, no animation): High 568 KB, Balanced 404 KB, Compact 152 KB (`docs/screensaver-cfr-bench.md`).

## 5. Static segment duration

**Preferred: 10 seconds** (PoC-validated). The planner repeats that length, then fills remainders from shorter candidates (5 / 2 s) or an exact leftover encode. Multi-hour single-composition runs prefer **30 s** to reduce concat entry count. Segment controls stay internal.

## 6–8. Benchmarks / size / memory

| Output | Measured |
| --- | --- |
| Integrated 4K60 60 s (subscribe + static reuse) | **7.07 MB**, CFR validation passed |
| Integrated 1080p60 600 s | **18.48 MB**, CFR validation passed |
| PoC Optimized CFR 4K60 60 s (prior) | 55.39 s wall, 1200 frames encoded, 7.1 MB |
| PoC Full CFR 4K60 60 s (prior) | 162.67 s wall, 3600 frames encoded |
| PoC VFR (prior, pre-fix) | 21.27 s wall, reported 64 s duration |

Peak process memory on this ~8 GB machine stayed in the same band as the PoC (~1.3–1.4 GB FFmpeg working set for 4K encodes). Temp media lives under the job directory and is cleaned with the existing job lifecycle. Multi-hour conventional CFR encodes were not re-run.

## 9. Automated tests

```
npm run test:screensaver-cfr
```

Results: 17/17 unit tests passed; integration cases static-only, anim-start/middle/end at 24/25/30/60 fps passed; VFR duration regression **20.000 s** for a 20 s target.

```
npm run test:screensaver-subscribe
```

Hybrid verify OK (Fast VFR path still works).

## 10. VFR timestamp defect

**Cause:** Mixing 1 fps static and 60 fps animation MP4s, then concat with `+genpts`, reinterpreted packet timing so container duration drifted (PoC: 64 s vs 60 s).

**Fix (isolated to hybrid):** Shared `-video_track_timescale 60000` on every segment, ffconcat `duration` lines, remove `+genpts`, use `-avoid_negative_ts make_zero`, encode animation with exact `-frames:v`. Mixed frame rates are preserved; wall-clock length now matches the project duration.

## 11. YouTube test file paths

Manual upload still required for Stats for Nerds acceptance.

- `<repo>/server/tmp/cfr-production/youtube-production-cfr-4k60-60s.mp4`
- `<repo>/server/tmp/cfr-production/youtube-production-cfr-1080p60-600s.mp4`

Acceptance: 2160p60 available, Stats `3840x2160@60`, smooth subscribe animation, no join flashes, correct duration and audio sync.

## 12. Limitations and risks

- Optimized CFR is **static image only**; looping video keeps Fast VFR / existing encode paths.
- Hardware encoders are not used for CFR segment identity; CFR encodes force the libx264-compatible argument set from `cfrLibx264Args`.
- Progress percentages can jump while FFmpeg reports segment-local progress; stages are still labeled.
- Compact CRF 24 may show mild banding on smooth gradients — inspect artwork before shipping Compact as a default for a series.
- Repeated stream-copied packets still occupy space in the final MP4; segment reuse reduces **encode time**, not final size linearly with duration.
- Disk space for multi-hour 4K CFR outputs can reach several GB; the engine does not yet preflight free disk before starting.
- YouTube 2160p60 for the **integrated** engine still needs a manual upload check (PoC already passed separately).
