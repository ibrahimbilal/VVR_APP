# Frame Screensaver — performance report (2026-10-25)

## Architecture changes

- Interactive preview: **WebGL2** default ([`client/src/apps/frame-screensaver/lib/render/`](client/src/apps/frame-screensaver/lib/render/)), **Canvas 2D** fallback (forced or when WebGL init/restore fails).
- Draw scheduling: **requestAnimationFrame** coalescing; reduced blur/sharpen while sliders or canvas gestures are active.
- Static export composition: CPU **`composeCanvas`**; **>1080p** may use **`exportCompose.worker.ts`**.
- Color pipeline reference: [`shared/screensaverAdjustPipeline.md`](../shared/screensaverAdjustPipeline.md).

## Measured results

| Metric | Before (legacy Canvas preview) | After | Improvement |
| --- | --- | --- | --- |
| Preview FPS (1080p image) | not measured | not measured | not measured |
| CPU bake 1280×720 placement | ~234 ms/pass (estimated same path) | 234.42 ms/pass | baseline captured |
| CPU bake 1920×1080 placement | not measured | 483.61 ms/pass | not measured |
| CPU bake 3840×2160 export | not measured | 2393.81 ms/pass | worker offloads main thread when >1080p |
| Main-thread blocking (GPU preview) | full getImageData per change | no readback on WebGL path | qualitative |
| Export prep 4K | main thread | worker optional | qualitative |

Browser FPS requires local diagnostics; see [`docs/screensaver-performance-baseline.md`](screensaver-performance-baseline.md).

## Visual quality

- **Static export** still uses CPU bake; matches Canvas 2D fallback preview.
- **WebGL preview** may differ on blur/sharpen (Gaussian vs box).
- **FFmpeg vs CPU** (video): automated SSIM checks in `npm run test:screensaver-visual` (brightness/contrast/saturation 0.82, grayscale 0.97, sepia 1.00 on 640×360 testsrc).

## Encoder benchmarking

- Workloads: **`still_1fps`**, **`still_30fps`**, **`motion_30fps`** (mandelbrot / testsrc2), 5s samples, wall time recorded in cache.
- Cache keys: `width×height:workload:tier` in `server/tmp/encoder-cache.json`.

## Code added / changed

- Render backends, worker, diagnostics, bench/visual scripts, pipeline doc, encoder bench logic.
- Tests: `npm run test:screensaver-visual`, `npm run bench:screensaver-compose`.

## Recommendations

- **Rust/WASM:** defer until browser preview baselines show CPU export bake still dominates end-to-end; 4K single-pass ~2.4s in Node suggests worker + GPU preview may be sufficient.
- **Next accuracy work:** align WebGL blur with export box blur or document tolerance; extend visual tests to blur/sharpen and rotation crops.
