#!/usr/bin/env bash
# Linux dev launcher — same stack as `npm run launch` / scripts/launch-dev.cjs
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "[VVR launcher] Run npm install once from: $ROOT" >&2
  exit 1
fi

ai_lite_files_ready() {
  local exe="$ROOT/tools/realesrgan/linux-x64/realesrgan-ncnn-vulkan"
  local model="$ROOT/tools/realesrgan/models/upscayl-lite-4x.param"
  [[ -x "$exe" && -f "$model" ]]
}

should_auto_setup() {
  if [[ "${VVR_AI_UPSCALER_ENABLED:-}" =~ ^(false|0|no)$ ]]; then
    return 1
  fi
  if [[ -n "${VVR_REALESRGAN_BINARY:-}" && -n "${VVR_REALESRGAN_MODEL_DIR:-}" ]]; then
    return 1
  fi
  if [[ "${VVR_SKIP_AI_LITE_SETUP:-}" == "1" ]]; then
    return 1
  fi
  if ai_lite_files_ready; then
    return 1
  fi
  return 0
}

if should_auto_setup; then
  echo "[VVR launcher] AI Lite files missing — running npm run setup:ai-lite (requires network) …"
  npm run setup:ai-lite || echo "[VVR launcher] setup:ai-lite failed; Standard (Lanczos3) still works." >&2
fi

exec node scripts/launch-dev.cjs
