---
name: safe-refactoring
description: >-
  Refactors Video's Factory code without changing product behavior. Use when
  renaming, splitting files, cleaning structure, or deduplicating while keeping
  preview, export, and APIs equivalent.
---

# Safe refactoring

## Workflow

1. Define the behavioral baseline (what must stay identical).
2. Read `docs/ai/PROJECT_MAP.md` and `docs/ai/DECISIONS.md` for ownership boundaries.
3. Refactor inside one layer at a time (UI, store, shared, server). Avoid cross-layer moves in the same change unless required.
4. Keep public contracts stable: routes, job kinds, IndexedDB shapes, shared exports.
5. After moves, update imports and run `npm run typecheck` plus the nearest `test:*`.
6. Update `docs/ai/` paths if files relocated (`update-project-context`).

## Constraints

- No behavior changes, no limit changes, no new features in a “refactor” task.
- Do not merge ranking and screensaver stores.
- Do not replace shared math with duplicated local copies.
- Prefer incremental moves over large rewrites.

## Validation

- [ ] Behavior baseline stated
- [ ] Typecheck clean for touched workspaces
- [ ] Path docs updated if files moved
