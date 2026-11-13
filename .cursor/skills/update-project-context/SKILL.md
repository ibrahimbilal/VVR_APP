---
name: update-project-context
description: >-
  Updates AI context docs and deep Ribo topic files after architecture or
  feature location changes. Use when routes, folders, APIs, limits, stores, or
  major features change, or when the user asks to refresh project context.
---

# Update project context

## Workflow

1. Read `docs/ai/MAINTENANCE.md` — confirm an update is required.
2. Diff what changed: paths, apps, APIs, limits, conventions, decisions.
3. Patch the smallest set of:
   - `docs/ai/PROJECT_MAP.md`
   - `docs/ai/ARCHITECTURE.md` / `FEATURES.md` / `CONVENTIONS.md` / `DECISIONS.md`
4. If behavior, data shapes, APIs, limits, storage, layout, or file responsibilities changed, update the matching file(s) under `.cursor/skills/ribo-project/` (see that skill’s table) and append **one** dated line under **Unreleased** in `docs/ai/CHANGELOG.md`. For user-facing product changes, also update root `CHANGELOG.md` Unreleased. Do not bump `package.json` unless the user approved a release (`.cursor/rules/versioning.mdc`, `release-manager` skill).
5. Verify every referenced path exists.
6. Keep docs concise; link to source instead of pasting code.

## Constraints

- Do not update docs for typos, pure CSS tweaks, or fixes that do not move contracts.
- Do not invent features. Only document what exists in code.
- Do not modify application runtime code in this skill unless the user also asked for a product change.
- Avoid duplicating full essays into `.cursor/rules/` (rules stay short).
- Never recreate a monolithic `PROJECT.md`.

## Validation

- [ ] Paths exist
- [ ] No contradictory instructions between `docs/ai/` and always-applied rules
- [ ] Changelog line added when deep topic files or product behavior changed
