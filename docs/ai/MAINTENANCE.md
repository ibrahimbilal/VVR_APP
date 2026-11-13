# Context maintenance

Lightweight process so AI docs stay useful without constant churn.

## When to update

Update `docs/ai/` in the **same turn** when any of these change:

- App routes, folder locations, or module responsibilities
- New app / major feature surface
- Entry points, job kinds, or shared contract ownership
- Coding conventions that agents must follow
- Architectural decisions or hard limits

Also update the matching deep file(s) under `.cursor/skills/vvr-project/` when behavior, data shapes, APIs, limits, storage, layout, or file responsibilities change — same rule as the `vvr-project` skill.

Append **one** dated line under **Unreleased** in `docs/ai/CHANGELOG.md` (date, what changed, files). Version bumps follow `.cursor/rules/versioning.mdc` (ask before releasing).

## When not to update

Skip docs for:

- Typo / copy / pure styling tweaks that do not change structure
- Bugfixes that do not move files or alter contracts
- Dependency bump-only changes with no API impact
- Temporary debug logs

## How to update

1. Edit the smallest relevant `docs/ai/*.md` file (usually `PROJECT_MAP.md` or `FEATURES.md`).
2. If a decision/limit changed, add or revise a bullet in `DECISIONS.md`.
3. If conventions changed, revise `CONVENTIONS.md`.
4. Keep docs **concise** — link to source paths; do not paste large code.
5. Verify every new path exists before writing it.
6. For deep narrative detail, edit only the matching topic file in `.cursor/skills/vvr-project/` (see that skill’s table).
7. Append one dated line under **Unreleased** in `docs/ai/CHANGELOG.md`. Do not bump `package.json` unless the user approved a release (`.cursor/rules/versioning.mdc`).

Skill: `.cursor/skills/update-project-context/SKILL.md`.

## Ownership split

| Doc | Role |
| --- | --- |
| `docs/ai/*` | Fast agent navigation (prefer first) |
| `docs/ai/CHANGELOG.md` | Dated history of product/architecture changes |
| `.cursor/skills/vvr-project/*.md` | Deep topic references (read selectively) |
| `.cursor/rules/*` | Short enforcement / scope hints |
| Skills | Task workflows |

Do not duplicate full feature essays into rules or always-applied prompts.
