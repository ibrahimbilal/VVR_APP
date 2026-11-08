# Standalone AI Lite (optional)

Place the NCNN Vulkan runner under `win-x64/` (Windows) or `linux-x64/` (Ubuntu Linux x64) and **shared** model files under `models/`. See `THIRD_PARTY_NOTICES.md` and `MANIFEST.json`.

From the repo root (detects `process.platform` and `process.arch`):

```bash
npm run setup:ai-lite
```

On Ubuntu you can also use:

```bash
npm run launch:linux
# or: bash scripts/launch-linux.sh
```

This downloads official artifacts (see manifest) into gitignored folders, sets `chmod +x` on the Linux binary, and reuses the same `upscayl-lite-4x` model pair on both OSes. You can copy files manually instead.
