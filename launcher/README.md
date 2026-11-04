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

## Usage

1. Run `npm install` once in the repo root.
2. Double-click **`Video Factory.exe`** (keep it in the repo root or any subfolder — it walks up to find `package.json` / `vvr-app`).
3. Close the console window to stop the dev server (child processes are terminated).

Only one launcher instance can run at a time.

## Image Upscaler AI Lite (Windows)

When you start the dev server through **`Video Factory.exe`** or **`npm run launch`**, the launcher looks for Upscayl at `C:\Program Files\Upscayl` (or `VVR_UPSCAYL_INSTALL_DIR`). If `upscayl-bin.exe` and `upscayl-lite-4x` model files are present, it sets these for the Node server (only when you have not set them yourself):

- `VVR_AI_UPSCALER_ENABLED=true`
- `VVR_REALESRGAN_BINARY`
- `VVR_REALESRGAN_MODEL_DIR`
- `VVR_REALESRGAN_MODEL_NAME=upscayl-lite-4x`

Set `VVR_AI_UPSCALER_ENABLED=false` before starting to disable. Rebuild the exe after changing `launcher/Program.cs` with `npm run build:launcher`.
