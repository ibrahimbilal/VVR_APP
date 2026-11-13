---
name: project-navigation
description: >-
  Navigates the Ribo Studio (Ribo) monorepo using docs/ai maps instead of
  broad tree scans. Use when locating modules, answering architecture questions,
  finding where a feature lives, or before exploring client/server/shared code.
---

# Project navigation

## Workflow

1. Read `docs/ai/PROJECT_MAP.md`.
2. If needed, open only:
   - `docs/ai/FEATURES.md` for feature → path
   - `docs/ai/ARCHITECTURE.md` for data flow / entry points
   - `docs/ai/DECISIONS.md` for invariants
3. Open the named source files for the task area only.
4. For deep limits/HTTP/storage/app behavior, open **one** matching file under `.cursor/skills/ribo-project/` (see that skill’s table). Use `docs/ai/CHANGELOG.md` for history.

## Constraints

- Do not invent routes, apps, or APIs.
- Do not run recursive whole-repo searches as the first step.
- Prefer path tables in docs over dumping directory listings into context.

## Validation

- Every path you cite exists on disk.
- Answer names the owning app and primary files in one short block.
