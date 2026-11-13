# Conventions

Patterns observed in this repo. Prefer matching them over inventing new ones.

## Frontend

- Vue 3 SFC + `<script setup>` + TypeScript. Aliases: `@` → `client/src`, `@shared` → `shared/`.
- One Pinia store per editor domain. Ranking uses only `stores/project.ts`.
- App folders under `client/src/apps/<app>/` own view, store, and local components.
- Platform chrome stays in `components/layout/` and `stores/platform.ts`.
- Presentational shared UI in `components/ui/` — **do not import Pinia** there.
- Reuse tokens/classes from `style.css` (`.btn`, `.field`, `.panel`, …) before new CSS. See `docs/ui-design-system.md`.
- Studio layout pattern: ~300px source column, flex preview, ~360px Settings; export under preview via `AppStudioExportBar` where used.
- Booleans: `ToggleSwitch`. Settings sections: `SettingsAccordion` / `AppSettingsTabs` (not native `<details>`).
- Uploads: `FileDropZone` + `FileStatusBox` before custom upload UI.
- Motion respects `prefers-reduced-motion`.

## Shared modules

- Put cross-boundary math and limits in `shared/`. Client and server both import the same files.
- Do not duplicate banner/fade/duration rules in Vue or Express handlers.

## Backend

- Routes concentrated in `server/src/index.ts` plus focused `*Routes.ts` for newer apps.
- Validate payloads server-side; mirror client limits from `shared/`.
- FFmpeg work goes through `jobs.ts` (one encode at a time). Upscaler uses `imageUpscalerJobs.ts`.
- Use `ffmpegUtil.ts` / `encoders.ts` helpers; do not spawn ad-hoc FFmpeg outside the queue for product exports.
- Temp files under `server/tmp/` only; never commit them.

## Persistence

- Project data: IndexedDB `ribo` (`idb.ts`). Color sets / some prefs: `localStorage`.
- Server disks are caches (clips, frames, outputs), not the source of truth for editor projects.
- **New project** resets editor state only; does not cancel jobs or purge server uploads.

## Naming

- User-facing: Shorts, Screensaver, Thumbnails, Image Upscaler, Audio Looper, Ribo Studio.
- Code paths often keep legacy names (`ranking-videos`, `frame-screensaver`).
- Routes are one-word: `/shorts`, `/screensaver`, `/thumbnails`, `/upscale`, `/looper`.

## Testing

- Prefer existing `npm run test:*` / `bench:*` scripts in root `package.json`.
- Shared contract tests live beside modules as `*.test.ts`; server verifies under `server/scripts/`.
