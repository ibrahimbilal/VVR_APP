---
name: ui-ux-improvement
description: >-
  Improves Ribo Studio UI using the existing design system and studio
  layouts. Use when changing layout, controls, motion, empty states, settings
  panels, or shared chrome without altering encode pipelines.
---

# UI/UX improvement

## Workflow

1. Read `docs/ui-design-system.md` and `docs/ai/CONVENTIONS.md`.
2. Reuse tokens/classes in `client/src/style.css` and components in `client/src/components/ui/`.
3. Match the studio pattern (source ~300px, preview, settings ~360px) used by existing editors.
4. Keep presentational shared components free of Pinia.
5. Preserve accessibility basics already in use (focus rings, dialog Escape/backdrop, `prefers-reduced-motion`).
6. Do not change server/render behavior for a pure visual task.

## Constraints

- Brand accent is `#0078f8` / `--color-brand`. Do not introduce a parallel palette.
- Prefer `ToggleSwitch`, `SettingsAccordion`, `AppSettingsTabs`, `FileDropZone`, `AppDialog`, `AppExportAction`, `AppStudioExportBar`.
- App-specific canvas/waveform/badge drawing stays in the app folder.
- User-facing names: Shorts, Screensaver, Thumbnails, etc. (see conventions).

## Validation

- [ ] Uses existing tokens/components where possible
- [ ] No new global CSS system
- [ ] Desktop and mobile patterns of the target app still make sense (tabs/drawers where already used)
