---
name: vvr-project
description: >-
  Maintains the Vertical Video Ranking (VVR) project map and is the first
  thing to read before any work in this repo. Use before editing, debugging,
  reviewing, or answering questions about the VVR app, client, renderer,
  export, clips, ranking, timeline, preview, or styles, and update the map
  after those tasks change the project.
---

# VVR project role

This repo is a local editor for 9:16 ranking compilations. The full map lives in [PROJECT.md](PROJECT.md). Read that file before searching code.

## Before any task

1. Read [PROJECT.md](PROJECT.md) from top to bottom.
2. Answer or implement from the map. Open only the files listed under "Where to change things" for the area you touch.
3. If the map is silent or stale, read that area's source, then correct the map before finishing.

## After the task

Update [PROJECT.md](PROJECT.md) in the same turn when any of these changed:

- user-visible behavior or layout
- Pinia state, persisted fields, or clip/style types
- HTTP routes, export payload, or FFmpeg behavior
- limits, storage locations, or file responsibilities

Add one changelog line: date, what changed, which files. Leave the map alone when the task was a question or a change that did not alter the project.

## Working rules for this repo

- Preview and export must stay aligned. Both use `shared/frame.ts`, `shared/timeline.ts`, `client/src/lib/drawOverlay.ts`, and `client/src/lib/format.ts`. A visual change in one path is unfinished until the other path uses the same numbers.
- The Pinia store in `client/src/stores/project.ts` is the editor state. Do not add a second store for project data.
- Links never download video. A clip exports only after a local file is uploaded to the renderer.
- One render runs at a time. Do not start a second FFmpeg pipeline in parallel.
- Keep edits inside the area the task names. Match existing Vue, Pinia, and Express style.
