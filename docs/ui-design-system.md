# Video's Factory UI

Dark production workspace. Brand blue stays `#0078f8` (`--color-brand`). Inter is the application font. Overlay and badge artwork keep their own fonts and SVG assets.

Tokens and control classes live in `client/src/style.css`. Presentational components live in `client/src/components/ui/`. They do not import Pinia stores.

## Tokens

Tailwind utilities come from `@theme`:

| Token | Utility | Use |
| --- | --- | --- |
| `--color-brand` | `bg-brand`, `text-brand` | Primary actions and active navigation |
| `--color-app` | `bg-app` | Application background |
| `--color-chrome` | `bg-chrome` | Sidebar, drawer, export rails |
| `--color-sidebar` | `bg-sidebar` | Editor side panels |
| `--color-elevated` | `bg-elevated` | Cards and dialogs |
| `--color-elevated-hover` | `hover:bg-elevated-hover` | Dashboard card hover |
| `--color-inset` | `bg-inset` | Fields and rows inside a card |
| `--color-footer` | `bg-footer` | Ranking timeline bar |
| `--color-unread` | `bg-unread` | Unread notification row |

`--color-brand-hover`, `--color-brand-deep`, `--color-brand-on`, and `--color-brand-surface` stay compatible with existing components.

## Classes

Reuse these instead of copying color and radius values:

- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-success` — buttons, including focus and disabled states.
- `.field` — text, number, and select inputs.
- `.section-label` — section headings (12px, uppercase).
- `.panel` — elevated card with padding.
- `.focus-ring` — keyboard focus on links and custom buttons that are not `.btn`.
- `.dialog-backdrop`, `.dialog-card` — used by `AppDialog`.
- `.scrim` — full-editor “restoring” overlay.
- `.empty-state` — used by `AppEmptyState`.
- `.toast`, `.toast-error`, `.toast-success` — header toasts.
- `.toggle-switch` — used by `ToggleSwitch`.
- `.nav-link` / `.nav-link--active` — sidebar and mobile nav items; active gets a one-shot brand pulse.
- `.dash-enter` / `.dash-enter-delay-*` — dashboard card and hero entrance.
- `.page-enter-*` / `.page-leave-*` — `RouterView` transition in `App.vue`.
- `.drawer-scrim-enter` / `.drawer-panel-enter` — mobile nav open.
- `.notif-panel-enter` — header notification panel open.
- `.dialog-enter-*` / `.dialog-leave-*` — `AppDialog` backdrop fade and card rise.
- `.notif-item-*` — notification row enter/leave/move (`TransitionGroup name="notif-item"`); leave is fade-left with dark red background.
- `.settings-accordion__*` — expand/collapse used by `SettingsAccordion`.
- `.settings-reveal` / `.settings-reveal__inner` — toggle-driven expand/collapse (Thumbnail Show badge, Screensaver Enable subscribe animation).
- `.settings-tab` / `.settings-tab--active` — settings and mobile tab buttons.
- `.settings-pane-*` — settings tab pane enter/leave (`Transition name="settings-pane"`).

Motion tokens: `--ease-out-soft`, `--duration-fast` / `--duration-base` / `--duration-slow`. All of the above respect `prefers-reduced-motion: reduce`.

## Components

| Component | Use it for | Leave in the app |
| --- | --- | --- |
| `AppDialog` | Modal title, body slot, actions slot. Escape and the backdrop emit `cancel`. | What cancel and confirm do |
| `AppMobileTabs` | Settings / Preview / Clips rows. `v-model` is the tab id. `hide-from` is `lg` or `xl`. | Which panels that id shows |
| `AppSettingsTabs` | Settings strip (Shorts: Clip / Style / Output / Sound). `v-model` is the tab id; optional `cols` `3` or `4`. | Which panels that id shows; wrap pane content in `Transition name="settings-pane"` |
| `AppExportAction` | Primary export button, blocker text, optional hint, extra slot | Store handler, queue label, CPU fallback, status copy |
| `AppExportStatusPanel` | Export progress card: percent, bar, stat rows, collapsed rail | Which rows, progress, and tone to pass; when it is allowed to show |
| `AppEmptyState` | Title and short guidance when nothing is loaded | When the empty state is allowed to show |
| `AppPanel` | Titled elevated card | — |

`SettingsAccordion` expands and collapses with a height + fade animation (chevron rotates). Do not reintroduce native `<details>` for settings sections.

Also reuse `FileDropZone`, `FileStatusBox`, `SliderField`, `ToggleSwitch`, `SettingsAccordion`, `ColorField`, and `components/audio/` before adding a new control.

## What stays app-specific

Do not put these in a shared component:

- Canvas drawing, badge SVG layout, waveform drawing, and preview playback.
- Pinia stores, IndexedDB, and export submission.
- Column widths and scroll regions. Shorts, Screensaver, Thumbnail Studio, Image Upscaler, and Audio Looper do not share one editor grid.
- Preset controls. Duration chips, badge styles, ranking presets, and export resolutions are different interactions.

Audio Looper still hides Source Preview and Loop Plan until a file is loaded, and it keeps the custom waveform player.

A new tool should add a route, a `navItems` entry with `description` (the dashboard card is that list), and compose the classes and components above. Call the existing export or download function from the view. Do not change `server/src/` or `shared/` for a visual change.
