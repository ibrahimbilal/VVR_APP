# Video's Factory

A local web platform for video production. It hosts independent editor apps in one shell:

- **Ranking Videos** — 9:16 ranking and compilation videos (the original VVR editor).
- **Frame Screensaver** — long-form 16:9 ambient videos from a single image or looping video clip.
- **Thumbnail Studio** — browser-only YouTube thumbnails: upload an image or pull one from Ranking Videos or Frame Screensaver, place resolution and duration badges, download PNG or JPEG (no FFmpeg).

There are no accounts and no cloud project storage. The Vue client talks to an Express renderer with bundled FFmpeg. Thumbnail Studio runs entirely in the browser.

Production: [https://videos.ibrahimbilal.com](https://videos.ibrahimbilal.com) (also [https://vvr.ibrahimbilal.com](https://vvr.ibrahimbilal.com)). Deploy steps: `.cursor/skills/hostinger-vvr-deploy/SKILL.md`.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- About 1 GB free for dependencies and temporary media
- Ports `5173` (dev client) and `3001` (API) in local development

FFmpeg and ffprobe ship with the server package (`ffmpeg-static`, `ffprobe-static`).

## Setup

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

On Windows, `npm run launch` starts the same dev stack and opens the browser once Vite is ready. Optional **`Video Factory.exe`** in the repo root (build with `npm run build:launcher`) wraps the same flow; Node and npm must still be on `PATH`.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | API + Vite dev server with hot reload |
| `npm run launch` | Dev stack + open browser (Windows-friendly) |
| `npm run build:prod` / `npm run start:prod` | Production client build + server bundle |
| `npm run typecheck` | Client and server TypeScript |
| `npm run test:screensaver` | Short static-image screensaver render + ffprobe check |
| `npm run test:ranking` | Two-clip ranking render + ffprobe check |
| `npm run test:thumbnail` | Thumbnail document contract tests |
| `npm run frames:thumbs -w client` | Regenerate 150px Frame Screensaver picker thumbs after editing `client/src/assets/frames/*.png` |

More scripts (benchmarks, visual tests) are listed in `.cursor/skills/vvr-project/PROJECT.md`.

## Architecture

```
client/src/
  App.vue                 Platform shell (sidebar, header, notifications, toasts)
  app/router.ts           Routes: /, /ranking-videos, /frame-screensaver, /thumbnail-studio
  apps/ranking-videos/    Ranking editor view + components
  apps/frame-screensaver/ Frame Screensaver editor
  apps/thumbnail-studio/  Thumbnail editor (canvas + badge SVGs)
  stores/platform.ts      Renderer health, global toasts, navigation UI
  stores/project.ts       Ranking project state
server/src/
  index.ts                HTTP API
  jobs.ts                 Single render queue (ranking + screensaver jobs)
  render.ts               Ranking FFmpeg pipeline
  renderScreensaver.ts    Screensaver FFmpeg pipeline
shared/
  frame.ts, timeline.ts   Ranking layout and timing
  screensaver.ts          Screensaver resolutions, durations, limits
  thumbnailProject.ts     Thumbnail document and export sizes
```

### Routes

- `/` — Dashboard with app cards
- `/ranking-videos` — Ranking editor
- `/frame-screensaver` — Screensaver editor
- `/thumbnail-studio` — Thumbnail editor

Direct URLs and refresh work in production; Express serves `client/dist` with SPA fallback.

### Persistence

- **Ranking** — IndexedDB `vvr` v2, key `meta/ranking-videos` (migrated from legacy `meta/current`). Clip files and music unchanged.
- **Frame Screensaver** — IndexedDB `screensaver` store (`project`, `source`, `audio`). Ranking “New project” does not clear screensaver data.
- **Thumbnail Studio** — In-memory while you navigate inside the app; a full page reload resets to defaults.

### Rendering

One FFmpeg job runs at a time globally. Ranking and Frame Screensaver share `GET/POST /api/jobs/:id` for progress, cancel, and download. Each app can queue up to 12 exports; finished jobs also appear in the header notification panel.

Screensaver limits (also enforced on the server):

- Output: 1920×1080, 2560×1440, or 3840×2160; 1, 24, 30, or 60 fps
- Duration: 30 minutes to 10 hours (presets or custom minutes in the UI)
- Source: one image (static) or one video (loop); optional background audio

## Ranking Videos

Upload clips (or link titles only), order and trim, style banner and ranks, preview, export MP4. Queue multiple exports from one project; the server encodes one job at a time. See `.cursor/skills/vvr-project/PROJECT.md` for file-level detail.

## Frame Screensaver

1. Upload a JPG, PNG, WebP, MP4, MOV, or WebM file.
2. Place the image on the canvas: drag, scale from the corners, rotate, and crop. The original file is kept. Fit, fill, and center change the export. The zoom slider only changes the view.
3. Pick a frame from the bundled PNG set or upload your own. Bundled frames ship in `client/src/assets/frames/`; the picker uses smaller thumbs, preview and export use the full PNG. Uploaded frames are stored on the server (40 MB max). Click a thumbnail to lay it over the picture; transparent areas stay open. Click it again to clear it.
4. Adjust brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpness, blur, grayscale, and sepia. Each slider resets on its own, or reset them all. Before/after compares with the adjustments off.
5. Choose duration, resolution, a profile, and an encoding method. New static images use Static Art at 1 fps. Auto uses a hardware encoder only after a short timed test beats libx264. If a hardware encoder you picked cannot start, the job stops and offers CPU.
6. Optionally add audio (source track or upload) with volume and fades.
7. Export MP4. The panel shows stage, encoder, speed, and remaining time from FFmpeg’s progress output. Download starts after the file is checked.

Static images are drawn once at the output size and then looped. A matching H.264 video with no crop, frame, or color change is copied instead of re-encoded. Undo is Ctrl+Z or Cmd+Z. Redo is Ctrl+Shift+Z or Cmd+Shift+Z. Arrow keys nudge the image when the canvas is focused.

Long 4K exports can still take a long time. The size estimate is an extrapolation from short local encodes, not a bitrate guarantee. Measured times are in `.cursor/skills/vvr-project/PROJECT.md`.

## Thumbnail Studio

1. Open an image (PNG, JPEG, or WebP) or use **Create Thumbnail** from Frame Screensaver or a still from Ranking Videos.
2. Toggle resolution and duration badges, pick catalog labels, style, size, and position (drag or presets).
3. **Download Thumbnail** as PNG or JPEG at 720p, 1080p, or 4K. No server render.

Transfers from screensaver or ranking can pre-fill badge text from output resolution and duration. Badge artwork is SVG under `client/src/assets/thumbnail-badges/`.

## Adding another app

1. Add a route in `client/src/app/router.ts` and an entry in `client/src/app/navigation.ts`.
2. Create `client/src/apps/<app-name>/` with its own view, store, and components.
3. Add API routes under a dedicated prefix (e.g. `/api/my-app/...`) if server rendering is needed.
4. Register new job types in `server/src/jobs.ts` if the app exports video.

## Migration from single-app VVR

- Saved ranking projects load automatically (`current` → `ranking-videos`).
- Bookmark `/ranking-videos` instead of `/` for the editor.
- No change to ranking export API (`POST /api/export`).

## Limitations

- One render queue for the whole platform (ranking + screensaver only).
- Server temp files expire on the existing schedule (`server/tmp`).
- Smooth video loops encode one crossfaded cycle and then copy it when that file is valid; otherwise the export falls back and says so.
- Stream copy is only used for H.264 yuv420p sources that already match the output and have no crop, rotation, frame, or color change.
- 1 fps is the default for new static images. Some players want 24 or 30; both are still available.
- Video color adjustments use FFmpeg filters with the same slider values. A moving preview can differ slightly from the file because the canvas blur is not `gblur`. Static exports are the editor bitmap.
- Preview does not play the full multi-hour timeline; duration is applied at export.
- Auto will not silently replace an encoder you picked. It does fall back to CPU when Auto itself fails.
