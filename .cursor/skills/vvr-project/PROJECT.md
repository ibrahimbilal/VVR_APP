# VVR — project map

Local web app that builds a 9:16 ranking compilation. The user uploads clips they have rights to (or pastes a YouTube, TikTok, or Instagram link for a title only), orders them, styles a fixed title banner and ranking numbers, previews the sequence, and exports one MP4.

There are no accounts and no cloud project storage. The editor is a Vue app. The renderer is Express with bundled FFmpeg. **Production** runs on Hostinger Node.js at `https://vvr.ibrahimbilal.com` (deploy steps: `.cursor/skills/hostinger-vvr-deploy/SKILL.md`). Local dev still uses separate Vite (5173) and API (3001) processes.

## Run

Node `^20.19.0 || >=22.12.0`. From the repo root:

- `npm install` — installs both workspaces. FFmpeg and ffprobe come from `ffmpeg-static` and `ffprobe-static`. No system FFmpeg.
- `npm run dev` — renderer on `127.0.0.1:3001` (`tsx watch`) and editor on `127.0.0.1:5173` (Vite). Vite proxies `/api` to 3001 with no timeout.
- `npm run typecheck` — client `vue-tsc` via `client/scripts/typecheck.mjs`, then server `tsc --noEmit`.
- `npm run build:dev` / `npm run start:dev` — Vite development build, then the renderer serves `client/dist` and the API on port 3001.
- `npm run build:prod` / `npm run start:prod` — production client build plus esbuild server bundle (`server/dist/index.js`). Listens on `PORT` or 3001. Host is `0.0.0.0` when `PORT` is set, otherwise `127.0.0.1`.

Workspaces: root `vvr-app`, `client` (`vvr-client`), `server` (`vvr-server`). Shared TypeScript is imported by path, not as a package.

## Layout

```
client/src/App.vue                 shell, tabs, keyboard, toasts
client/src/main.ts                 Vue + Pinia, font CSS
client/src/stores/project.ts       all editor state and actions
client/src/composables/usePlayback.ts   preview clock, two video slots, music
client/src/components/             ClipSidebar, SelectedClipPanel, PreviewStage, StylePanel, TimelineBar, small fields
client/src/lib/                    api, export, canvas overlay, idb, presets, colors, media, format, order, title
client/src/types.ts                editor types
client/vite.config.ts              @shared alias, proxy, port 5173
server/src/index.ts                HTTP API and static client
server/src/jobs.ts                 single-file render queue
server/src/render.ts               FFmpeg filter graph
server/src/storage.ts              clip registry and tmp dirs
server/src/probe.ts                ffprobe
server/src/oembed.ts               YouTube/TikTok title lookup
server/src/binaries.ts             ffmpeg/ffprobe paths
shared/frame.ts                    output sizes, fps, banner math
shared/timeline.ts                 trim length, fade cap, sequence length
shared/urls.ts                     YouTube, TikTok, Instagram URL parsing
server/tmp/                        clips, jobs, outputs, incoming, registry.json
```

Stack: Vue 3 `<script setup>`, Pinia, Tailwind 4 (`client/src/style.css` via `@tailwindcss/vite`), Lucide icons, Fontsource (Inter, Anton, Oswald, Bebas Neue, Montserrat). Server: Express 5, Multer, cors. Client path alias `@shared` → `../shared`.

## Screen

`App.vue` is a full-viewport column: header, optional mobile tabs, a grid, then `TimelineBar`.

- Header: New project, renderer status (`GET /api/health`). Green means FFmpeg is present.
- `xl` and up: clips `350px`, preview flex, style `350px`. Selecting a clip opens `SelectedClipPanel` (`280px`) between the list and the preview.
- Below `xl`: tabs Clips / Preview / Style. The selected-clip panel is part of the Clips tab.
- Space toggles play unless focus is in an input, textarea, select, or contenteditable.
- Toasts stack at the bottom right (max 4, auto-dismiss ~5.2s).
- A blocking overlay says "Restoring saved project…" until `hydrated`.
- Dev only: `window.__vvr` is the Pinia store.

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

IndexedDB database `vvr`, version 1, stores `meta`, `files`, `music` (`client/src/lib/idb.ts`).

- `meta/project` is `SavedProject` version 1: name, title, spans, style, preset, clips, musicName. Saved 400ms after those fields change, once hydrated.
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

Unknown `/api` routes return 404 JSON. If `client/dist/index.html` exists, Express serves it and falls back to `index.html` for non-API paths.

`POST /api/clips` probes the file, rejects duration over 20 minutes, and stores it under a new UUID. The client may already have a browser duration; the server duration replaces it, and user trims are clamped rather than wiped when the user had already trimmed.

## Files on disk

`server/tmp/` (created on boot):

- `clips/` and `registry.json` — uploaded sources. Registry rows whose files are missing are dropped on load.
- `incoming/` — Multer landing pad.
- `jobs/<id>/` — overlays and music for the active render. Removed when the job ends.
- `outputs/<id>.mp4` — finished files.

Sweep every 10 minutes: outputs older than 2 hours, jobs and incoming older than 6 hours, clips older than 7 days (unless a render holds them).

## Limits

- 30 clips, 20 minutes each, 30 minutes per compilation, 500 MB per video, 40 MB per music or overlay file.
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

## Invariants

- Preview paint and export PNGs both call `drawOverlay` + `overlayRanks`. Change ranking math in `format.ts` / `order.ts`, not in the Vue files.
- Duration math lives in `shared/timeline.ts`. The server and the preview both import it.
- Banner and frame size live in `shared/frame.ts`. Do not duplicate the 42% / even-pixel rules.
- Export clip order is playback order. Rank numbers stay tied to list index.
- Only one clip has `playAtEnd`.
- Do not download social video. `canDownload` is always false.
- Do not write secrets into source. This app has no API keys.

## Changelog

- 2026-10-22 — Documented Hostinger production URL and added `hostinger-vvr-deploy` skill for archive-based redeploys.
- 2026-10-22 — Timeline uses one export button (progress fill, hover-to-cancel, download when ready); project edits after export clear the ready state.
- 2026-10-22 — Ranking overlay keeps list order when sort is “As listed”; `playAtEnd` affects playback only, not stack position.
- 2026-10-22 — Created this map from the current client, server, and shared code. No product behavior changed.
