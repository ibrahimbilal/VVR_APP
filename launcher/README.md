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

Place your icon at **`launcher/icon.ico`**. It is embedded at compile time.

If `launcher/icon.ico` is missing, the build copies `client/public/favicon.ico` when present. Otherwise the executable uses the default Windows application icon until you add `launcher/icon.ico` and rebuild.

## Usage

1. Run `npm install` once in the repo root.
2. Double-click **`Video Factory.exe`** (keep it in the repo root or any subfolder — it walks up to find `package.json` / `vvr-app`).
3. Close the console window to stop the dev server (child processes are terminated).

Only one launcher instance can run at a time.
