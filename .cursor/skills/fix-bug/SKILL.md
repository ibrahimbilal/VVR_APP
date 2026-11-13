---
name: fix-bug
description: >-
  Diagnoses and fixes bugs in Video's Factory with minimal scope. Use when
  something is broken in preview, export, persistence, uploads, notifications,
  or a specific app editor.
---

# Fix bug

## Workflow

1. Reproduce from the user’s symptoms; name the owning app (Shorts, Screensaver, Thumbnails, Upscaler, Looper, or shell).
2. Read `docs/ai/PROJECT_MAP.md` and open only that area’s files.
3. Form a hypothesis from data flow in `docs/ai/ARCHITECTURE.md` (client store → API → jobs/tmp).
4. Fix the root cause with the smallest diff. Prefer shared helpers when preview and export disagree.
5. Check related invariants in `docs/ai/DECISIONS.md` (especially preview↔export and single queue).
6. Run the closest existing test script when the bug touches render/shared contracts.

## Constraints

- Do not “fix” by bypassing the job queue, downloading social video, or splitting ranking state into a new store.
- Do not refactor unrelated modules while fixing.
- Trust code over stale docs; correct docs after if they misled you.

## Validation

- [ ] Failure mode explained in one or two sentences
- [ ] Fix confined to the owning area
- [ ] Regression path identified (manual or `test:*`)
