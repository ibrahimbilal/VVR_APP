# Image Upscaler

Image Upscaler is a Video's Factory app at `/image-upscaler`. It resizes PNG, JPEG, and WebP images to an exact pixel size.

Two engines are available:

- **Standard (default)** uses [Sharp](https://sharp.pixelplumbing.com/) and the **Lanczos3** kernel. Lanczos3 calculates new pixels from neighbors that are already in the file. It does not reconstruct texture that was never captured.
- **AI Lite** runs a local Real-ESRGAN NCNN Vulkan model, then fits that result to the exact requested size with one Lanczos3 pass. The model rebuilds edges and texture. It can invent detail or change fine artwork. It is not a lossless recovery of the original.

AI Lite is optional. If the program or model is missing, Standard still works and AI Lite is shown as unavailable.

## Open it

- Dashboard card **Image Upscaler**
- Sidebar and the mobile navigation drawer
- Direct URL `/image-upscaler`

Choose images, set the output, then press **Upscale Images**. Selecting files does not start processing.

## Engines

**Upscaling Engine**

- **Standard** — Lanczos3. Fast traditional resizing.
- **AI Lite** — Real-ESRGAN. AI-assisted reconstruction for cleaner edges and textures. May alter fine artistic details.

Standard is selected by default. AI Lite can be selected only when `GET /api/image-upscaler/capabilities` reports it as available. The panel names the configured model.

The model id is configured on the server. It is not chosen in the browser.

| Model id | Native scale | What it is |
| --- | --- | --- |
| `upscayl-lite-4x` | 4× | The current Upscayl Lite model. Output can still differ from the Upscayl app because the exact final size is fitted here with Lanczos3. |
| `realesrgan-x4plus` | 4× | Official Real-ESRGAN general photo model. This is not Upscayl Lite. |
| `realesrgan-x4plus-anime` | 4× | Official Real-ESRGAN anime model. This is not Upscayl Lite. |
| `realesrnet-x4plus` | 4× | Official Real-ESRNet model. This is not Upscayl Lite. |

Other model names are rejected. Community models such as Remacri and Ultrasharp are not in this list.

AI Lite always runs the model at that native scale, then resizes once to the requested width and height. Contain, Cover, and Fill happen on that second step, so the model sees the whole prepared image. Cover crops after the model, it does not crop the original away before it. Sharpen, when enabled, runs once on that final fit.

If a native 4× image would exceed the temporary size cap (`VVR_REALESRGAN_MAX_INTERMEDIATE_EDGE`, default 8192 px), the input is reduced before the model and the job says so. A roughly 1972×1109 image at 4× stays under that cap (7888×4436) and is not reduced.

**Skip Lanczos resampling** applies only to Standard. When the image is already the target size, Standard can copy it. AI Lite still runs the model, then fits the result back to those exact pixels.

A failed AI job stays failed. It is not replaced with a Standard file, and a Standard file is not labeled as AI Lite.

## Formats

| | |
| --- | --- |
| Input | PNG, JPEG/JPG, WebP. The server checks the file contents, not only the extension. |
| Output | PNG (lossless), JPEG, or WebP |
| Transparency | PNG and WebP can keep it. JPEG cannot, so those pixels are flattened onto the padding color. |
| Animated images | Rejected. Export a single frame first. |
| Orientation | EXIF orientation is applied before the model or the Lanczos resize. |

AI intermediates are lossless PNG files. JPEG is not used between the model and the final save.

On this Windows machine, Upscayl's `upscayl-bin.exe` with `upscayl-lite-4x` kept a transparent PNG's alpha channel (a fully transparent corner stayed at alpha 0). If a different build drops alpha, the job finishes with a warning and flattened transparency. Do not assume every binary keeps alpha.

## Resolutions

| Preset | Pixels |
| --- | --- |
| Full HD | 1920×1080 |
| 2K / QHD | 2560×1440 |
| 4K UHD (default) | 3840×2160 |
| 8K UHD | 7680×4320 |
| Custom | Whole-number width and height inside the server limits |

Every preset except Custom is forced to those exact dimensions. The job fails if the file that was written does not decode to the requested width, height, and format. A 4K preset is 3840×2160, including after AI Lite.

The panel shows the original size, aspect ratio, target size, scale, original file size, and the output file size after processing. A large Standard enlargement from a small original shows a warning. AI Lite shows its own warning: the model can invent detail.

## Resize modes

The active mode is labeled in the settings panel.

- **Contain** (default) keeps the whole image and pads the canvas. Padding can be black, white, a custom color, or transparent when the output format supports it.
- **Cover** fills the canvas and crops the overflow. Crop position is center, top, bottom, left, or right.
- **Fill** stretches to the exact target size and can distort proportions. The panel says so when Fill is selected.

## Sharpen

Sharpen is off by default. **None**, **Subtle**, and **Moderate** are separate from resizing. Subtle and Moderate map to small Sharp `sharpen` values chosen to limit halos. **Reset** returns the control to None. Sharpening runs at most once, after the final fit.

## Batch, download, comparison

Add up to 8 images. They share one resolution, engine, and export setup. Standard follows `VVR_UPSCALER_CONCURRENCY` (default 1, maximum 2). AI Lite runs one image at a time even if that value is 2, and it waits while a Shorts or Screensaver FFmpeg job is active.

Each row is Pending, Processing, Completed, Failed, or Cancelled. The active image shows an indeterminate indicator. The UI does not invent a percentage. Cancel stops the job. For AI Lite, cancel terminates the native process and its child processes. On Windows that is `taskkill /T /F`. On Linux it kills the process group. Marking the job cancelled without stopping the process is not enough.

Download a finished image on its own, or **Download all ZIP** when more than one image succeeded. ZIP names look like `landscape_4K_3840x2160.png`. Two files named `landscape.png` become `landscape_4K_3840x2160.png` and `landscape_4K_3840x2160_2.png`. Names are sanitized and are not filesystem paths.

The before/after slider uses WebP previews with a long edge of 1440 px by default. The original is not blurred. Zoom, pan, and **Reset view** affect that preview only. The download is the full-size file. **Inspect full resolution** loads that file at 100% in a separate scrolling view. It is labeled as the processed file, not the comparison preview. It does not load until you open it.

## Send to Screensaver

**Send to Screensaver** downloads the full processed image (not the preview) and opens Screensaver with that file as the source. The same download is used for Standard and AI Lite.

If Screensaver already has an image or video, the app asks before replacing it. **Keep current** does nothing. **Replace** uses the same path as dropping a new image: static mode, the picture is framed again, and the selected decorative frame is kept. Project name, duration, output resolution, audio, and encoder are left as they were.

## Local development

From the repo root, after `npm install`:

```bash
npm run dev
```

Open `http://127.0.0.1:5173/image-upscaler`. The API is `http://127.0.0.1:3001`. Vite proxies `/api`.

```bash
npm run test:upscaler
npm run typecheck
```

`npm run test:upscaler` does not need a GPU. The native program is mocked. Set `VVR_AI_UPSCALER_INTEGRATION=1` plus a working binary and model paths to also run one real upscale. CI should leave that unset.

Sharp is a **server** dependency (`server/package.json`). The client copy of Sharp is only a devDependency for frame thumbnails and is not the upscaler runtime. The Real-ESRGAN program is not an npm dependency and is not part of the client bundle.

## Standalone AI Lite (no Upscayl app required)

AI Lite can run from a **project-local** copy of the NCNN Vulkan runner and the `upscayl-lite-4x` model pair. The recommended layout (relative to the repo root) is:

```text
tools/realesrgan/
  win-x64/           # full folder from the official zip (exe + DLLs)
  models/
    upscayl-lite-4x.param
    upscayl-lite-4x.bin
  MANIFEST.json
  THIRD_PARTY_NOTICES.md
```

On Linux, use `linux-x64/realesrgan-ncnn-vulkan` instead of `win-x64/`.

### Obtain dependencies (reproducible)

From the repo root:

```bash
npm run setup:ai-lite
```

This script downloads:

- The official **Windows** portable build `realesrgan-ncnn-vulkan-20220424-windows.zip` from [Real-ESRGAN v0.2.5.0](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0) and unpacks the whole directory into `tools/realesrgan/win-x64/` (so required DLLs stay next to the executable).
- `upscayl-lite-4x.param` and `upscayl-lite-4x.bin` from the [Upscayl repository](https://github.com/upscayl/upscayl/tree/main/resources/models) (raw URLs are listed in `tools/realesrgan/MANIFEST.json`).

**Licensing:** `THIRD_PARTY_NOTICES.md` summarizes upstream licenses. The Upscayl **app** is AGPL-3.0; the model pair is published in that tree—confirm redistribution terms before you ship those files in a product. This repo does **not** commit binaries or weights (they are gitignored).

**Checksums:** no SHA-256 pins are stored in-repo; verify downloads with `certutil -hashfile` (Windows) or `sha256sum` and record hashes in your own release notes if you need compliance.

### Automatic enable (development)

**`npm run launch`** and **`Video Factory.exe`** set the same environment when the standalone files exist and you have not set both `VVR_REALESRGAN_BINARY` and `VVR_REALESRGAN_MODEL_DIR` yourself:

- `VVR_AI_UPSCALER_ENABLED=true`
- `VVR_REALESRGAN_BINARY` → `tools/realesrgan/<platform>/realesrgan-ncnn-vulkan[.exe]`
- `VVR_REALESRGAN_MODEL_DIR` → `tools/realesrgan/models`
- `VVR_REALESRGAN_PROJECT_ROOT` → repo root (so the server resolves paths the same way when relative overrides are used)

They print either `[VVR] AI Lite: Ready (standalone engine)` or `[VVR] AI Lite: Unavailable — missing engine, model, or Vulkan support`, then start the app either way.

The server discovers `tools/realesrgan` when AI is enabled and you leave **both** `VVR_REALESRGAN_BINARY` and `VVR_REALESRGAN_MODEL_DIR` unset: it resolves the project root from `VVR_REALESRGAN_PROJECT_ROOT`, or from the installed server package path (`server/dist` or `server/src` under the repo).

**Optional external engine root:** set `VVR_REALESRGAN_ENGINE_DIR` to a folder that mirrors the same layout (`<platform>/` + `models/`). Priority is: explicit env (`VVR_REALESRGAN_BINARY` / `VVR_REALESRGAN_MODEL_DIR`), then bundled layout under `VVR_REALESRGAN_ENGINE_DIR` or `tools/realesrgan`, then failure with a clear reason.

**Relative paths:** if you set `VVR_REALESRGAN_PROJECT_ROOT` to the repo root, `VVR_REALESRGAN_BINARY` and `VVR_REALESRGAN_MODEL_DIR` may be relative to that root. Without `VVR_REALESRGAN_PROJECT_ROOT`, relative paths are rejected (use absolute paths or rely on standalone auto-detection).

Optional **repo-root `.env`**: copy **`.env.example`** (at the repo root) to **`.env`** and set `VVR_*` variables there. The **server loads `.env` on startup** (via `server/src/loadEnv.ts`); values already set in the OS environment are **not** overridden. **`npm run launch`** and **`Video factory.exe`** also merge `.env` into the dev process before starting `npm run dev`. Lines such as `VVR_REALESRGAN_BINARY=` with **no value** are treated as **unset** so standalone **`tools/realesrgan/`** can be auto-detected; omit those keys entirely if you rely on auto-detect.

### Manual PowerShell (absolute paths)

```powershell
$env:VVR_AI_UPSCALER_ENABLED = 'true'
$env:VVR_REALESRGAN_BINARY = 'C:\path\to\VVR_APP\tools\realesrgan\win-x64\realesrgan-ncnn-vulkan.exe'
$env:VVR_REALESRGAN_MODEL_DIR = 'C:\path\to\VVR_APP\tools\realesrgan\models'
$env:VVR_REALESRGAN_MODEL_NAME = 'upscayl-lite-4x'
npm run dev
```

To use a different NCNN build with **official** Real-ESRGAN weights instead, download the Windows zip from [Real-ESRGAN releases](https://github.com/xinntao/Real-ESRGAN/releases), point `VVR_REALESRGAN_BINARY` and `VVR_REALESRGAN_MODEL_DIR` at that tree, and set `VVR_REALESRGAN_MODEL_NAME` to `realesrgan-x4plus` (or another allowlisted official name). The panel will say this is not the Upscayl Lite model.

Allowed program file names: `realesrgan-ncnn-vulkan.exe`, `upscayl-bin.exe`, and `upscayl-ncnn.exe` (and the same names without `.exe` on Linux). Paths must be absolute unless `VVR_REALESRGAN_PROJECT_ROOT` is set. A shortcut to another program is rejected.

Vulkan comes from the GPU driver. Intel UHD has worked with the official NCNN build in some setups; many machines cannot. There is no CUDA, Python, or PyTorch requirement, and nothing is sent to an external API.

### Environment variables

| Variable | Default | Role |
| --- | --- | --- |
| `VVR_AI_UPSCALER_ENABLED` | off | `true`, `1`, or `yes` turns AI Lite on. Anything else leaves it off. |
| `VVR_REALESRGAN_BINARY` | empty | Absolute path to the allowed executable (or relative when `VVR_REALESRGAN_PROJECT_ROOT` is set). |
| `VVR_REALESRGAN_MODEL_DIR` | empty | Absolute path to the folder that contains `<model>.param` and `<model>.bin` (or relative with `VVR_REALESRGAN_PROJECT_ROOT`). |
| `VVR_REALESRGAN_PROJECT_ROOT` | empty | Repo root used to resolve relative binary/model paths and `tools/realesrgan` discovery. |
| `VVR_REALESRGAN_ENGINE_DIR` | empty | Optional root that mirrors `tools/realesrgan` (`win-x64`/`linux-x64` + `models`). |
| `VVR_REALESRGAN_MODEL_NAME` | `upscayl-lite-4x` | One allowlisted model id. |
| `VVR_REALESRGAN_TIMEOUT_MS` | `180000` | Kills the process after this long. Clamped to 10 seconds–30 minutes. |
| `VVR_REALESRGAN_TILE` | `0` | Passed as `-t`. `0` lets the program pick a tile size. Otherwise 32–512. |
| `VVR_REALESRGAN_MAX_INTERMEDIATE_EDGE` | `8192` | Longest edge of the temporary 4× image. Clamped to 1024–16384. |

`GET /api/image-upscaler/capabilities` checks the files and starts the program with `-h` only. It does not upscale an image. The response names the model and whether it is Upscayl Lite. It does not include file paths or the GPU name.

Arguments passed to the program are a fixed list: input, output, scale, model directory, model name, PNG format, and tile size. The browser cannot add flags.

## Production

`npm run build:prod` bundles the server with esbuild and leaves Sharp external. The Real-ESRGAN executable is not part of the npm bundle; place it under `tools/realesrgan` on the deployment host if you use AI there. The Hostinger deploy archive **excludes** `tools/realesrgan/win-x64` so Windows binaries are not uploaded to Linux shared hosting. On Hostinger, leave `VVR_AI_UPSCALER_ENABLED` unset. Shared hosting is not assumed to have Vulkan, and a missing AI setup must not break Standard.

Image work waits while a Shorts or Screensaver FFmpeg job is active, then continues. It does not join the video render queue.

Finished files live in `server/tmp/upscaler/` and are removed on server boot, when the job is cleared, or after the job TTL (2 hours by default). Temporary AI files next to each output are removed after success, failure, and cancel. Paths are not sent to the browser.

## Limits

Defaults, overridable with environment variables. Values above the caps below are clamped.

| Limit | Default | Variable |
| --- | --- | --- |
| File size | 40 MB | `VVR_UPSCALER_MAX_FILE_MB` (1–80) |
| Images per batch | 8 | `VVR_UPSCALER_MAX_BATCH` (1–12) |
| Input edge | 8192 px | `VVR_UPSCALER_MAX_INPUT_EDGE` |
| Input pixels | 7680×4320 | `VVR_UPSCALER_MAX_INPUT_PIXELS` |
| Output edge | 7680 px | `VVR_UPSCALER_MAX_OUTPUT_EDGE` |
| Output pixels | 7680×4320 | `VVR_UPSCALER_MAX_OUTPUT_PIXELS` |
| Parallel images | 1 | `VVR_UPSCALER_CONCURRENCY` (1–2). AI Lite stays at one. |
| libvips threads | up to 2 | `VVR_UPSCALER_VIPS_CONCURRENCY` (max 4) |
| Keep finished jobs | 2 hours | `VVR_UPSCALER_JOB_TTL_MIN` |
| Free disk required | 512 MB | `VVR_UPSCALER_MIN_FREE_MB` |
| Comparison preview edge | 1440 px | `VVR_UPSCALER_PREVIEW_EDGE` (320–1920) |

Sharp's input pixel cap rejects decompression bombs before a full decode. Inputs, outputs, and previews are files, not one in-memory copy of every image. The ZIP is stored uncompressed and streamed.

## Troubleshooting

- **AI Lite is turned off on this server.** Set `VVR_AI_UPSCALER_ENABLED=true` and restart the server.
- **Needs the Real-ESRGAN program** or **missing the model files.** Check the absolute paths and that `<model>.param` and `<model>.bin` sit directly in the model folder.
- **Pointed at a program this server does not allow.** The file name has to be one of the names listed above.
- **Could not be started** or **could not find a Vulkan graphics device.** The GPU driver has to expose Vulkan. Integrated graphics often cannot.
- **Took too long and was stopped.** Raise `VVR_REALESRGAN_TIMEOUT_MS`, or set `VVR_REALESRGAN_TILE` to `128` or `256` if the GPU runs out of memory on `0`.
- **Unexpected image size.** The model did not return a native 4× image. The job fails instead of substituting Standard.
- Cancel during AI should end `upscayl-bin.exe` or `realesrgan-ncnn-vulkan.exe` in Task Manager. If one remains, the next cancel or a server restart plus the job purge removes the work directory; end the leftover process in Task Manager.

## Licensing

Native binaries and `.bin` weights are **not committed** (see `.gitignore`). Use `npm run setup:ai-lite` or copy files manually; see `tools/realesrgan/THIRD_PARTY_NOTICES.md`.

| Piece | License | How this app uses it |
| --- | --- | --- |
| [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) training code and the official `realesrgan-x4plus`, `realesrgan-x4plus-anime`, and `realesrnet-x4plus` weights | BSD 3-Clause. Copyright (c) 2021 Xintao Wang. | Optional NCNN weights when `VVR_REALESRGAN_MODEL_NAME` selects an official id. |
| [Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) | MIT. Copyright (c) 2021 Xintao Wang. Includes the MIT license of nihui's realsr-ncnn-vulkan (copyright (c) 2019 nihui). | Portable Windows build is downloaded next to the repo via `npm run setup:ai-lite` (optional). |
| [ncnn](https://github.com/Tencent/ncnn) | BSD 3-Clause, Tencent and contributors. | Linked inside the executable above. |
| [Upscayl](https://github.com/upscayl/upscayl) app and [upscayl-ncnn](https://github.com/upscayl/upscayl-ncnn) | GNU AGPL-3.0. | Video's Factory does not link Upscayl; the optional `upscayl-lite-4x` weights are fetched from the Upscayl repo for NCNN. Confirm redistribution obligations before shipping those files. |
| Upscayl Lite model `upscayl-lite-4x` | Published in the Upscayl tree. Verify terms before redistribution; this project does not assert a particular license for the weights. | Downloaded by `npm run setup:ai-lite` or placed manually under `tools/realesrgan/models/`. |

## Measured on this PC

4 November 2026, Windows 11, Intel UHD Graphics, Upscayl's installed `upscayl-bin.exe` and `upscayl-lite-4x`. The source was `client/src/assets/frames/frame-1.png` (3840×2160) cover-cropped to 1972×1109 so the size matches the reported Upscayl test. It is not that original artwork, and there was no Upscayl reference file in the repo to compare pixels against.

| | Lanczos3 | AI Lite |
| --- | --- | --- |
| Output | 3840×2160 PNG | 3840×2160 PNG |
| Time | 1.8 s | 19.8 s |
| File size | 1,024,888 bytes | 952,640 bytes |
| Native model scale | — | 4×, then Lanczos3 to 3840×2160 |
| Peak `upscayl-bin` working set | — | about 485 MB |

The 19.8 seconds include writing the full 4× PNG and fitting it to 3840×2160. The earlier Upscayl Lite timing of about 9.8 seconds is a reference, not a target. This run was slower. Pixel match with the Upscayl app was not measured.

## Known limitations

- Standard enlargement cannot recover real detail. Heavy upscales look soft.
- AI Lite can add detail that was not in the file, and it can change fine artwork. Even with `upscayl-lite-4x`, the final Lanczos fit means the file is not a pixel-identical Upscayl export.
- 8K output and a 4× temporary image need RAM, disk, and time. Lower the limits above if the machine is small.
- The on-screen comparison is a preview. Judge the real file after download or with **Inspect full resolution**.
- CMYK or unusual color profiles are handled by libvips; the output is a normal PNG, JPEG, or WebP.
- The queue is kept in the browser tab. A reload clears the list. Server files from that tab expire on their own.
- Linux can use the same environment variables. It was not run here.
- macOS is rejected. The allowlisted builds targeted here are Windows and Linux.
