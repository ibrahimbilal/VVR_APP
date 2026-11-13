---
name: release-manager
description: >-
  Analyze changes, determine semantic versions, prepare changelogs, validate
  releases, and manage Git release tags for Ribo Studio.
---

# Release manager

SemVer 2.0.0 release workflow for Ribo Studio. Authoritative version: root `package.json`. User-facing history: root `CHANGELOG.md`. Agent detail notes: `docs/ai/CHANGELOG.md`.

Never bump the version during ordinary development. Never push, publish, overwrite tags, or create a release without explicit user approval for that step.

## Baseline

- **Approved product baseline:** **1.0.0** — first official stable release of Ribo Studio (display rebrand from Video's Factory).
- Planned Git tag: `v1.0.0`. Release title when publishing: `Ribo Studio v1.0.0 — Initial Stable Release`.
- Pre-baseline `package.json` values (including `3.0.0`) were arbitrary development metadata only. They had no matching annotated Git tags or GitHub Releases. Do not fabricate historical releases for those numbers.
- Product identifiers use the `ribo` prefix: package name `ribo-studio`, IndexedDB `ribo`, `RIBO_*` env keys (legacy `vvr` / `VVR_*` migrate once where applicable).
- From 1.0.0 onward, use only normal SemVer bumps (`patch` / `minor` / `major`) via this skill and `npm run release:*`.

## Phase A — Analyze

1. Read root `package.json` `"version"`.
2. List annotated release tags (`git tag -l "v*"`); identify the latest valid `vMAJOR.MINOR.PATCH` (may be none before `v1.0.0` is created).
3. Inspect changes since that tag (or since the current version baseline if no tags): `git log`, `git diff`, and **Unreleased** in `CHANGELOG.md`.
4. Classify the next bump:
   - **MAJOR** — breaking APIs, incompatible project formats, broken contracts.
   - **MINOR** — backward-compatible features / new apps.
   - **PATCH** — fixes, compatible performance, minor UI corrections.
5. Note compatibility risks. Do not scan unrelated source trees; use `docs/ai/PROJECT_MAP.md` for paths.

## Phase B — Propose

Present a short proposal and **stop**:

- Current version
- Proposed next version + type (major/minor/patch)
- Reason for classification
- Main changes
- Compatibility considerations
- Required validation (`npm run release:check`, typecheck/tests/build as relevant)

Do **not** modify version files until the user approves preparation.

## Phase C — Prepare

After approval to prepare:

1. Ensure unrelated work is committed or stashed (prepare refuses a dirty tree unless dry-run). For a dedicated baseline/rebrand release, include the approved release-system and branding files in the same preparation set.
2. Run `npm run release:check`.
3. Run the matching prepare script (`npm run release:patch` | `release:minor` | `release:major`), or dry-run first (`release:dry-*`). For an explicit approved set to a version (e.g. rebaseline to `1.0.0`), update `package.json`, sync `package-lock.json`, and promote `CHANGELOG.md` manually — do not invent intermediate tags.
4. Confirm `package.json`, `package-lock.json`, and `CHANGELOG.md` show the new version; UI reads version via Vite `__APP_VERSION__` / `client/src/lib/appVersion.ts`.
5. Stop if validation fails. Do not commit or tag in this phase.

## Phase D — Finalize

Only after explicit approval to commit and tag:

1. Stage **only** release files (`package.json`, `package-lock.json`, `CHANGELOG.md`, and any intentional release-system files already part of the approved release).
2. Create the release commit (message like `Release vX.Y.Z`).
3. Create an annotated tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"` (for 1.0.0 prefer message / GitHub title: `Ribo Studio v1.0.0 — Initial Stable Release`).
4. Verify the tag points at that commit and matches `package.json`.
5. Never overwrite, move, or delete an existing release tag.
6. Do **not** push commits or tags unless the user explicitly authorizes each push. Prefer `git push origin vX.Y.Z` for the specific tag.

## Phase E — Report

Summarize only what actually happened:

- Previous → new version and classification
- Main changes
- Test/build results
- Release commit hash and tag (if created)
- Push/publish status (default: not pushed)
- Remaining issues

Never claim a release was created, pushed, or published unless the operation succeeded.

## Commands

| Script | Behavior |
| --- | --- |
| `npm run release:check` | Validate version, lockfile, changelog, tags, tree |
| `npm run release:patch` / `minor` / `major` | Bump + changelog promote + typecheck/build; no commit/tag/push |
| `npm run release:dry-*` | Same plan without writing files |

## Safety

- One app version for the whole monorepo (no per-app versions).
- No hardcoded UI version strings.
- Preparation and finalization stay separate.
- Preserve existing app behavior; release work must not refactor render pipelines.
- Do not fabricate historical SemVer releases or backfill tags for legacy package metadata.
