# Server — render queue, HTTP, storage, limits

## Renderer

`server/src/jobs.ts` keeps jobs in memory and a queue. `pump` runs one job at a time. Clips used by a job are retained so delete returns 409 while a render is running. The job directory is deleted when the job finishes. A non-done output file is deleted. Done files stay until the sweep.

`server/src/render.ts` builds one FFmpeg filter graph:

- Trim, fps, then scale. Crop: scale up and crop. Fit: scale down and pad with `backgroundColor`. Blur: split, blurred cover background (`gblur=sigma=24`) plus a contained foreground.
- Pad the frame so the video sits under the banner (`bannerColor`), then overlay the PNG.
- Hard cut: `concat`. Crossfade: chained `xfade` / `acrossfade`. Fade offsets follow `shared/timeline.ts`.
- Clip audio (when `keepAudio` and volume > 0): 48 kHz stereo, optional `loudnorm=I=-16:TP=-1.5:LRA=11`. Silent clips get `anullsrc` so concat stays aligned.
- Music is trimmed to the sequence, faded in/out, then `amix` with clip audio.
- Output is H.264 + AAC when any audio is present, `+faststart`, yuv420p. Encoder choice matches Screensaver: Auto (default), CPU, or a verified hardware encoder via shared `server/src/encoders.ts` (`ranking_motion` benchmark workload). Auto retries on CPU with a job `warning` when hardware fails; an explicit unavailable encoder stops the job.
- FFmpeg threading is adaptive (`server/src/ffmpegThreading.ts`): global/filter threads scale with CPU count (conservative under 8 GB RAM). Overrides: `RIBO_FFMPEG_THREADS`, `RIBO_FFMPEG_FILTER_THREADS`, `RIBO_X264_THREADS`.
- If normalize fails, retry without it. If a crossfade fails, retry as hard cuts. The job `warning` explains the fallback.
- Verify with ffprobe: dimensions, duration near the expected length, and an audio stream when audio was requested. Download is refused until status is `done`.

Progress on the client: overlays/upload are local; queued/preparing/rendering/verifying come from the job. Rendering maps ffmpeg time onto 20–95%. Job poll also exposes `encodeProgress` (0–1 from FFmpeg output time). Ranking and Screensaver show that progress, plus encoder, speed, and ETA, in a studio Export status panel (`AppExportStatusPanel.vue`). It stays a narrow rail until opened. Screensaver also lists total output frames (`duration × fps`) and rendered frames (`encodeProgress × total`, `ScreensaverExportDetails.vue`, `jobPoll.ts`).

## HTTP

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, ffmpeg }` |
| POST | `/api/clips` | one video, field `file`, max 500 MB |
| GET | `/api/clips/:id` | metadata if the file is still registered |
| DELETE | `/api/clips/:id` | remove unless a render holds it |
| POST | `/api/import-url` | `{ url }` → title lookup, `canDownload: false` |
| POST | `/api/youtube-channel-lookup` | `{ url }` → channel name, avatar (data URL when proxied), subscribers |
| GET | `/api/youtube-channel-avatar` | `?url=` — proxy YouTube CDN avatar images (allowlisted hosts) |
| POST | `/api/export` | `project` JSON + overlays + optional music, 40 MB each, up to 31 files |
| POST | `/api/image-motion/media` | one JPG/PNG/WebP, max 80 MB → clip registry `origin: image-motion` |
| POST | `/api/image-motion/export` | `project` JSON + optional music; segments reference uploaded `serverId`s |
| GET | `/api/jobs/active` | queued / preparing / rendering / verifying / done jobs still on the renderer (for reload recovery) |
| GET | `/api/jobs/:id` | status |
| POST | `/api/jobs/:id/cancel` | kill ffmpeg |
| GET | `/api/jobs/:id/download` | verified output (`.mp4` for ranking/screensaver, `.mp3`/`.wav`/`.flac` for audio-looper), 409 if not ready |
| POST | `/api/audio-looper/export` | one audio file + `settings` JSON; queues `kind: 'audio-looper'` |
| GET | `/api/encoders` | verified H.264 encoders and cached Auto choice (alias: `/api/screensaver/encoders`) |
| POST | `/api/screensaver/media` | image or video for screensaver |
| GET | `/api/screensaver/frames` | saved screensaver frame PNGs |
| POST | `/api/screensaver/frames` | one PNG, field `file`, max 40 MB |
| GET | `/api/screensaver/frames/:id` | that PNG |
| DELETE | `/api/screensaver/frames/:id` | remove a saved frame |
| POST | `/api/uploads/cleanup` | JSON `{ purgeAll?: true, jobId? }` (default) — remove all frame PNGs, leftover `jobs/` work dirs, every clip not held by a render, and export MP4s in `outputs/` (optional `jobId` for the just-downloaded file; skips outputs and job dirs for jobs still encoding). Same handler at `/api/screensaver/uploads/cleanup`. Legacy `{ mediaId, frameIds }` when `purgeAll: false` |
| POST | `/api/screensaver/export` | screensaver JSON, optional `audio`, optional `composition` PNG, optional `animationFrames` PNGs (max 120). Video frames come from the saved PNG, not an upload |
| GET | `/api/image-upscaler/capabilities` | Lanczos3 plus whether AI Lite can run. No filesystem paths |
| POST | `/api/image-upscaler/process` | one image, field `file`, plus `options` JSON. Returns a job |
| POST | `/api/image-upscaler/batch` | field `files` (max 8), plus `options` JSON |
| GET | `/api/image-upscaler/jobs/:id` | per-image status. No filesystem paths |
| GET | `/api/image-upscaler/jobs/:id/items/:itemId/download` | full processed image |
| GET | `/api/image-upscaler/jobs/:id/items/:itemId/preview` | comparison WebP, long edge ≤ 1440 |
| GET | `/api/image-upscaler/jobs/:id/download` | ZIP of completed images |
| POST | `/api/image-upscaler/jobs/:id/re-export` | JSON `options`; export stage only using kept intermediates |
| DELETE | `/api/image-upscaler/jobs/:id` | cancel while running; `?purge=1` or a finished job deletes files |

Jobs queue handles `kind: 'ranking' | 'screensaver' | 'audio-looper' | 'image-motion'` (`server/src/jobs.ts`). Download names use `job.outputExt` (ranking/screensaver/image-motion stay `.mp4`). `purgeOutputFiles` deletes `.mp4` only so Screensaver tab-close cannot wipe audio-looper outputs; those still expire on the 2-hour sweep.

Unknown `/api` routes return 404 JSON. If `client/dist/index.html` exists, Express serves it and falls back to `index.html` for non-API paths.

`POST /api/clips` probes the file, rejects duration over 20 minutes, and stores it under a new UUID. The client may already have a browser duration; the server duration replaces it, and user trims are clamped rather than wiped when the user had already trimmed.

## Files on disk

`server/tmp/` (created on boot):

- `clips/` and `registry.json` — uploaded sources for **both** Ranking and Screensaver (same folder). Registry rows whose files are missing are dropped on load. Screensaver cleanup removes non-`ranking` clips and then deletes orphan files in `clips/` that are not in the registry.
- `frames/` and `frames.json` — screensaver frame PNGs. They stay until deleted. The sweep does not remove them.
- `incoming/` — Multer landing pad.
- `jobs/<id>/` — overlays, composition PNG, and music for the active render. Removed when the job ends, on tab/window close, and on server boot. Leftovers from a crashed or restarted render do not wait for the 6-hour sweep.
- `outputs/<id>.mp4` — finished ranking/screensaver files.
- `outputs/<id>.mp3|wav|flac` — finished Audio Looper files. Tab-close purge skips non-mp4 outputs.
- `upscaler/<jobId>/` — Image Upscaler inputs and outputs. Removed on boot, on purge, and after the job TTL (2 hours). Not part of the FFmpeg queue.

Sweep every 10 minutes: outputs older than 2 hours, jobs and incoming older than 6 hours, clips older than 7 days (unless a render holds them).

## Limits

- 30 clips, 20 minutes each, 30 minutes per compilation, 500 MB per video, 40 MB per music, overlay, or screensaver frame PNG.
- Trim at least 0.3 seconds. Fade at most 1 second and 40% of the shortest clip.
- Banner height 80px to 42% of the frame, even.
- One FFmpeg process at a time on the server. The client may queue up to 12 ranking and 12 screensaver exports (snapshots); browser overlay/composition prep runs one at a time globally (`exportQueueRunner.ts`).
- Preview codecs are whatever the browser can play. Export codecs are whatever this FFmpeg build can read. They are not the same set.
- Uploaded server files are not the saved project. The project is this browser's IndexedDB.
