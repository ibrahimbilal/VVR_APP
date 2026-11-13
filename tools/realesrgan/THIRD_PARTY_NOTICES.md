# Third-party notices — bundled Real-ESRGAN AI Lite (optional)

Ribo Studio can run **AI Lite** with a **standalone** copy of the NCNN Vulkan executable and model files under `tools/realesrgan/`. Nothing in this folder is required for Standard (Lanczos3) upscaling.

## Real-ESRGAN-ncnn-vulkan (executable)

- **Project:** [xinntao/Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan)
- **Typical source:** [Real-ESRGAN release v0.2.5.0](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0) — `realesrgan-ncnn-vulkan-20220424-windows.zip` (Windows) or `realesrgan-ncnn-vulkan-20220424-ubuntu.zip` (Linux x64)
- **License:** MIT License (see upstream `LICENSE` in that repository and in the release zip).

## NCNN (linked inside the executable)

- **Project:** [Tencent/ncnn](https://github.com/Tencent/ncnn)
- **License:** BSD 3-Clause (see upstream).

## `upscayl-lite-4x` model (`.param` + `.bin`)

- **Source tree:** [upscayl/upscayl — `resources/models`](https://github.com/upscayl/upscayl/tree/main/resources/models)
- **Upscayl application:** [upscayl/upscayl](https://github.com/upscayl/upscayl) (GNU **AGPL-3.0**).
- **Use in Ribo Studio:** these files are **data** read by the NCNN runner; Ribo Studio does **not** link Upscayl code. If you redistribute the model pair, confirm your obligations under AGPL-3.0 and any upstream model terms.

## No checksum pins in-repo

`MANIFEST.json` records official download URLs. Run `npm run setup:ai-lite` to fetch artifacts; after download, consider recording SHA-256 hashes in your own release notes or internal inventory.
