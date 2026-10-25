# Screensaver color adjustment pipeline (canonical editor model)

This document is the reference for **CPU bake** ([`screensaverAdjust.ts`](screensaverAdjust.ts)), **WebGL preview** ([`screensaverAdjustUniforms.ts`](screensaverAdjustUniforms.ts) + GPU shaders), and **FFmpeg video export** (`ffmpegAdjustmentFilter` in the same module).

## Assumptions

- Working space: **linear-ish RGB in 0–1** on CPU (bytes 0–255 converted per step); GPU shaders use 0–1 float textures.
- Alpha: adjustments apply to **RGB only**; alpha is copied through on CPU bake.
- Clamping: each channel clamped to **0–255** after the full CPU pipeline per pixel. GPU clamps to 0–1 at the end of the color pass.

## Operation order (must stay aligned)

1. Exposure — multiply RGB by `2^(exposure/50)`.
2. Brightness — add `brightness/100` to RGB (CPU uses 0–1 units after byte scaling step; see code).
3. Contrast — `(c - 0.5) * (1 + contrast/100) + 0.5`.
4. Shadows — lift dark tones (luma &lt; 0.5).
5. Highlights — roll bright tones (luma &gt; 0.5).
6. Temperature / tint — R/B and G shifts.
7. Saturation — luma-preserving scale around Rec. 709 luma weights.
8. Grayscale — mix toward luma.
9. Sepia — matrix mix toward sepia tone.
10. Blur — **CPU/export bake:** separable box blur, radius from `blurSigma(blur, height) * 2`. **WebGL preview:** separable Gaussian approximation. **FFmpeg:** `gblur=sigma=blurSigma(...)`.
11. Sharpen — unsharp on CPU; `unsharp` filter on FFmpeg; sharpen pass on WebGL.

## Known cross-backend differences

| Effect | CPU static PNG | WebGL preview | FFmpeg loop video |
| --- | --- | --- | --- |
| Color steps 1–9 | Reference | Matched via shared uniforms | Approximated (`eq`, `exposure`, `curves`, `colorbalance`, `hue`, `colorchannelmixer`) |
| Blur | Box blur | Gaussian (5-tap separable) | `gblur` |
| Sharpen | Box-based unsharp | 4-neighbor unsharp | `unsharp` |

Static exports use the **CPU bake** PNG, so they match the Canvas 2D fallback preview, not necessarily the WebGL preview when blur/sharpen are non-zero.

## FFmpeg mapping notes

Do not assume FFmpeg filter names match Photoshop or GPU sliders exactly. `ffmpegAdjustmentFilter` encodes the closest available filters at export time. Visual regression tests (`npm run test:screensaver-visual`) compare CPU vs FFmpeg for representative sliders.
