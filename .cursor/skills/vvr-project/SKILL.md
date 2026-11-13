---
name: vvr-project
description: >-
  Maintains Video's Factory deep project references (limits, HTTP, storage,
  per-app behavior). Use when docs/ai is insufficient and you need detailed
  ranking, screensaver, thumbnail, upscaler, looper, or server behavior.
---

# VVR project role

Prefer `docs/ai/PROJECT_MAP.md` for navigation. Read **only** the deep topic file(s) below that match the task — never load every file at once.

## Deep references (progressive)

| Topic | File |
| --- | --- |
| Overview, layout, where-to-change, invariants | [overview.md](overview.md) |
| Run / scripts / build | [run.md](run.md) |
| IndexedDB / persistence | [persistence.md](persistence.md) |
| Shorts ranking (state, preview, export) | [ranking.md](ranking.md) |
| Server queue, HTTP, disk, limits | [server.md](server.md) |
| Screensaver | [screensaver.md](screensaver.md) |
| Thumbnail Studio | [thumbnail.md](thumbnail.md) |
| Image Upscaler | [upscaler.md](upscaler.md) |
| Audio Looper | [audio-looper.md](audio-looper.md) |
| Changelog | [docs/ai/CHANGELOG.md](../../../docs/ai/CHANGELOG.md) |

## Before a deep task

1. Start with `docs/ai/PROJECT_MAP.md` (and FEATURES/ARCHITECTURE as needed).
2. Open only the matching deep file(s) from the table.
3. Open only the source files those docs name.
4. If a doc is silent or stale, trust the code, then correct the smallest doc + `docs/ai/` before finishing.

## After the task

Update the relevant deep file(s) and `docs/ai/` when behavior, data shapes, APIs, limits, storage, layout, or file responsibilities change.

Append **one** dated line under **Unreleased** in `docs/ai/CHANGELOG.md`. Skip when the task did not alter the project. Version bumps need user approval (`.cursor/rules/versioning.mdc`). See `docs/ai/MAINTENANCE.md`.

## Working rules

- Preview and export must stay aligned (`shared/frame.ts`, `shared/timeline.ts`, `client/src/lib/drawOverlay.ts`, `client/src/lib/format.ts`).
- Ranking state only in `client/src/stores/project.ts`.
- Links never download video.
- One FFmpeg render at a time.
- Keep edits inside the named area. Match existing Vue, Pinia, and Express style.
