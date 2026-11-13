# Shorts — Ranking (deep)

`RankingVideosView.vue`: **Shorts mode** toggle (`Ranking Shorts` | `Image Motion Shorts`, persisted in `localStorage` key `vf-shorts-mode`). Each mode has its own Pinia store and IndexedDB project (`meta/ranking-videos` vs `image-motion` store v4). Space toggles play in **Ranking** mode only.

**Ranking Shorts** — `RankingVideosView.vue` (ranking branch): optional mobile tabs, editor grid. The center column is preview stage plus a `studio-panel` under it (clip/export status, Export MP4), same pattern as Screensaver and Audio Looper. New project lives in the platform header.

- `xl` and up: clips `300px`, preview flex, style `360px`. The right panel is titled Settings and switches Clip, Style, Output, and Sound. Video settings (resolution, fps, encoder, scaling, transition) live under Output; Style keeps presets, colors, title, and ranking. The selected clip panel sits in that column.
- Space toggles play on the ranking route only (not in inputs).
- Hydration overlay until ranking `hydrated`.
- Dev: `window.__vvr` is the ranking Pinia store.

**Image Motion Shorts** — `client/src/apps/image-motion-shorts/`: import up to 30 PNG/JPEG/WebP images, per-segment Full Pan or Slow Cinematic Pan (shared math in `shared/imageMotion.ts`), cut/crossfade joins, optional background audio, canvas preview (`useImageMotionPlayback.ts`), export via `POST /api/image-motion/export` and FFmpeg `renderImageMotion.ts` (`jobs` kind `image-motion`). Defaults: 1080×1920, 30 fps, CPU encoder, 10 s per image, Full Pan RTL, 0.5 s crossfade between images.

## What the user can do

1. Add up to 30 local files (MP4, MOV, WebM, m4v) or a recognized link.
2. Reorder by drag. The card lifts and tilts under the pointer, and the other cards slide to open the drop gap. The same drag is used for Image Motion stills and Audio Looper tracks. Edit a clip title in the sidebar. Select a clip to trim, recolor its number and title, replace the file, or mark it "Play at the end".
3. Edit the banner sentence. Each word is a span with its own color. A newline in the title sets `breakBefore` on the first word of the next line.
4. Pick a preset (Classic Ranking, Tier List, Minimal) or keep Custom. Style banner, ranking, video, and audio.
5. Play the preview. Banner and ranks stay painted on a canvas while `<video>` elements play underneath.
6. Export MP4. Queue multiple exports (each click snapshots the current project); the server encodes one at a time. Download starts only after the server verifies the file. Shorts and Screensaver **Export MP4** / **Queue export** buttons only enqueue work; progress, cancel, and download live in the header notification panel (`AppNotifications.vue`). Thumbnail **Download Thumbnail** only runs the browser export (no progress on the button).

A link stores a title and thumbnail when the platform allows it. It does not download the video. `uploadState: 'empty'` until the user attaches a file. Instagram never fetches a title (no Meta token).

## Editor state

`useProjectStore` in `client/src/stores/project.ts` is the only project store.

Reactive: `name`, `titleText`, `spans`, `style`, `activePreset`, `clips`, `selectedClipId`, `selectedPanelOpen`, `colorSets`, `activeColorSetId`, `musicUrl`, `musicName`, `serverOnline`, `hydrated`, `exportState`, `toasts`, `urlNotice`.

Module-level (not reactive): `fileMap` (clip id → File), `musicFile`, `applying` (suppresses the preset→custom watcher). Export jobs live in `useManagedExportJobs()` inside the store.

Export is blocked (`exportBlocker`) when the renderer is offline, there are no clips, any clip is uploading / empty / error, any kept span is under 0.3s, or the export payload matches the last enqueued export with no edits since (`exportFingerprint.ts`). An export already running does not block another unless the project is unchanged; up to 12 jobs can be queued per app (`managedExportJobs.ts`, `exportQueueRunner.ts`).

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
- Ranking: **visible** (off = hide rank numbers on the overlay; clip titles can still show), font, size, weight, color, itemSpacing (0–100, treated as a percent of font size), positionX/Y, outline, shadow, opacity, format (`dot | plain | hash | pad` → `1.` / `1` / `#1` / `01`), display (`stack` = all numbers, `page` = current only), pageStyle (`fraction` = `1 / N`, `number` = the format), showPreviousTitles, **titleHideAfter** (seconds; 0 = off — hides only the **current** clip title after that time in preview and export), sort (`list | reverse | title | titleDesc`). Style / Output panels: master toggles stay visible; dependent controls hide when off (**Title** banner, **Ranking** numbers/titles, **Presets** number display, **Video** crossfade under Output — same pattern as **Audio** keep-original). Export with **titleHideAfter** sends a second PNG per clip (`overlay-N-late.png`); FFmpeg switches overlays at that timestamp (`render.ts`).
- Caption styles the clip title drawn beside the rank number. `caption.bottom` is stored and scaled on resolution change. The canvas does not read it.
- Video: width, height, fps, scaleMode (`crop | fit | blur`), backgroundColor, transition (`cut | fade`), fadeDuration, keepAudio, normalize, originalVolume, musicVolume (0–1), encoder (`cpu` default for a new project, same choices as Screensaver). Saved projects keep their stored encoder.
- Presets: `classic | tier | minimal | custom`. Definitions and default video (1080×1920, 30 fps, crop, cut, fade 0.35, keep audio, normalize, music 0.35) are in `client/src/lib/presets.ts`. Fonts: Oswald, Anton, Bebas Neue, Montserrat, Inter.
- Rank number colors default to the active color set. `null` on a clip means "use the ranking color". Title color `null` means "use the caption color".

Color sets live outside the project: `localStorage` key `vvr-color-sets` (`client/src/lib/colorSets.ts`). Defaults: Classic, Warm, Cool, Mono. Max 12 hex colors, at least one set, at least one color. Preset apply cycles ranks only for Tier List.

## Persistence

See [persistence.md](persistence.md) (IndexedDB `vvr` v4, ranking/screensaver/thumbnail keys, New project vs upload cleanup).

## Order, ranks, and time

Two orders:

- List order is the sidebar. Rank numbers follow list index (`formatRank`), not playback position.
- Playback order (`client/src/lib/order.ts`) is list order with the single `playAtEnd` clip moved to the end. Preview, timeline blocks, and the export clip list all use this order.

`rankingRows` (`client/src/lib/format.ts`) builds the painted list: list order by default, or sort (`reverse`, title A–Z, title Z–A). `playAtEnd` does not move a row on the overlay; only playback order changes. `overlayRanks` paints every row in stack mode. In page mode it paints one row. With "Show previous titles", a stack row shows its title when it is the current clip or an earlier playback clip. **titleHideAfter** drops the current clip title once `clipLocalTime` reaches that threshold (previous titles unchanged).

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

`PreviewStage.vue` sizes the player with CSS `aspect-ratio` from export width/height, then scales the 1080×1920 (or 720×1280) stage to fit. Image Motion Shorts preview uses the same pattern (`ImageMotionPreview.vue`). The video box starts at `bannerHeight` and is `videoHeight` tall. Crop uses `object-fit: cover`. Fit and blur use `contain`. Blur shows the background video with a CSS blur. The canvas is full frame and calls `drawOverlay` with the active clip's list index.

`frameMetrics` (`shared/frame.ts`) is the shared layout: even banner height, min 80, max 42% of frame height, video height even. A height of 0 means no banner. Preview, `startExport`, and `runExport` all pass 0 when `banner.visible === false`, so the video fills the frame in both places. The Title section has a Show title toggle. `drawOverlay` also skips the banner rectangle when `visible` is false.

## Canvas overlay

`client/src/lib/drawOverlay.ts` draws the PNG used by both preview and export.

- `ensureFonts()` loads the Fontsource faces before the first paint.
- Banner rectangle, then wrapped word spans. Size shrinks (down to 28px) until the block fits. Alignment is left, center, or right. Outline and shadow via `paintText`.
- Ranks are clipped to the area below the banner. They stack from `bannerHeight + positionY`. `fitRankSize` shrinks the font (down to 28px) so every row fits. Item spacing adds `itemSpacing%` of the font size to the line gap. Opacity is clamped to 0.15–1.
- A row title is drawn to the right of the number, in the caption font, ellipsized. Per-clip `titleColor` wins over the caption color.

## Export

`startExport` in the store checks the blocker, warns above 5 minutes, snapshots clips/style/spans/music, and enqueues work (`client/src/lib/managedExportJobs.ts`). The queue runs one browser prep/upload at a time, then polls each server job in parallel while FFmpeg still encodes sequentially. Each job uses `submitRankingExport` (`client/src/lib/exportJob.ts`):

1. `overlays` — one full-frame PNG per clip in playback order. `overlayRanks` receives format, display, page style, showPreviousTitles, and sort. Progress ~2–8%.
2. `uploading` — multipart `POST /api/export`. Field `project` is JSON. Fields `overlays` are `overlay-0.png` … in the same order. Field `music` is sent only when a file exists and `musicVolume > 0`. Progress ~9–16%.
3. Poll `GET /api/jobs/:id` every 700ms. Abort calls `POST /api/jobs/:id/cancel`.
4. On `done`, download `GET /api/jobs/:id/download` with the project name, else the banner text, else `ranking.mp4`. Download does not remove server uploads.
5. Closing the tab or window runs `POST /api/uploads/cleanup` (beacon) to purge server clips, frames, leftover `jobs/` work dirs, and export outputs. Editor state stays in IndexedDB. Job dirs for a render that is still queued or encoding are kept.

Project JSON clips are `{ id: serverId, trimStart, trimEnd }` in playback order. The server does not know titles or rank colors. Those exist only in the PNGs.

Server `parseProject` requires 1–30 clips, UUID ids, 1080×1920 or 720×1280, fps 24/30/60, hex banner and background, scale and transition enums, trim ≥ 0.3s, sequence ≤ 30 minutes. Overlay count must match clips and each PNG must match the output size.
