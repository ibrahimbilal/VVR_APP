# Frame Screensaver preview performance baseline

Measurements use the in-app diagnostics panel (`?screensaver_diag=1` or `localStorage.vvr-screensaver-diagnostics=1`) for **browser preview FPS**. CPU placement bake times use `npm run bench:screensaver-compose` (Node, same math as Canvas 2D bake).

Machine: developer Windows workstation, 2026-10-25.

## Protocol

1. Load a 1920×1080 and a 3840×2160 test image.
2. Drag saturation, blur, and sharpness sliders for 5 seconds each.
3. Drag placement handles and crop for 5 seconds.
4. Play a looping video with non-neutral adjustments.
5. Run a static export at 1080p and 4K; note export prep time in diagnostics.

Browser preview: after step 1–4, run `await window.__vvrScreensaverBench()` in devtools (2s sample).

## CPU placement bake (Canvas 2D / static export path)

Representative adjustments: saturation 35, blur 40, sharpness 25, brightness 15.

| Scenario | Per-pass (ms) | Source |
| --- | --- | --- |
| Full-frame placement 1280×720 | 234.42 | `bench:screensaver-compose` |
| Full-frame placement 1920×1080 | 483.61 | `bench:screensaver-compose` |
| Full-frame placement 3840×2160 (export) | 2393.81 | `bench:screensaver-compose` |

## Browser preview (WebGL2 default)

| Scenario | Preview FPS | Avg draw (ms) | Avg bake (ms) | Notes |
| --- | --- | --- | --- | --- |
| 1080p image, idle | not measured | not measured | n/a (GPU) | Use diagnostics + `__vvrScreensaverBench` |
| 1080p, slider drag | not measured | not measured | n/a | Reduced quality while interacting |
| 4K image, slider drag | not measured | not measured | n/a | |
| Video + adjustments | not measured | not measured | n/a | Texture upload per frame |
| Export prep 1080p | not measured | — | ~484 ms CPU equivalent | Main-thread bake |
| Export prep 4K | not measured | — | ~2394 ms CPU; worker when OffscreenCanvas available | |

Legacy Canvas 2D preview rebake per slider frame was on the same order as **per-pass ms** above at matching placement resolution.

Do not treat empty browser cells as zero.
