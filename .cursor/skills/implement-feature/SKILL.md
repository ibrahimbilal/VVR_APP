---
name: implement-feature
description: >-
  Implements a feature in Ribo Studio while preserving preview/export
  alignment, Pinia ownership, and shared contracts. Use when adding or extending
  editor behavior, UI, API routes, or export paths.
---

# Implement feature

## Workflow

1. Read `docs/ai/PROJECT_MAP.md` and the relevant section of `docs/ai/FEATURES.md`.
2. Confirm invariants in `docs/ai/DECISIONS.md` and conventions in `docs/ai/CONVENTIONS.md`.
3. Identify the owning app folder / store / shared module / server entry from the map.
4. Implement the smallest change set matching existing Vue/Pinia/Express style.
5. If ranking visuals or timing change, update shared helpers used by both preview and export.
6. Run the narrowest relevant `npm run typecheck` / `test:*` for the touched area.
7. If architecture, paths, or major behavior changed, follow `update-project-context`.

## Constraints

- One ranking store: `client/src/stores/project.ts`.
- One FFmpeg encode at a time (`jobs.ts`). Upscaler stays on `imageUpscalerJobs.ts`.
- Links never download video.
- Reuse `components/ui/` and `style.css` patterns; do not invent a parallel design system.
- Do not expand scope into unrelated apps.

## Validation

- [ ] Touched files match the map’s owning area
- [ ] Shared math not duplicated in Vue-only or server-only copies
- [ ] Relevant typecheck/tests considered
- [ ] Context docs updated only if required by `docs/ai/MAINTENANCE.md`
