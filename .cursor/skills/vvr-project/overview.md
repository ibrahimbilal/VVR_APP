# Video's Factory — deep overview

Local **Video's Factory** platform with five apps:

1. **Shorts** (legacy VVR) — 9:16 ranking compilation editor plus **Image Motion Shorts** (landscape stills → animated vertical video).
2. **Screensaver** — long-form 16:9 ambient video from one image or looping video.
3. **Thumbnail Studio** — browser-only YouTube thumbnail tool. Upload an image or take one from Screensaver, then place a resolution badge and a duration badge. It does not call FFmpeg.
4. **Image Upscaler** — PNG, JPEG, and WebP through a **two-stage** pipeline: upscale to a lossless intermediate PNG (`mid/`), then export fit to preset pixels (default 4K). Standard is Sharp Lanczos3; optional AI Lite runs Real-ESRGAN at native 4× then resizes to the effective scale (auto or 1–4×). Re-export skips upscale when only export settings change. See `docs/image-upscaler.md`.
5. **Audio Looper** — one or more audio files repeated to an exact duration (60s–12h, same presets and default as Screensaver) as MP3, WAV, or FLAC. One file keeps Simple `-stream_loop` and Seamless equal-power cycle. Two or more add trim, order, optional crossfade, and optional loudness, then stream one PCM cycle. Shares the FFmpeg job queue as `kind: 'audio-looper'`.

Ranking behavior is unchanged in substance: upload clips (or link titles only), order, style banner and ranks, preview, export MP4.

There are no accounts and no cloud project storage. The editor is a Vue app. The renderer is Express with bundled FFmpeg. **Production** runs on Hostinger Node.js at `https://videos.ibrahimbilal.com` (deploy steps: `.cursor/skills/hostinger-vvr-deploy/SKILL.md`). Local dev still uses separate Vite (5173) and API (3001) processes.

## Layout

```
client/src/App.vue                      platform shell (sidebar, header, toasts)
client/src/style.css                    design tokens and shared control classes (see docs/ui-design-system.md)
client/src/components/ui/               AppDialog, AppMobileTabs, AppSettingsTabs, AppExportAction, AppExportStatusPanel, AppStudioExportBar, AppEmptyState, AppPanel
client/src/app/router.ts                /, /shorts, /screensaver, /thumbnails, /upscale, /looper
client/src/stores/platform.ts           renderer health, global toasts, nav UI
client/src/stores/project.ts            ranking editor state
client/src/apps/ranking-videos/         RankingVideosView (editor layout)
client/src/apps/frame-screensaver/      screensaver view, store, components
client/src/apps/thumbnail-studio/       thumbnail view, store, canvas renderer, transfer
client/src/apps/image-upscaler/         upscaler view, store, comparison, batch UI
client/src/apps/audio-looper/           audio looper view, store, preview, settings
server/src/imageUpscaler.ts             Lanczos3 Sharp engine and the shared final fit
server/src/realesrganEngine.ts          optional Real-ESRGAN NCNN Vulkan engine
server/src/realesrganConfig.ts          AI binary/model checks and env vars; standalone `tools/realesrgan/` discovery
server/src/realesrganStandalone.ts    project-root + bundled engine path resolution
server/src/projectRoot.ts               finds repo root (`vvr-app` package.json)
server/src/imageUpscalerJobs.ts         sequential image jobs, separate from FFmpeg
tools/realesrgan/                      optional NCNN runner + models (gitignored); see MANIFEST.json
server/src/imageUpscalerRoutes.ts       `/api/image-upscaler/*`
shared/imageUpscaler.ts                 presets, limits, options, filenames
shared/audioLooper.ts                   formats, duration, loop modes, playlist fields
shared/audioLooperPlaylist.ts           playlist period, crossfade limit, repeats
server/src/audioLooperRoutes.ts         `/api/audio-looper/export` and `/preview`
server/src/renderAudioLooper.ts         Simple stream_loop and Seamless cycle encode
client/src/components/layout/           AppSidebar, AppHeader, MobileNavDrawer
client/src/composables/usePlayback.ts     ranking preview clock
client/src/components/                  ranking panels (ClipSidebar, PreviewStage, …)
client/src/lib/                         api, exportJob, jobPoll, idb, drawOverlay, …
server/src/jobs.ts                      one queue; ranking + screensaver + audio-looper job kinds; per-job `outputExt`
server/src/render.ts                    ranking FFmpeg graph
server/src/renderScreensaver.ts         screensaver FFmpeg graph
server/src/ffmpegUtil.ts                shared spawn/progress/verify helpers
shared/screensaver.ts                   16:9 outputs, duration limits
shared/frame.ts, shared/timeline.ts     ranking-only layout and timing
server/tmp/                             clips, jobs, outputs, incoming, registry.json
```

## Platform shell

`App.vue`: left sidebar (desktop). The logo, **Video's Factory** name, and header page title link to the dashboard. Header also has **notifications** (bell, left of renderer status), renderer status (`GET /api/health`), **New project** on Shorts, Screensaver, Thumbnail Studio, Image Upscaler, and Audio Looper (`AppHeader.vue`, `AppNotifications.vue`), `router-view` with a short page fade/slide (`Transition` name `page`), global toasts (`usePlatformStore`). The active sidebar/mobile nav item uses `.nav-link--active` (one-shot brand pulse). Dashboard cards stagger in with `.dash-enter`. The notification panel uses `.notif-panel-enter` on open; rows use `.notif-item-*` enter/leave/move. Dialogs fade the backdrop and lift the card (`.dialog-*`). Motion lives in `client/src/style.css` and respects `prefers-reduced-motion`. Finished Shorts, Screensaver, and Audio Looper renders are listed in the header notification panel (`renderNotifications.ts`, `platform.ts`). Screensaver notices include the project id. **Open** on a Screensaver notice loads that project; a missing id still just opens the app, and a deleted id shows a toast instead of another project. Failed and cancelled Screensaver renders stay in the panel so Open can restore them. Rows use the same Lucide icons as the sidebar app (`renderAppIcon`). Ready rows stay after **Download**; only **Dismiss** removes them. In-progress rows show a progress bar, icon **Cancel** (left of the percent), remaining time from `etaSec`, and an icon **Open** link to the app (`renderJobTracking.ts` syncs ETA from export poll state). After a full page reload, active server jobs are restored from `localStorage` (`persistedRenderJobs.ts`) and from `GET /api/jobs/active`, then polling resumes in `resumePersistedRenderJobs.ts` (header bell shows progress again; finished-while-away jobs appear as ready downloads).

- Routes: `/` dashboard, `/shorts`, `/screensaver`, `/thumbnails`, `/upscale`, `/looper` (one-word paths matching the sidebar labels). Legacy `/ranking-videos`, `/frame-screensaver`, `/thumbs`, `/thumbnail-studio`, `/image-upscaler`, and `/audio-looper` redirect. SPA fallback in production. Dashboard cards read `description` from `navItems` in `client/src/app/navigation.ts`. Sidebar label for the thumbnail app is **Thumbnails**.
- Mobile: hamburger opens left drawer. Desktop navigation is a compact icon rail (`AppSidebar.vue`). Shorts uses Clips / Preview / Edit tabs below `xl`, and the editor inspector switches Clip, Look, and Sound. Screensaver and the other editors keep their own workspace panels.
- Surfaces, buttons, fields, dialogs, and toasts use the tokens and classes in `client/src/style.css`. The header notification panel uses `.notif-panel-enter` on open and `.notif-item-*` for row enter/leave. Confirmations that replace an open picture use `AppDialog` (Escape and the backdrop call the existing keep/cancel action). Export buttons share `AppExportAction`; each app still calls its own store. Shorts, Screensaver, and Audio Looper put status + export under the preview with `AppStudioExportBar`.

## Where to change things

| Task | Open |
| --- | --- |
| Layout, tabs, header, toasts, render-ready notifications | `client/src/App.vue`, `client/src/style.css`, `client/src/components/layout/AppNotifications.vue`, `client/src/lib/renderNotifications.ts`, `docs/ui-design-system.md` |
| Shared dialogs, mobile tabs, settings tabs, export button, export status panel, studio export bar, empty state, panels | `client/src/components/ui/` |
| Settings accordion expand/collapse | `client/src/components/SettingsAccordion.vue`, `client/src/style.css` |
| Shared file drop / browse upload | `client/src/components/FileDropZone.vue` |
| Create Thumbnail + link toggle, send still to Image Motion | `client/src/components/CreateThumbnailAction.vue`, `client/src/apps/frame-screensaver/lib/sendToImageMotion.ts` |
| Shared audio upload + advanced sliders | `client/src/components/audio/` (`AudioFileField.vue`, `AdvancedAudioControls.vue`, `SourceClipAudioControls.vue`) |
| Clip list, URL add, drag reorder | `client/src/components/ClipSidebar.vue`, `client/src/composables/useCardReorder.ts` |
| Trim, colors, play-last, replace | `client/src/components/SelectedClipPanel.vue` |
| Presets, banner, ranks, video, audio controls | `client/src/components/StylePanel.vue` |
| Preview stage and controls | `client/src/components/PreviewStage.vue` |
| Play, seek, crossfade, music | `client/src/composables/usePlayback.ts` |
| Export button | `client/src/components/ExportActionButton.vue` |
| Export status panel | `client/src/components/ui/AppExportStatusPanel.vue`, `client/src/components/RankingExportDetails.vue`, `client/src/apps/frame-screensaver/components/ScreensaverExportDetails.vue` |
| Add/remove/reorder/persist/export actions | `client/src/stores/project.ts` |
| Types | `client/src/types.ts` |
| Rank labels, sort, page vs stack | `client/src/lib/format.ts`, `client/src/lib/order.ts` |
| Word colors | `client/src/lib/title.ts` |
| Painted banner and numbers | `client/src/lib/drawOverlay.ts` |
| PNG build, submit, and job polling | `client/src/lib/exportJob.ts`, `client/src/lib/exportQueueRunner.ts`, `client/src/lib/managedExportJobs.ts`, `client/src/lib/exportState.ts`, `client/src/lib/exportFingerprint.ts` |
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
| Screensaver editor, export, frames, subscribe overlay | `client/src/apps/frame-screensaver/`, `shared/screensaver.ts`, `shared/screensaverComposition.ts`, `shared/screensaverFrames.ts`, `shared/screensaverAdjust.ts`, `shared/screensaverSubscribeAnimation.ts`, `server/src/frames.ts`, `server/src/youtubeChannel.ts` |
| Thumbnail editor, transfer, export | `client/src/apps/thumbnail-studio/`, `shared/thumbnailProject.ts`, `shared/thumbnailTransfer.ts`, `shared/thumbnailLayout.ts`, `client/src/lib/idb.ts` |
| Image Upscaler | `client/src/apps/image-upscaler/`, `shared/imageUpscaler.ts`, `server/src/imageUpscaler.ts`, `server/src/realesrganEngine.ts`, `server/src/realesrganConfig.ts`, `server/src/realesrganStandalone.ts`, `server/src/projectRoot.ts`, `server/src/nativeProcess.ts`, `server/src/imageUpscalerJobs.ts`, `server/src/imageUpscalerRoutes.ts`, `tools/realesrgan/` (optional native files, gitignored), `scripts/ai-lite-env.cjs`, `scripts/ai-lite-platform.cjs`, `scripts/launch-linux.sh`, `scripts/setup-ai-lite.mjs`, `docs/image-upscaler.md` |
| Audio Looper | `client/src/apps/audio-looper/`, `shared/audioLooper.ts`, `server/src/renderAudioLooper.ts`, `server/src/audioLooperRoutes.ts`, `server/src/jobs.ts` |
| Screensaver encode and encoder probe | `server/src/renderScreensaver.ts`, `server/src/renderScreensaverHybrid.ts`, `server/src/screensaverCfr/` (Optimized CFR engine), `server/src/screensaverGraph.ts`, `server/src/encoders.ts`, `shared/screensaverSubscribeAnimation.ts`. PoC retained: `server/scripts/poc-optimized-cfr.ts` |

## Invariants

- Preview paint and export PNGs both call `drawOverlay` + `overlayRanks`. Change ranking math in `format.ts` / `order.ts`, not in the Vue files.
- Duration math lives in `shared/timeline.ts`. The server and the preview both import it.
- Banner and frame size live in `shared/frame.ts`. Do not duplicate the 42% / even-pixel rules.
- Export clip order is playback order. Rank numbers stay tied to list index.
- Only one clip has `playAtEnd`.
- Do not download social video. `canDownload` is always false.
- Do not write secrets into source. This app has no API keys.
