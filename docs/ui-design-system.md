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

## Components

| Component | Use it for | Leave in the app |
| --- | --- | --- |
| `AppDialog` | Modal title, body slot, actions slot. Escape and the backdrop emit `cancel`. | What cancel and confirm do |
| `AppMobileTabs` | Settings / Preview / Clips rows. `v-model` is the tab id. `hide-from` is `lg` or `xl`. | Which panels that id shows |
| `AppExportAction` | Primary export button, blocker text, optional hint, extra slot | Store handler, queue label, CPU fallback, status copy |
| `AppEmptyState` | Title and short guidance when nothing is loaded | When the empty state is allowed to show |
| `AppPanel` | Titled elevated card | — |

Also reuse `FileDropZone`, `FileStatusBox`, `SliderField`, `ToggleSwitch`, `SettingsAccordion`, `ColorField`, and `components/audio/` before adding a new control.

## What stays app-specific

Do not put these in a shared component:

- Canvas drawing, badge SVG layout, waveform drawing, and preview playback.
- Pinia stores, IndexedDB, and export submission.
- Column widths and scroll regions. Shorts, Screensaver, Thumbnail Studio, Image Upscaler, and Audio Looper do not share one editor grid.
- Preset controls. Duration chips, badge styles, ranking presets, and export resolutions are different interactions.

Audio Looper still hides Source Preview and Loop Plan until a file is loaded, and it keeps the custom waveform player.

A new tool should add a route, a `navItems` entry with `description` (the dashboard card is that list), and compose the classes and components above. Call the existing export or download function from the view. Do not change `server/src/` or `shared/` for a visual change.
