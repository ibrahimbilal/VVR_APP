# Architecture

## Entry points

| Mode | Entry |
| --- | --- |
| Client | `client/src/main.ts` → `App.vue` → vue-router |
| Server | `server/src/index.ts` (Express; loads `.env` via `loadEnv.ts`) |
| Dev | `npm run dev` — Vite proxies `/api` → `127.0.0.1:3001` |
| Prod | `npm run build:prod` / `start:prod` — single Node process serves SPA + API |

## Layers

```
Browser (Vue + Pinia + IndexedDB)
    │  HTTP /api/*
    ▼
Express (routes in index.ts + *Routes.ts)
    │  jobs.ts queue (ranking | screensaver | image-motion | audio-looper)
    ▼
FFmpeg / Sharp / optional Real-ESRGAN
    │
    ▼
server/tmp/ (clips, frames, jobs, outputs, upscaler)
```

Image Upscaler uses a **separate** sequential job runner (`imageUpscalerJobs.ts`), not the FFmpeg `jobs.ts` queue. Thumbnail Studio never hits FFmpeg.

## Data flow (typical export)

1. Editor Pinia store holds project state; blobs in IndexedDB (`idb.ts`) and/or memory.
2. Client prepares overlays/composition (canvas) when needed.
3. Upload media + JSON → `/api/.../export` (or upscaler `/process`).
4. Server enqueues job; `pump` runs **one** FFmpeg pipeline at a time.
5. Client polls `GET /api/jobs/:id`; download when `done` + verified.
6. Tab close: `POST /api/uploads/cleanup` purges server uploads (editor state stays in IndexedDB).

## Shared contracts

Path-imported TypeScript under `shared/`:

- Ranking geometry/timing: `frame.ts`, `timeline.ts`
- Screensaver: `screensaver.ts`, composition/adjust/subscribe modules
- Image Motion / Upscaler / Audio Looper / Thumbnail: matching `shared/*` modules

Preview and export must use the same shared math and drawing helpers. See [DECISIONS.md](DECISIONS.md).

## State ownership

| Concern | Owner |
| --- | --- |
| Ranking project | `client/src/stores/project.ts` only |
| Platform shell / toasts / nav | `client/src/stores/platform.ts` |
| Per-app editors | Pinia store under each `client/src/apps/*/stores/` |
| Server jobs | In-memory `jobs.ts` (+ disk under `server/tmp/`) |

Do not add a second ranking project store.

## Important dependencies

- Client: Vue 3, vue-router, Pinia, Tailwind 4, Lucide, Fontsource (overlay fonts).
- Server: Express 5, Multer, cors, Sharp; `ffmpeg-static` / `ffprobe-static` (no system FFmpeg required).
- Optional: Real-ESRGAN under `tools/realesrgan/` gated by env (`docs/image-upscaler.md`).

## Production

Hostinger Node.js at `https://videos.ibrahimbilal.com`. Deploy skill: `.cursor/skills/hostinger-vvr-deploy/`.
