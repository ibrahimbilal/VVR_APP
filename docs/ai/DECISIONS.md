# Decisions and constraints

Verified architectural rules. Do not reverse these without an explicit product decision.

## Product

1. **Local-first.** No user accounts, no cloud project storage.
2. **Links never download video.** Import stores title/thumbnail metadata; `canDownload` is always false. Instagram never fetches a title.
3. **Five apps in one shell.** Ranking Shorts, Image Motion Shorts, Screensaver, Thumbnail Studio, Image Upscaler, Audio Looper share chrome and patterns but keep separate stores.
4. **Thumbnail Studio is browser-only.** No FFmpeg for thumbnails.

## Preview ↔ export alignment

5. Ranking preview paint and export PNGs both use `drawOverlay` + `overlayRanks` (`client/src/lib/drawOverlay.ts`, `format.ts`).
6. Duration/fade math lives only in `shared/timeline.ts`.
7. Banner/frame metrics live only in `shared/frame.ts`.
8. Screensaver preview composition and static export bake share composition helpers (`composeCanvas` / shared composition types). Video adjust filters may differ slightly (Canvas vs FFmpeg) — known constraint.

## Rendering

9. **One FFmpeg pipeline at a time** on the server (`jobs.ts` pump). Client may queue multiple snapshots (up to 12 per app); prep is serialized via `exportQueueRunner.ts`.
10. Image Upscaler jobs are sequential and **separate** from the FFmpeg queue.
11. Bundled FFmpeg/ffprobe only (`ffmpeg-static`, `ffprobe-static`). No requirement for system FFmpeg.
12. Encoder Auto/CPU/HW selection is shared via `encoders.ts`; explicit HW failure fails the job; Auto may fall back to CPU with a warning.

## State

13. **Single ranking store:** `client/src/stores/project.ts`.
14. Export clip order is **playback order** (`order.ts`); rank numbers follow **list index**.
15. At most one clip has `playAtEnd`.
16. Uploaded server files are not the saved project; IndexedDB is.

## Limits (summary)

17. Ranking: ≤30 clips, ≤20 min each, ≤30 min sequence, ≥0.3s trim, ≤500 MB video, ≤40 MB music/overlays.
18. Do not write secrets into source. Optional AI Lite env vars stay in `.env` (gitignored).

## Deep reference

Full limits, HTTP table, and storage layout: `.cursor/skills/vvr-project/server.md`.
