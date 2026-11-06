# Video Factory launcher (Windows)

Lightweight native launcher — runs `npm run dev` from the repo root and opens the Vite URL when ready.

## Build

Requires [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) on Windows (build machine only). End users do **not** need .NET installed; the published `.exe` is self-contained.

If restore fails with **NU1100**, NuGet had no feed configured. This repo includes `launcher/nuget.config` pointing at nuget.org. You can also run once:

```bash
dotnet nuget add source https://api.nuget.org/v3/index.json -n nuget.org
```

From the repo root:

```bash
npm run build:launcher
```

Output: `Video Factory.exe` in the repo root.

## Icon

Put your favicon pack in **`client/public/`** (`favicon.ico`, PNG sizes, etc.). On each `npm run build:launcher`, the build syncs **`client/public/favicon.ico`** → **`launcher/icon.ico`** whenever the file changed, then embeds it in the `.exe`.

You can still commit a custom **`launcher/icon.ico`** only if you do not use `client/public/favicon.ico` as the source.

## Environment

Optional **`.env`** in the repo root (copy from **`.env.example`**): `Video factory.exe` reads it into the launcher process before starting `npm run dev`, so you can set `VVR_*` (and other) variables without the Windows shell. Existing environment variables still win. The Node server also loads the same file when it starts.

**AI Lite auto-setup:** On Windows, if AI is not disabled (`VVR_AI_UPSCALER_ENABLED` not `false`/`0`/`no`), you have not set **both** `VVR_REALESRGAN_BINARY` and `VVR_REALESRGAN_MODEL_DIR`, and the standalone files under `tools/realesrgan/` are still missing, the launcher runs **`npm run setup:ai-lite`** once (downloads the NCNN build and model; needs **network**). To skip this, set both paths yourself or place the files under `tools/realesrgan/` before starting.

## Usage

1. Run `npm install` once in the repo root.
2. Double-click **`Video Factory.exe`** (keep it in the repo root or any subfolder — it walks up to find `package.json` / `vvr-app`). It opens **`http://127.0.0.1:5173/`** (Vite dev UI). Port **3001** is the API only.
3. Close the console window to stop the dev server (child processes are terminated).

Only one launcher instance can run at a time.

## Image Upscaler AI Lite (Windows)

When you start the dev server through **`Video Factory.exe`** or **`npm run launch`**, the launcher looks under **`tools/realesrgan/`** for `win-x64/realesrgan-ncnn-vulkan.exe` and `models/upscayl-lite-4x.{param,bin}` (or your chosen `VVR_REALESRGAN_MODEL_NAME`). Populate that folder with `npm run setup:ai-lite` from the repo root, or copy files manually (see `docs/image-upscaler.md`).

If the engine and model files are present **and** a quick `realesrgan-ncnn-vulkan.exe -h` succeeds (Vulkan available), it prints **`[VVR] AI Lite: Ready (standalone engine)`** and sets (only when a value is not already in your environment):

- `VVR_AI_UPSCALER_ENABLED=true`
- `VVR_REALESRGAN_BINARY`
- `VVR_REALESRGAN_MODEL_DIR`
- `VVR_REALESRGAN_MODEL_NAME`
- `VVR_REALESRGAN_PROJECT_ROOT`

If files are missing or Vulkan is not available, it prints **`[VVR] AI Lite: Unavailable — missing engine, model, or Vulkan support`** and still starts the dev server.

Set `VVR_AI_UPSCALER_ENABLED=false` before starting to disable. Rebuild the exe after changing `launcher/Program.cs` with `npm run build:launcher`.
