# Image Upscaler

Image Upscaler is a Video's Factory app at `/image-upscaler`. It resizes PNG, JPEG, and WebP images on the Video's Factory server with [Sharp](https://sharp.pixelplumbing.com/) (libvips) and the **Lanczos3** kernel.

Lanczos3 is a traditional resampling filter. It calculates new pixels from neighboring pixels that are already in the file. It does not reconstruct texture, text, or brushwork that was never captured, and it is not an AI upscaler.

## Open it

- Dashboard card **Image Upscaler**
- Sidebar and the mobile navigation drawer
- Direct URL `/image-upscaler`

Choose images, set the output, then press **Upscale Images**. Selecting files does not start processing.

## Formats

| | |
| --- | --- |
| Input | PNG, JPEG/JPG, WebP. The server checks the file contents, not only the extension. |
| Output | PNG (lossless), JPEG, or WebP |
| Transparency | Kept for PNG and WebP. JPEG cannot store transparency, so those pixels are flattened onto the padding color (black, white, or a custom color). |
| Animated images | Rejected. Export a single frame first. |
| Orientation | EXIF orientation is applied before the output size is calculated. |

## Resolutions

| Preset | Pixels |
| --- | --- |
| Full HD | 1920×1080 |
| 2K / QHD | 2560×1440 |
| 4K UHD (default) | 3840×2160 |
| 8K UHD | 7680×4320 |
| Custom | Whole-number width and height inside the server limits |

Every preset except Custom is forced to those exact dimensions. The job fails if the file Sharp writes does not decode to the requested width, height, and format.

The panel shows the original size, aspect ratio, target size, scale, original file size, and the output file size after processing. A large enlargement from a small original shows a warning. If the image is already the target size, **Skip Lanczos resampling** (on by default) copies it when no sharpen or format change is required.

## Resize modes

The active mode is labeled in the settings panel.

- **Contain** (default) keeps the whole image and pads the canvas. Padding can be black, white, a custom color, or transparent when the output format supports it.
- **Cover** fills the canvas and crops the overflow. Crop position is center, top, bottom, left, or right.
- **Fill** stretches to the exact target size and can distort proportions. The panel says so when Fill is selected.

## Sharpen

Sharpen is off by default. **None**, **Subtle**, and **Moderate** are separate from Lanczos3. Subtle and Moderate map to small Sharp `sharpen` values chosen to limit halos. **Reset** returns the control to None. Sharpening runs at most once, after resizing.

## Batch, download, comparison

Add up to 8 images. They share one resolution and export setup and are processed one at a time. Each row is Pending, Processing, Completed, Failed, or Cancelled. The active image shows an indeterminate indicator. The UI does not invent a percentage.

Download a finished image on its own, or **Download all ZIP** when more than one image succeeded. ZIP names look like `landscape_4K_3840x2160.png`. Two files named `landscape.png` become `landscape_4K_3840x2160.png` and `landscape_4K_3840x2160_2.png`. Names are sanitized and are not filesystem paths.

The before/after slider shows both pictures at the same preview size (long edge 1440px by default). The original is not blurred. Zoom, pan, and **Reset view** affect that preview only. The download is the full-size file.

## Send to Screensaver

**Send to Screensaver** downloads the full processed image (not the preview) and opens Screensaver with that file as the source.

If Screensaver already has an image or video, the app asks before replacing it. **Keep current** does nothing. **Replace** uses the same path as dropping a new image: static mode, the picture is framed again, and the selected decorative frame is kept. Project name, duration, output resolution, audio, and encoder are left as they were. A full page reload still follows Screensaver's own rule of clearing the cached source when that editor opens.

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

Sharp is a **server** dependency (`server/package.json`). The client copy of Sharp is only a devDependency for frame thumbnails and is not the upscaler runtime.

## Production

`npm run build:prod` bundles the server with esbuild and leaves Sharp external, so the host must `npm install` production dependencies. Sharp's libvips binary has to match the host (Hostinger's Node 22 Linux build installs it from this package). No GPU, Python, or external API is required.

Image work waits while a Shorts or Screensaver FFmpeg job is active, then continues. It does not join the video render queue. One image is transformed at a time unless `VVR_UPSCALER_CONCURRENCY` is set to `2`.

Finished files live in `server/tmp/upscaler/` and are removed on server boot, when the job is cleared, or after the job TTL (2 hours by default). Paths are not sent to the browser.

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
| Parallel images | 1 | `VVR_UPSCALER_CONCURRENCY` (1–2) |
| libvips threads | up to 2 | `VVR_UPSCALER_VIPS_CONCURRENCY` (max 4) |
| Keep finished jobs | 2 hours | `VVR_UPSCALER_JOB_TTL_MIN` |
| Free disk required | 512 MB | `VVR_UPSCALER_MIN_FREE_MB` |
| Comparison preview edge | 1440 px | `VVR_UPSCALER_PREVIEW_EDGE` (320–1920) |

Sharp's input pixel cap rejects decompression bombs before a full decode. Inputs, outputs, and previews are files, not one in-memory copy of every image. The ZIP is stored uncompressed and streamed.

## Known limitations

- Enlargement cannot recover real detail. Heavy upscales look soft.
- 8K output needs RAM, disk, and time on a CPU-only host. Lower the limits above if the machine is small.
- The on-screen comparison is a preview. Judge the real file after download.
- CMYK or unusual color profiles are handled by libvips; the output is a normal PNG, JPEG, or WebP.
- The queue is kept in the browser tab. A reload clears the list. Server files from that tab expire on their own.
- No Real-ESRGAN or other AI backend is installed. The server engine is a single `process(input, output, options)` function so another local backend can be added later without rebuilding the screen.
