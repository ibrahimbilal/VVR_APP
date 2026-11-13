# Changelog

All notable user-facing changes to Ribo Studio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Authoritative version: root `package.json` `"version"`.
Detailed agent-oriented development notes: `docs/ai/CHANGELOG.md`.

## [Unreleased]

### Changed

- Renamed remaining internal `vvr` / `VVR_*` identifiers to `ribo` / `RIBO_*` (packages, IndexedDB, env keys, Cursor skills/rules). Existing browser data and `VVR_*` env values migrate once onto the new names.
- Windows launcher output renamed from `Video factory.exe` to **`Ribo Studio.exe`** (`npm run build:launcher`).

### Removed

- Hostinger upload/deploy tooling (`hostinger-ribo-deploy` skill/rule, `npm run pack:hostinger`, `scripts/make-deploy-archive.mjs`, `archiver`).

## [1.0.0] — 2026-11-13

First official stable release of **Ribo Studio** (repository [ibrahimbilal/ribo-studio](https://github.com/ibrahimbilal/ribo-studio)).

This rebaseline establishes SemVer **1.0.0** as the product baseline. It is a branding and release-process milestone, not a rewrite of the application or its development history. Git commits, branches, and any existing tags remain unchanged. At 1.0.0, compatibility-sensitive identifiers still used the legacy `vvr` prefix (`vvr-app`, IndexedDB `vvr`, `vvr-app.zip`, `VVR_*`); those were renamed afterward (see Unreleased).

### Changed

- Product display name: **Video's Factory** → **Ribo Studio** (UI shell, docs, and repository identity).
- Official SemVer baseline set to **1.0.0**. Earlier `package.json` values such as `3.0.0` were arbitrary development metadata only — no matching Git release tag or GitHub Release existed for them.
- Version & release management: Keep a Changelog, `scripts/release.mjs` (`npm run release:*`), sidebar version label via Vite `__APP_VERSION__`, and the `release-manager` skill.
- AI context docs under `docs/ai/`; deep project map split into `.cursor/skills/ribo-project/` topic files.

### Included applications (verified at baseline)

| App | Route | What ships in 1.0.0 |
| --- | --- | --- |
| Dashboard | `/` | Multi-app shell entry; cards from nav items |
| Shorts — Ranking | `/shorts` | Vertical 9:16 ranking compilations (clips, titles, transitions, audio); FFmpeg export |
| Shorts — Image Motion | `/shorts` | Stills → pan motion, transitions, optional music; FFmpeg export |
| Screensaver | `/screensaver` | Long-form 16:9 ambient from image or looping clip; frames/adjustments; Fast VFR or Optimized CFR; multi-project IndexedDB |
| Thumbnail Studio | `/thumbnails` | Browser-only 16:9 YouTube thumbnails with resolution/duration badges; PNG/JPEG; no FFmpeg |
| Image Upscaler | `/upscale` | Exact Full HD / 2K / 4K / 8K; Lanczos3 standard; optional local Real-ESRGAN AI Lite |
| Audio Looper | `/looper` | Exact-length ambient beds from one or more tracks; Simple loop or Seamless crossfade; MP3/WAV/FLAC |

### Platform capabilities included

- Local-only workspace: Vue client + Express/FFmpeg server; no accounts or cloud project storage.
- Shared export job queue, notifications, cancel/download, and reload recovery for active renders.
- Cross-app transfers where implemented (e.g. Screensaver → Thumbnail / Image Motion).

### Legacy metadata (not official releases)

Root `package.json` previously listed **3.0.0** during development. That number was never published as an annotated Git tag (`v3.0.0`) or GitHub Release. It must not be treated as a prior official Ribo Studio release.

Full pre-baseline engineering notes remain in `docs/ai/CHANGELOG.md` and the Git commit history.
