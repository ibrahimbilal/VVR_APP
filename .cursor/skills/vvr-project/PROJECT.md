# Video's Factory — project map

Local **Video's Factory** platform with two apps:

1. **Ranking Videos** (legacy VVR) — 9:16 ranking compilation editor.
2. **Frame Screensaver** — long-form 16:9 ambient video from one image or looping video.

Ranking behavior is unchanged in substance: upload clips (or link titles only), order, style banner and ranks, preview, export MP4.

There are no accounts and no cloud project storage. The editor is a Vue app. The renderer is Express with bundled FFmpeg. **Production** runs on Hostinger Node.js at `https://videos.ibrahimbilal.com` (same app also deployed at `https://vvr.ibrahimbilal.com`; deploy steps: `.cursor/skills/hostinger-vvr-deploy/SKILL.md`). Local dev still uses separate Vite (5173) and API (3001) processes.

## Run

Node `^20.19.0 || >=22.12.0`. From the repo root:

- `npm install` — installs both workspaces. FFmpeg and ffprobe come from `ffmpeg-static` and `ffprobe-static`. No system FFmpeg.
- `npm run dev` — renderer on `127.0.0.1:3001` (`tsx watch`) and editor on `127.0.0.1:5173` (Vite). Vite proxies `/api` to 3001 with no timeout.
- `npm run typecheck` — client `vue-tsc` via `client/scripts/typecheck.mjs`, then server `tsc --noEmit`.
- `npm run test:screensaver` — short static screensaver render + ffprobe (`server/scripts/verify-screensaver.ts`).
- `npm run build:dev` / `npm run start:dev` — Vite development build, then the renderer serves `client/dist` and the API on port 3001.
- `npm run build:prod` / `npm run start:prod` — production client build plus esbuild server bundle (`server/dist/index.js`). Listens on `PORT` or 3001. Host is `0.0.0.0` when `PORT` is set, otherwise `127.0.0.1`.

Workspaces: root `vvr-app`, `client` (`vvr-client`), `server` (`vvr-server`). Shared TypeScript is imported by path, not as a package.

## Layout

```
client/src/App.vue                      platform shell (sidebar, header, toasts)
client/src/app/router.ts                /, /ranking-videos, /frame-screensaver
client/src/stores/platform.ts           renderer health, global toasts, nav UI
client/src/stores/project.ts            ranking editor state
client/src/apps/ranking-videos/         RankingVideosView (editor layout)
client/src/apps/frame-screensaver/      screensaver view, store, components
client/src/components/layout/           AppSidebar, AppHeader, MobileNavDrawer
client/src/composables/usePlayback.ts     ranking preview clock
client/src/components/                  ranking panels (ClipSidebar, PreviewStage, …)
client/src/lib/                         api, exportJob, jobPoll, idb, drawOverlay, …
server/src/jobs.ts                      one queue; ranking + screensaver job kinds
server/src/render.ts                    ranking FFmpeg graph
server/src/renderScreensaver.ts         screensaver FFmpeg graph
server/src/ffmpegUtil.ts                shared spawn/progress/verify helpers
shared/screensaver.ts                   16:9 outputs, duration limits
shared/frame.ts, shared/timeline.ts     ranking-only layout and timing
server/tmp/                             clips, jobs, outputs, incoming, registry.json
```

Stack: Vue 3, **vue-router**, Pinia, Tailwind 4, Lucide. Client aliases `@shared`, `@` → `src`. Server: Express 5, Multer, cors.

## Platform shell

`App.vue`: left sidebar (desktop), header with renderer status (`GET /api/health`), `router-view`, global toasts (`usePlatformStore`).

- Routes: `/` dashboard, `/ranking-videos`, `/frame-screensaver`. SPA fallback in production.
- Mobile: hamburger opens left drawer; ranking mobile tabs unchanged inside `RankingVideosView`.

## Ranking screen

`RankingVideosView.vue`: New project, optional mobile tabs, editor grid, `TimelineBar`.

- `xl` and up: clips `350px`, preview flex, style `350px`; selected clip panel `280px`.
- Space toggles play on the ranking route only (not in inputs).
- Hydration overlay until ranking `hydrated`.
- Dev: `window.__vvr` is the ranking Pinia store.

## What the user can do

1. Add up to 30 local files (MP4, MOV, WebM, m4v) or a recognized link.
2. Reorder by drag. Edit a clip title in the sidebar. Select a clip to trim, recolor its number and title, replace the file, or mark it "Play at the end".
3. Edit the banner sentence. Each word is a span with its own color. A newline in the title sets `breakBefore` on the first word of the next line.
4. Pick a preset (Classic Ranking, Tier List, Minimal) or keep Custom. Style banner, ranking, video, and audio.
5. Play the preview. Banner and ranks stay painted on a canvas while `<video>` elements play underneath.
6. Export MP4. Download starts only after the server verifies the file.

A link stores a title and thumbnail when the platform allows it. It does not download the video. `uploadState: 'empty'` until the user attaches a file. Instagram never fetches a title (no Meta token).

## Editor state

`useProjectStore` in `client/src/stores/project.ts` is the only project store.

Reactive: `name`, `titleText`, `spans`, `style`, `activePreset`, `clips`, `selectedClipId`, `selectedPanelOpen`, `colorSets`, `activeColorSetId`, `musicUrl`, `musicName`, `serverOnline`, `hydrated`, `exportState`, `toasts`, `urlNotice`.

Module-level (not reactive): `fileMap` (clip id → File), `musicFile`, `exportAbort`, `applying` (suppresses the preset→custom watcher).

Export is blocked (`exportBlocker`) when the renderer is offline, fewer than 2 clips, any clip is uploading / empty / error, or any kept span is under 0.3s.

Changing `style` or `spans` after hydration sets `activePreset` to `custom`, unless `applying` is true (preset apply and resolution change set that flag).

`setPlayAtEnd(id, enabled)` sets the flag on that clip and clears it on every other clip. On restore, only the first saved finale stays true.

`setResolution` only accepts the two outputs in `shared/frame.ts`. Pixel sizes (banner, fonts, outlines, rank position, caption) scale by `newWidth / oldWidth`. Outlines that were 0 stay 0.

`setTrim` keeps at least 0.3s and clamps to the clip duration.

`cycleRankColors` writes the active color-set colors onto clips in list order.

## Data shapes

Defined in `client/src/types.ts`.

- `Clip`: id, title, fileName, `source` (`local | youtube | tiktok | instagram`), sourceUrl, duration, trimStart, trimEnd, serverId, objectUrl, thumbnail, rankColor, titleColor, playAtEnd, width, height, hasAudio, uploadState (`empty | uploading | ready | error`), uploadProgress, error, previewBlocked.
- `PersistedClip` is the clip without objectUrl, upload progress, and error. `playAtEnd` is persisted.
- `ProjectStyle`: `banner`, `ranking`, `caption`, `video`.
- Banner: visible (off = no banner, video fills the frame), background, height, font, size, weight, align, lineHeight, outline, shadow.
- Ranking: font, size, weight, color, itemSpacing (0–100, treated as a percent of font size), positionX/Y, outline, shadow, opacity, format (`dot | plain | hash | pad` → `1.` / `1` / `#1` / `01`), display (`stack` = all numbers, `page` = current only), pageStyle (`fraction` = `1 / N`, `number` = the format), showPreviousTitles, sort (`list | reverse | title | titleDesc`).
- Caption styles the clip title drawn beside the rank number. `caption.bottom` is stored and scaled on resolution change. The canvas does not read it.
- Video: width, height, fps, scaleMode (`crop | fit | blur`), backgroundColor, transition (`cut | fade`), fadeDuration, keepAudio, normalize, originalVolume, musicVolume (0–1).
- Presets: `classic | tier | minimal | custom`. Definitions and default video (1080×1920, 30 fps, crop, cut, fade 0.35, keep audio, normalize, music 0.35) are in `client/src/lib/presets.ts`. Fonts: Oswald, Anton, Bebas Neue, Montserrat, Inter.
- Rank number colors default to the active color set. `null` on a clip means "use the ranking color". Title color `null` means "use the caption color".

Color sets live outside the project: `localStorage` key `vvr-color-sets` (`client/src/lib/colorSets.ts`). Defaults: Classic, Warm, Cool, Mono. Max 12 hex colors, at least one set, at least one color. Preset apply cycles ranks only for Tier List.

## Persistence

IndexedDB database `vvr`, **version 2** (`client/src/lib/idb.ts`): `meta`, `files`, `music`, `screensaver`.

- Ranking: `meta/ranking-videos` (`SavedProject` v1). Legacy `meta/current` migrates on load. Saved 400ms after changes, once hydrated.
- Screensaver: `screensaver/project`, blobs `screensaver/source` and `screensaver/audio`.
- `clearRankingProject()` clears ranking meta/files/music only (not screensaver).
- Each clip file is stored by clip id. Music is one blob.
- Refresh rebuilds object URLs from those blobs and re-uploads if the server no longer has `serverId`. A local clip whose file is gone becomes `error`. A link clip whose file is gone stays `empty`.
- Color sets are localStorage, not IndexedDB. New project clears the IndexedDB project and music, not the color sets.
- Clearing site data wipes the project. Server files expire on their own (below).

## Order, ranks, and time

Two orders:

- List order is the sidebar. Rank numbers follow list index (`formatRank`), not playback position.
- Playback order (`client/src/lib/order.ts`) is list order with the single `playAtEnd` clip moved to the end. Preview, timeline blocks, and the export clip list all use this order.

`rankingRows` (`client/src/lib/format.ts`) builds the painted list: list order by default, or sort (`reverse`, title A–Z, title Z–A). `playAtEnd` does not move a row on the overlay; only playback order changes. `overlayRanks` paints every row in stack mode. In page mode it paints one row. With "Show previous titles", a stack row shows its title when it is the current clip or an earlier playback clip.

`shared/timeline.ts`:

- Kept length is `trimEnd - trimStart`.
- Fade is 0 for hard cuts or a single clip. Otherwise `min(requested, 1s, 40% of the shortest clip)`.
- Sequence length is the sum of kept lengths minus fade times the number of joins.
- Preview ignores clips with no object URL or under 0.05s. Export requires every clip to keep at least 0.3s and the whole sequence to be ≤ 30 minutes.

## Preview

`usePlayback.ts` owns one playback instance (`usePlayback()` returns that singleton).

- Segments come from playback order. Each segment start subtracts the fade from the previous clip.
- Two `<video>` elements (A/B) crossfade. A third hidden video feeds the blurred-background mode.
- Clip audio comes from the `<video>` slots. Mute, or `keepAudio` off, silences them. During a crossfade the outgoing slot ducks to 15% while the incoming slot rises. Volume is `originalVolume`.
- Music is a looping `Audio` at `musicVolume`. It pauses when muted, paused, missing, or at volume 0.
- `playhead` is the sequence clock. Seek loads the right clip and trims inside `trimStart`…`trimEnd`.
- `previewBlocked` is set when the browser cannot decode a file. Export may still succeed.

`PreviewStage.vue` scales a 1080×1920 (or 720×1280) stage to fit. The video box starts at `bannerHeight` and is `videoHeight` tall. Crop uses `object-fit: cover`. Fit and blur use `contain`. Blur shows the background video with a CSS blur. The canvas is full frame and calls `drawOverlay` with the active clip's list index.

`frameMetrics` (`shared/frame.ts`) is the shared layout: even banner height, min 80, max 42% of frame height, video height even. A height of 0 means no banner. Preview, `startExport`, and `runExport` all pass 0 when `banner.visible === false`, so the video fills the frame in both places. The Title section has a Show title checkbox. `drawOverlay` also skips the banner rectangle when `visible` is false.

## Canvas overlay

`client/src/lib/drawOverlay.ts` draws the PNG used by both preview and export.

- `ensureFonts()` loads the Fontsource faces before the first paint.
- Banner rectangle, then wrapped word spans. Size shrinks (down to 28px) until the block fits. Alignment is left, center, or right. Outline and shadow via `paintText`.
- Ranks are clipped to the area below the banner. They stack from `bannerHeight + positionY`. `fitRankSize` shrinks the font (down to 28px) so every row fits. Item spacing adds `itemSpacing%` of the font size to the line gap. Opacity is clamped to 0.15–1.
- A row title is drawn to the right of the number, in the caption font, ellipsized. Per-clip `titleColor` wins over the caption color.

## Export

`startExport` in the store checks the blocker, warns above 5 minutes, then `runExport` (`client/src/lib/exportJob.ts`):

1. `overlays` — one full-frame PNG per clip in playback order. `overlayRanks` receives format, display, page style, showPreviousTitles, and sort. Progress ~2–8%.
2. `uploading` — multipart `POST /api/export`. Field `project` is JSON. Fields `overlays` are `overlay-0.png` … in the same order. Field `music` is sent only when a file exists and `musicVolume > 0`. Progress ~9–16%.
3. Poll `GET /api/jobs/:id` every 700ms. Abort calls `POST /api/jobs/:id/cancel`.
4. On `done`, download `GET /api/jobs/:id/download` with the project name, else the banner text, else `ranking.mp4`.
5. On download, `POST /api/uploads/cleanup` removes server clips, frames, and export outputs; clip `serverId`s are cleared and local files re-upload in the background. Closing the tab runs the same server purge (beacon). Editor state stays in IndexedDB.

Project JSON clips are `{ id: serverId, trimStart, trimEnd }` in playback order. The server does not know titles or rank colors. Those exist only in the PNGs.

Server `parseProject` requires 2–30 clips, UUID ids, 1080×1920 or 720×1280, fps 24/30/60, hex banner and background, scale and transition enums, trim ≥ 0.3s, sequence ≤ 30 minutes. Overlay count must match clips and each PNG must match the output size.

## Renderer

`server/src/jobs.ts` keeps jobs in memory and a queue. `pump` runs one job at a time. Clips used by a job are retained so delete returns 409 while a render is running. The job directory is deleted when the job finishes. A non-done output file is deleted. Done files stay until the sweep.

`server/src/render.ts` builds one FFmpeg filter graph:

- Trim, fps, then scale. Crop: scale up and crop. Fit: scale down and pad with `backgroundColor`. Blur: split, blurred cover background (`gblur=sigma=24`) plus a contained foreground.
- Pad the frame so the video sits under the banner (`bannerColor`), then overlay the PNG.
- Hard cut: `concat`. Crossfade: chained `xfade` / `acrossfade`. Fade offsets follow `shared/timeline.ts`.
- Clip audio (when `keepAudio` and volume > 0): 48 kHz stereo, optional `loudnorm=I=-16:TP=-1.5:LRA=11`. Silent clips get `anullsrc` so concat stays aligned.
- Music is trimmed to the sequence, faded in/out, then `amix` with clip audio.
- Output is H.264 + AAC when any audio is present, `+faststart`, yuv420p.
- If normalize fails, retry without it. If a crossfade fails, retry as hard cuts. The job `warning` explains the fallback.
- Verify with ffprobe: dimensions, duration near the expected length, and an audio stream when audio was requested. Download is refused until status is `done`.

Progress on the client: overlays/upload are local; queued/preparing/rendering/verifying come from the job. Rendering maps ffmpeg time onto 20–95%.

## HTTP

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, ffmpeg }` |
| POST | `/api/clips` | one video, field `file`, max 500 MB |
| GET | `/api/clips/:id` | metadata if the file is still registered |
| DELETE | `/api/clips/:id` | remove unless a render holds it |
| POST | `/api/import-url` | `{ url }` → title lookup, `canDownload: false` |
| POST | `/api/export` | `project` JSON + overlays + optional music, 40 MB each, up to 31 files |
| GET | `/api/jobs/:id` | status |
| POST | `/api/jobs/:id/cancel` | kill ffmpeg |
| GET | `/api/jobs/:id/download` | verified mp4, 409 if not ready |
| GET | `/api/screensaver/encoders` | verified H.264 encoders and cached Auto choice |
| POST | `/api/screensaver/media` | image or video for screensaver |
| GET | `/api/screensaver/frames` | saved screensaver frame PNGs |
| POST | `/api/screensaver/frames` | one PNG, field `file`, max 40 MB |
| GET | `/api/screensaver/frames/:id` | that PNG |
| DELETE | `/api/screensaver/frames/:id` | remove a saved frame |
| POST | `/api/uploads/cleanup` | JSON `{ purgeAll?: true, jobId? }` (default) — remove all frame PNGs, every clip not held by a render, and export MP4s in `outputs/` (optional `jobId` for the just-downloaded file; skips outputs for jobs still encoding). Same handler at `/api/screensaver/uploads/cleanup`. Legacy `{ mediaId, frameIds }` when `purgeAll: false` |
| POST | `/api/screensaver/export` | screensaver JSON, optional `audio`, optional `composition` PNG. Video frames come from the saved PNG, not an upload |

Jobs queue handles `kind: 'ranking' | 'screensaver'` (`server/src/jobs.ts`).

Unknown `/api` routes return 404 JSON. If `client/dist/index.html` exists, Express serves it and falls back to `index.html` for non-API paths.

`POST /api/clips` probes the file, rejects duration over 20 minutes, and stores it under a new UUID. The client may already have a browser duration; the server duration replaces it, and user trims are clamped rather than wiped when the user had already trimmed.

## Files on disk

`server/tmp/` (created on boot):

- `clips/` and `registry.json` — uploaded sources for **both** Ranking and Frame Screensaver (same folder). Registry rows whose files are missing are dropped on load. Screensaver cleanup removes non-`ranking` clips and then deletes orphan files in `clips/` that are not in the registry.
- `frames/` and `frames.json` — screensaver frame PNGs. They stay until deleted. The sweep does not remove them.
- `incoming/` — Multer landing pad.
- `jobs/<id>/` — overlays and music for the active render. Removed when the job ends.
- `outputs/<id>.mp4` — finished files.

Sweep every 10 minutes: outputs older than 2 hours, jobs and incoming older than 6 hours, clips older than 7 days (unless a render holds them).

## Limits

- 30 clips, 20 minutes each, 30 minutes per compilation, 500 MB per video, 40 MB per music, overlay, or screensaver frame PNG.
- Trim at least 0.3 seconds. Fade at most 1 second and 40% of the shortest clip.
- Banner height 80px to 42% of the frame, even.
- One FFmpeg process at a time. The queue still accepts jobs.
- Preview codecs are whatever the browser can play. Export codecs are whatever this FFmpeg build can read. They are not the same set.
- Uploaded server files are not the saved project. The project is this browser's IndexedDB.

## Where to change things

| Task | Open |
| --- | --- |
| Layout, tabs, header, toasts | `client/src/App.vue`, `client/src/style.css` |
| Clip list, URL add, drag reorder | `client/src/components/ClipSidebar.vue` |
| Trim, colors, play-last, replace | `client/src/components/SelectedClipPanel.vue` |
| Presets, banner, ranks, video, audio controls | `client/src/components/StylePanel.vue` |
| Preview stage and controls | `client/src/components/PreviewStage.vue` |
| Play, seek, crossfade, music | `client/src/composables/usePlayback.ts` |
| Timeline and export button | `client/src/components/TimelineBar.vue` |
| Add/remove/reorder/persist/export actions | `client/src/stores/project.ts` |
| Types | `client/src/types.ts` |
| Rank labels, sort, page vs stack | `client/src/lib/format.ts`, `client/src/lib/order.ts` |
| Word colors | `client/src/lib/title.ts` |
| Painted banner and numbers | `client/src/lib/drawOverlay.ts` |
| PNG build and job polling | `client/src/lib/exportJob.ts` |
| Fetch wrappers | `client/src/lib/api.ts` |
| Server upload purge (both apps) | `client/src/lib/serverUploadCleanup.ts` |
| Browser save | `client/src/lib/idb.ts` |
| Preset numbers | `client/src/lib/presets.ts` |
| Palette | `client/src/lib/colorSets.ts` |
| File checks and local metadata | `client/src/lib/media.ts` |
| Output size, fps, banner math | `shared/frame.ts` |
| Duration and fade math | `shared/timeline.ts` |
| Link parsing | `shared/urls.ts` |
| Routes and validation | `server/src/index.ts` |
| Queue | `server/src/jobs.ts` |
| FFmpeg graph | `server/src/render.ts` |
| Disk and expiry | `server/src/storage.ts` |
| Probe | `server/src/probe.ts` |
| oEmbed | `server/src/oembed.ts` |
| Screensaver editor, export, frames | `client/src/apps/frame-screensaver/`, `shared/screensaver.ts`, `shared/screensaverComposition.ts`, `shared/screensaverFrames.ts`, `shared/screensaverAdjust.ts`, `server/src/frames.ts` |
| Screensaver encode and encoder probe | `server/src/renderScreensaver.ts`, `server/src/screensaverGraph.ts`, `server/src/encoders.ts` |

## Invariants

- Preview paint and export PNGs both call `drawOverlay` + `overlayRanks`. Change ranking math in `format.ts` / `order.ts`, not in the Vue files.
- Duration math lives in `shared/timeline.ts`. The server and the preview both import it.
- Banner and frame size live in `shared/frame.ts`. Do not duplicate the 42% / even-pixel rules.
- Export clip order is playback order. Rank numbers stay tied to list index.
- Only one clip has `playAtEnd`.
- Do not download social video. `canDownload` is always false.
- Do not write secrets into source. This app has no API keys.

## Frame Screensaver

Editor state is `useScreensaverStore` (`client/src/apps/frame-screensaver/stores/screensaver.ts`). Ranking state is untouched.

Saved projects are IndexedDB `screensaver/project` version 2. Version 1 loads with the old fit (contain, cover, blur) turned into a composition, profile `balanced`, encoder `auto`, and the saved frame rate left as it was. The original media blob is not rewritten. `clearRankingProject()` does not clear this store.

The composition (`shared/screensaverComposition.ts`) is normalized to the output frame: crop in source space, placement, rotation, flips, opacity, adjustments, background, and frame id. Browser size and view zoom are not part of it. Preview and the static export PNG both use `composeCanvas.ts`.

Frames are uploaded PNG files. `shared/screensaverFrames.ts` only accepts `none` or a stored frame id; older preset names (classic, mat, rounded, arch) load as no frame. The Frames section uploads PNGs (40 MB max), keeps them in `server/tmp/frames/`, and shows them in a grid. Clicking a thumbnail selects it. Clicking it again clears the frame. Draw order is background, the placed image, then the PNG stretched over the output. Transparent pixels show the picture. Static exports bake that PNG into the composition image. Video exports overlay the stored file in FFmpeg and do not clip with a mask. After the user downloads the finished MP4, the client purges frames, all server clips (except any clip locked by a running render), finished files in `server/tmp/outputs/`, and clears local media blobs. Closing the tab or window sends the same server purge via `POST /api/uploads/cleanup` (beacon); local IndexedDB is left intact so a later visit can re-upload from the saved blobs.

Adjustments (brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpness, blur, grayscale, sepia) are baked into the static PNG, so that export matches the editor. Video exports send the same slider values through FFmpeg (`eq`, `exposure`, `curves`, `colorbalance`, `hue`, `colorchannelmixer`, `gblur`, `unsharp`). Canvas blur/sharpen is a box blur; FFmpeg uses `gblur` and `unsharp`, so a moving video can differ slightly from the preview. Static art does not, because the PNG is the source.

Profiles: Static Art (default 1 fps for a new image), Balanced (24 fps), High quality (CRF 16 or the matching hardware CQ), Animated (30 fps). The user can still pick 1, 24, or 30 afterwards. CPU quality for Balanced and Static Art stays CRF 20, preset veryfast, the same band as the original screensaver encode. High uses CRF 16 and preset medium. Hardware maps are in `encoderArgs` (`server/src/encoders.ts`): NVENC VBR CQ, Quick Sync `global_quality`, AMF CQP, VideoToolbox `-q:v`, Media Foundation quality mode. `-hw_encoding true` is not set for Media Foundation; that flag failed format negotiation on the test machine.

Encoder choice is Auto, CPU, or one listed hardware encoder. Auto runs a 3-second timed encode of each encoder that actually starts at that resolution and profile, caches it in `server/tmp/encoder-cache.json`, and picks a hardware encoder only when it is more than 8% faster than libx264. An explicit encoder that fails init or the real encode stops the job. The export panel then offers “Export with CPU instead”. Auto retries on CPU and sets a warning. Ranking export is still libx264 with one thread.

Static images: the browser draws one full-resolution PNG and FFmpeg loops it at the chosen frame rate with no scale or color filters. Audio is a second input in that same process (loop, volume, fades). New image projects use Static Art at 1 fps. Saved version-1 projects keep 24 or 30.

Video: stream copy (`-stream_loop -1 -c:v copy`) only when the source is H.264 yuv420p, already the output size, and the composition is a full-frame placement with no crop, rotation, flip, adjustment, or frame. Otherwise it re-encodes. A failed copy falls back to an encode and sets a warning. Smooth loops encode one crossfaded cycle, then copy that file for the full duration when the copy probe succeeds. The cycle file is in the job directory, which is deleted on finish, cancel, and error.

Job JSON adds optional `encoder`, `hardware`, `encodeFps`, `encodeSpeed`, `elapsedSec`, `etaSec`, and `stage`. Ranking leaves them null. ETA stays empty until progress is past 2% and at least 2 seconds have elapsed. Speed and fps come from FFmpeg `-progress`. Screensaver x264 thread count is `min(4, CPU count)`, overridable with `VVR_X264_THREADS`.

Size estimates use bytes/second measured on the 8-second baseline below (1080p still, 4K still, 1080p motion). Other sizes scale the 1080p rate by pixel count. The UI labels this as approximate. Audio adds 192 kbit/s when a track is present.

### Benchmark (8-second outputs, this Windows machine, 2026-10-22)

Baseline is the original graph: libx264, CRF 20, veryfast, `-threads 1`, 30 fps, scale/blur inside the encode. CPU and memory were often “not measured” because the sampler needs two samples 400 ms apart.

| Case | Resolution | fps | Wall | FFmpeg speed | Bytes | Valid |
| --- | --- | --- | --- | --- | --- | --- |
| Static image | 1920×1080 | 30 | 4.31s | 3.66x | 48156 | yes |
| Static image | 3840×2160 | 30 | 13.23s | 0.579x | 120820 | yes |
| Looping video | 1920×1080 | 30 | 3.57s | 2.32x | 313403 | yes |
| Looping video, blur | 1920×1080 | 30 | 8.75s | 0.869x | 313403 | yes |

Blur used about 368% CPU and 544 MB. The other baseline rows finished before a second sample.

Optimized CPU path (precomposed stills, x264 threads up to 4, no per-frame scale on stills). Decorative frames are drawn into the still PNG, so they do not add a second encode pass. There is no baseline row for frames.

| Case | Resolution | fps | Wall | FFmpeg speed | Bytes | Valid |
| --- | --- | --- | --- | --- | --- | --- |
| Static, precomposed | 1920×1080 | 1 | 0.27s | n/a (too short) | 23926 | yes |
| Static, precomposed | 1920×1080 | 30 | 1.83s | 4.72x | 54910 | yes |
| Static, precomposed | 3840×2160 | 1 | 1.00s | n/a | 48474 | yes |
| Looping video, re-encode | 1920×1080 | 30 | 2.24s | 3.5x | 388388 | yes |
| Looping video, blur | 1920×1080 | 30 | 4.65s | 1.97x | 388388 | yes |
| Looping video, stream copy | 1920×1080 | 30 | 0.27s | n/a | 188008 | yes |

On that pass, 1080p stills at the same 30 fps dropped from 4.31s to 1.83s. The 1 fps default dropped the 1080p still to 0.27s and the 4K still from 13.23s (30 fps) to 1.00s. Those 1 fps rows are a different frame rate, not the same encode with a faster preset. The blur loop dropped from 8.75s to 4.65s. Stream copy of an already-matching H.264 file was 0.27s versus 2.24s to re-encode a smaller source up to 1080p. A later pass on a busy machine was slower for the same CPU commands (1080p 30 fps still 6.64s) and is not used as the comparison.

Timed tests (3 seconds, 1080p, still, standard quality), not the 8-second exports:

- First test, before Media Foundation init was fixed: libx264 7.27x, Quick Sync 4.15x. NVENC could not load `nvcuda.dll`. AMF could not load `amfrt64.dll`. Auto selected CPU.
- After dropping `-hw_encoding true`: Media Foundation 6.15x, libx264 3.24x, Quick Sync 2.52x. Auto selected Windows Media Foundation. That second test ran while the machine was busier, so the 6.15x figure is not comparable to the 7.27x figure above. Both tests agreed Quick Sync was slower than libx264 here.

A static 1 fps file with the precomposed PNG matched the PNG at SSIM 0.995 (`npm run test:screensaver`).

## Changelog

- 2026-10-24 — Root `overrides` pin `body-parser` 2.4.0 (Express transitive dep; Hostinger CVE advisory) (`package.json`, `package-lock.json`).
- 2026-10-24 — Ranking export download and tab close use the same `POST /api/uploads/cleanup` purge as Frame Screensaver (`client/src/lib/serverUploadCleanup.ts`, `client/src/stores/project.ts`).
- 2026-10-24 — Screensaver upload cleanup also removes all non-busy clips, export MP4s in `outputs/`, and orphan clip files (`server/src/storage.ts`, `server/src/jobs.ts`, `server/src/index.ts`).
- 2026-10-24 — Screensaver upload cleanup also deletes orphan files in `server/tmp/clips/` that are no longer in `registry.json` (`server/src/storage.ts`).
- 2026-10-24 — Frame Screensaver server cleanup purges all frame PNGs and all non-ranking clips (including leftovers from earlier sessions); clips are tagged `origin` on upload (`server/src/storage.ts`, `server/src/frames.ts`, `server/src/index.ts`, `client/src/lib/api.ts`, `client/src/apps/frame-screensaver/stores/screensaver.ts`).
- 2026-10-23 — Frame Screensaver Frames section uploads PNG files, stores them on the server, and previews them in a grid. The preset dropdown is gone.
- 2026-10-23 — Production also deployed at `videos.ibrahimbilal.com`; Hostinger deploy reference lists both domains.
- 2026-10-22 — Frame Screensaver adjustment controls use icons for reset, reset all, and before/after. Names stay on the tooltips.
- 2026-10-22 — Frame Screensaver canvas toolbar uses icons for zoom, fit, center, crop, undo, and playback. Names stay on the button tooltips.
- 2026-10-22 — Frame Screensaver: canvas editor (crop, transform, adjustments, procedural frames), 1 fps stills, precomposed PNG encode, hardware-encoder probe with CPU fallback, stream-copy loops, export diagnostics. Ranking encode is unchanged.
- 2026-10-22 — Frame Screensaver media panel matches Ranking drag-and-drop upload styling and behavior.
- 2026-10-22 — Multi-app **Video's Factory**: vue-router shell, Dashboard, Frame Screensaver app, IDB v2 ranking migration, screensaver API/render, shared job queue.
- 2026-10-22 — Documented Hostinger production URL and added `hostinger-vvr-deploy` skill for archive-based redeploys.
- 2026-10-22 — Timeline uses one export button (progress fill, hover-to-cancel, download when ready); project edits after export clear the ready state.
- 2026-10-22 — Ranking overlay keeps list order when sort is “As listed”; `playAtEnd` affects playback only, not stack position.
- 2026-10-22 — Created this map from the current client, server, and shared code. No product behavior changed.
