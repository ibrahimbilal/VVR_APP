# Persistence

IndexedDB database `vvr`, **version 4** (`client/src/lib/idb.ts`): `meta`, `files`, `music`, `screensaver`, `assets`, `thumbnail`, `image-motion` (Image Motion project JSON + per-segment blobs + music).

- Ranking: `meta/ranking-videos` (`SavedProject` v1). Legacy `meta/current` migrates on load. Saved 400ms after changes, once hydrated.
- Screensaver: one record per project at `screensaver/project:<id>`, plus `source:<id>`, `audio:<id>`, and `render:<id>`. `catalog` stores the active id. A project saved before the list (keys `project`, `source`, `audio`) is copied into the first id on load. The editor debounces the active project after 400ms. Render status is stored separately so a running job is not rewritten when the editor changes.
- `clearRankingProject()` clears ranking meta/files/music only (not screensaver).
- Each clip file is stored by clip id. Music is one blob.
- Refresh rebuilds object URLs from those blobs and re-uploads if the server no longer has `serverId`. A local clip whose file is gone becomes `error`. A link clip whose file is gone stays `empty`.
- Color sets are localStorage, not IndexedDB. New project clears the IndexedDB project and music, not the color sets. **New project** (header, all three apps) only resets editor inputs and defaults in memory and IndexedDB; it does not cancel in-progress or queued exports and does not delete server uploads (`DELETE /api/clips`, frames, etc.). Those are purged on tab/window close via `POST /api/uploads/cleanup` (`serverUploadCleanup.ts`).
- `assets` stores image blobs by id (sha256 index, ref list). `thumbnail` stores one JSON record per project at `project:<id>`, download metadata at `meta:<id>`, `catalog` (active id), and `pending-transfer` (kept until consumed). Legacy single-key `document` migrates on load. Ranking and screensaver cleanup do not delete thumbnail project keys. An asset is removed only when no saved project or pending transfer still references it.
- Clearing site data wipes the project. Server files expire on their own (below).
