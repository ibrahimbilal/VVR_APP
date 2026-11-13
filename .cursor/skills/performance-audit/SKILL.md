---
name: performance-audit
description: >-
  Audits render, preview, and export performance in Video's Factory using
  existing benches and known bottlenecks. Use when investigating slow encodes,
  preview jank, upscaler throughput, or asking about FFmpeg/CPU/GPU cost.
---

# Performance audit

## Workflow

1. Identify the surface: Ranking export, Screensaver (VFR vs CFR), Image Motion, Upscaler, or client preview.
2. Read the owning paths from `docs/ai/PROJECT_MAP.md` / `FEATURES.md`.
3. Prefer existing scripts before inventing new probes:
   - `npm run bench:ranking` / `bench:screensaver` / `bench:screensaver-cfr` / `bench:screensaver-subscribe` / `bench:screensaver-compose`
   - Reports under `docs/*benchmark*` / `docs/screensaver-*` / `docs/optimized-cfr-*`
4. Check known costs: one FFmpeg at a time, overlay PNG count, subscribe animation frame uploads, upscaler mid/ intermediates, WebGL vs CPU screensaver preview.
5. Propose changes that preserve quality gates and verification (`ffprobe` / existing tests).

## Constraints

- Do not claim measured wins without running a bench or citing an existing report.
- Do not enable parallel FFmpeg product encodes.
- Hardware encoder Auto already has CPU fallback rules in `encoders.ts` — do not bypass them casually.
- Keep preview↔export alignment when changing graphs or composition.

## Validation

- [ ] Bottleneck named with evidence (bench, report, or code path)
- [ ] Recommendation lists trade-offs (speed vs quality/size)
- [ ] No unverified “X% faster” claims
