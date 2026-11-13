# Run

Node `^20.19.0 || >=22.12.0`. From the repo root:

- `npm install` — installs both workspaces. FFmpeg and ffprobe come from `ffmpeg-static` and `ffprobe-static`. No system FFmpeg.
- Optional repo-root **`.env`** — copy `.env.example` to `.env`; the server loads it on startup (does not override existing env vars). `npm run launch` / `Video factory.exe` merge `.env` into the dev child process too. **`Video factory.exe`** may run **`npm run setup:ai-lite`** when AI is enabled and `tools/realesrgan/` is incomplete (Windows, needs network).
- `npm run dev` — renderer on `127.0.0.1:3001` (`tsx watch`) and editor on `127.0.0.1:5173` (Vite). Vite proxies `/api` to 3001 with no timeout.
- **Dev launchers:** `npm run launch` (`scripts/launch-dev.cjs`) on all platforms; **`npm run launch:linux`** (`scripts/launch-linux.sh`) on Ubuntu for the same stack plus optional `setup:ai-lite`. Both enable Image Upscaler **AI Lite** when `tools/realesrgan/<win-x64|linux-x64>/` and shared `models/upscayl-lite-4x` exist (`scripts/ai-lite-env.cjs`, `scripts/ai-lite-platform.cjs`, host = `process.platform` + `process.arch`). **`Video Factory.exe`** (Windows): waits for **`http://127.0.0.1:5173/`**, browser, single-instance mutex; **`npm run build:launcher`** (.NET 8 SDK on the build machine only).
- `npm run typecheck` — client `vue-tsc` via `client/scripts/typecheck.mjs`, then server `tsc --noEmit`.
- `npm run test:screensaver` — short static screensaver render + ffprobe (`server/scripts/verify-screensaver.ts`).
- `npm run test:screensaver-subscribe` — hybrid subscribe animation render + ffprobe frame budget (`server/scripts/verify-screensaver-subscribe.ts`; use `RIBO_SCREENSAVER_TEST=1` for short duration).
- `npm run test:screensaver-cfr` — Optimized CFR unit + integration tests and VFR duration regression (`server/scripts/verify-screensaver-cfr.ts`).
- `npm run bench:screensaver-cfr` — CFR quality / segment planner bench (`docs/screensaver-cfr-bench.md`).
- `npm run export:screensaver-cfr-youtube` — production YouTube validation MP4s under `server/tmp/cfr-production/`.
- `npm run test:screensaver-visual` — CPU vs FFmpeg adjustment SSIM (`server/scripts/visual-screensaver-adjust.ts`).
- `npm run test:ranking` — two-clip ranking render (cut + fade) + ffprobe (`server/scripts/verify-ranking.ts`).
- `npm run test:image-motion` — shared motion/timeline tests + optional FFmpeg verify (`RIBO_IMAGE_MOTION_TEST=1`, `server/scripts/verify-image-motion.ts`).
- `npm run test:audio-looper` — contract tests, HTTP rejection, short FFmpeg loop/crossfade/fade checks (`shared/audioLooper.test.ts`, `server/src/audioLooper.test.ts`, `server/scripts/verify-audio-looper.ts`; `RIBO_AUDIO_LOOPER_TEST=1` allows targets under 60s).
- `npm run bench:screensaver-compose` — Node timing for CPU placement bake (`server/scripts/bench-screensaver-compose.ts`).
- `npm run bench:ranking` / `npm run bench:screensaver` — end-to-end export timings (`baseline` / `after` argv); `npm run bench:render-report` writes `docs/render-benchmark-report.md`.
- `npm run bench:screensaver-subscribe` — baseline vs hybrid vs full 30 fps subscribe overlay (`server/scripts/bench-screensaver-subscribe.ts`).
- `npm run build:dev` / `npm run start:dev` — Vite development build, then the renderer serves `client/dist` and the API on port 3001.
- `npm run build:prod` / `npm run start:prod` — production client build plus esbuild server bundle (`server/dist/index.js`). Listens on `PORT` or 3001. Host is `0.0.0.0` when `PORT` is set, otherwise `127.0.0.1`.

Workspaces: root `ribo-studio` (SemVer in root `package.json`; official baseline **1.0.0**), `client` (`ribo-client`), `server` (`ribo-server`). Shared TypeScript is imported by path, not as a package.
