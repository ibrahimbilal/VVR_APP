'use strict'

const fs = require('node:fs')
const path = require('node:path')

const MODEL_NAME = 'upscayl-lite-4x'

function upscaylInstallRoot(env = process.env) {
  return env.VVR_UPSCAYL_INSTALL_DIR || 'C:\\Program Files\\Upscayl'
}

/** Paths to upscayl-bin and models when a Lite install is present. Empty when not. */
function detectUpscaylLite(env = process.env) {
  if (process.platform !== 'win32') return null
  const disabled = env.VVR_AI_UPSCALER_ENABLED
  if (disabled === 'false' || disabled === '0' || disabled === 'no') return null
  const root = upscaylInstallRoot(env)
  const binary = path.join(root, 'resources', 'bin', 'upscayl-bin.exe')
  const modelDir = path.join(root, 'resources', 'models')
  if (!fs.existsSync(binary)) return null
  if (!fs.existsSync(path.join(modelDir, `${MODEL_NAME}.param`))) return null
  if (!fs.existsSync(path.join(modelDir, `${MODEL_NAME}.bin`))) return null
  return { binary, modelDir, modelName: MODEL_NAME, root }
}

/** Env keys for AI Lite. Only fills values that are not already set. */
function upscalerAiEnvPatch(env = process.env) {
  const found = detectUpscaylLite(env)
  if (!found) return {}
  const patch = {}
  if (!env.VVR_AI_UPSCALER_ENABLED) patch.VVR_AI_UPSCALER_ENABLED = 'true'
  if (!env.VVR_REALESRGAN_BINARY) patch.VVR_REALESRGAN_BINARY = found.binary
  if (!env.VVR_REALESRGAN_MODEL_DIR) patch.VVR_REALESRGAN_MODEL_DIR = found.modelDir
  if (!env.VVR_REALESRGAN_MODEL_NAME) patch.VVR_REALESRGAN_MODEL_NAME = found.modelName
  return patch
}

function applyAiUpscalerEnv(env = process.env) {
  return { ...env, ...upscalerAiEnvPatch(env) }
}

module.exports = {
  MODEL_NAME,
  upscaylInstallRoot,
  detectUpscaylLite,
  upscalerAiEnvPatch,
  applyAiUpscalerEnv,
}
