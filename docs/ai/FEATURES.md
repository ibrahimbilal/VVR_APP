# Features

Verified product surfaces and where they live. Deep detail: `.cursor/skills/ribo-project/` topic files.

## Platform

- Multi-app shell with sidebar, header, notifications, renderer health, New project — `App.vue`, `components/layout/`, `stores/platform.ts`.
- Dashboard cards from `navItems` — `client/src/app/navigation.ts`, `views/`.
- Shared export notifications / cancel / download — `AppNotifications.vue`, `renderNotifications.ts`, `managedExportJobs.ts`.
- Reload recovery for active FFmpeg jobs — `persistedRenderJobs.ts`, `resumePersistedRenderJobs.ts`, `GET /api/jobs/active`.

## Shorts — Ranking

- Up to 30 clips (local or link title-only); reorder, trim, rank colors, play-at-end — `stores/project.ts`, `ClipSidebar.vue`, `SelectedClipPanel.vue`.
- Banner word spans + presets — `StylePanel.vue`, `lib/presets.ts`, `lib/title.ts`.
- Canvas overlay preview + MP4 export — `PreviewStage.vue`, `usePlayback.ts`, `drawOverlay.ts`, `exportJob.ts`, `server/src/render.ts`.
- Links never download video (`canDownload: false`).

## Shorts — Image Motion

- Still images → pan motion + transitions + optional music — `apps/image-motion-shorts/`, `shared/imageMotion*.ts`, `renderImageMotion.ts`.
- Mode toggle with Ranking on `/shorts` — `ShortsModeBar.vue`, `RankingVideosView.vue`.

## Screensaver

- Long-form 16:9 from image or looping video; composition, frames, adjustments — `apps/frame-screensaver/`, `shared/screensaverComposition.ts`.
- Export: Fast VFR or Optimized CFR — `renderScreensaver.ts`, `renderScreensaverHybrid.ts`, `screensaverCfr/`.
- Optional subscribe animation overlay — `shared/screensaverSubscribeAnimation.ts`, hybrid/CFR paths.
- Multi-project IndexedDB library — `screensaverProjectLibrary.ts`.
- Create Thumbnail / Send to Image Motion — `createThumbnail.ts`, `sendToImageMotion.ts`.

## Thumbnail Studio

- Browser-only 16:9 badges (resolution + duration) — `apps/thumbnail-studio/`, `renderThumbnail.ts`.
- Transfer from Screensaver — `stageTransfer.ts`, `shared/thumbnailTransfer.ts`.
- No FFmpeg; PNG/JPEG download only.

## Image Upscaler

- Two-stage upscale (Sharp Lanczos3 default; optional Real-ESRGAN) then export fit — `apps/image-upscaler/`, `imageUpscaler*.ts`, `realesrgan*.ts`.
- Batch, ZIP, re-export, Send to Screensaver — store + routes under `/api/image-upscaler/*`.
- Not persisted to IndexedDB. Docs: `docs/image-upscaler.md`.

## Audio Looper

- Loop audio to exact duration (Simple / Seamless; playlist crossfade) — `apps/audio-looper/`, `shared/audioLooper*.ts`, `renderAudioLooper.ts`.
- Shares FFmpeg queue as `kind: 'audio-looper'`. Formats MP3/WAV/FLAC.

## Cross-cutting

| Feature | Location |
| --- | --- |
| Design system | `client/src/style.css`, `docs/ui-design-system.md` |
| File drop / status / toggles | `FileDropZone.vue`, `FileStatusBox.vue`, `ToggleSwitch.vue` |
| Audio fields | `client/src/components/audio/` |
| Card reorder drag | `composables/useCardReorder.ts` |
| URL / oEmbed import | `shared/urls.ts`, `server/src/oembed.ts` |
| Encoder probe | `server/src/encoders.ts`, `GET /api/encoders` |
