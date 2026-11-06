'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_MODEL = 'upscayl-lite-4x'

function isAiExplicitlyDisabled(value) {
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'false' || text === '0' || text === 'no'
}

/**
 * Standalone layout: tools/realesrgan/<platform>/realesrgan-ncnn-vulkan[.exe] and tools/realesrgan/models/
 */
function detectStandaloneEngine(projectRoot, env = process.env) {
  if (isAiExplicitlyDisabled(env.VVR_AI_UPSCALER_ENABLED)) return null
  const plat = process.platform
  if (plat !== 'win32' && plat !== 'linux') return null

  const engineRoot = env.VVR_REALESRGAN_ENGINE_DIR
    ? path.resolve(env.VVR_REALESRGAN_ENGINE_DIR)
    : path.join(projectRoot, 'tools', 'realesrgan')
  const sub = plat === 'win32' ? 'win-x64' : 'linux-x64'
  const exe = plat === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan'
  const defaultBinary = path.join(engineRoot, sub, exe)
  const defaultModelDir = path.join(engineRoot, 'models')
  const modelName = (env.VVR_REALESRGAN_MODEL_NAME || DEFAULT_MODEL).trim()

  const binary = env.VVR_REALESRGAN_BINARY ? path.resolve(env.VVR_REALESRGAN_BINARY) : defaultBinary
  const modelDir = env.VVR_REALESRGAN_MODEL_DIR ? path.resolve(env.VVR_REALESRGAN_MODEL_DIR) : defaultModelDir

  const hasBin = fs.existsSync(binary)
  const hasModels =
    fs.existsSync(modelDir) &&
    fs.existsSync(path.join(modelDir, `${modelName}.param`)) &&
    fs.existsSync(path.join(modelDir, `${modelName}.bin`))
  if (!hasBin || !hasModels) return null
  return { binary, modelDir, modelName }
}

/** Same heuristics as server/src/realesrganProbe.ts */
function probeBinaryHelp(binary) {
  try {
    const out = execFileSync(binary, ['-h'], {
      encoding: 'utf8',
      timeout: 8000,
      maxBuffer: 8192,
      windowsHide: true,
    })
    const text = `${out}`
    if (/no vulkan|vulkan.*not (?:available|found)|vkEnumeratePhysicalDevices failed|failed to create .*vulkan/i.test(text)) {
      return { ok: false, vulkanFailed: true }
    }
    if (/usage|realesrgan|upscayl|-i input/i.test(text)) return { ok: true, vulkanFailed: false }
    return { ok: false, vulkanFailed: false }
  } catch (err) {
    const e = /** @type {{ stderr?: Buffer | string; stdout?: Buffer | string; message?: string }} */ (err)
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString?.('utf8') ?? ''
    const stdout = typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString?.('utf8') ?? ''
    const text = `${stderr}\n${stdout}\n${e.message ?? ''}`
    if (/no vulkan|vulkan.*not (?:available|found)|vkEnumeratePhysicalDevices failed|failed to create .*vulkan/i.test(text)) {
      return { ok: false, vulkanFailed: true }
    }
    return { ok: false, vulkanFailed: false }
  }
}

/**
 * Fills env for the dev server when standalone files exist and the user has not overridden keys.
 * @returns {{ patch: Record<string, string>, standalone: ReturnType<typeof detectStandaloneEngine> | null, probe: ReturnType<typeof probeBinaryHelp> | null }}
 */
function aiLiteEnvPatch(projectRoot, env = process.env) {
  const standalone = detectStandaloneEngine(projectRoot, env)
  if (!standalone) return { patch: {}, standalone: null, probe: null }

  const patch = {}
  if (!env.VVR_AI_UPSCALER_ENABLED) patch.VVR_AI_UPSCALER_ENABLED = 'true'
  if (!env.VVR_REALESRGAN_BINARY) patch.VVR_REALESRGAN_BINARY = standalone.binary
  if (!env.VVR_REALESRGAN_MODEL_DIR) patch.VVR_REALESRGAN_MODEL_DIR = standalone.modelDir
  if (!env.VVR_REALESRGAN_MODEL_NAME) patch.VVR_REALESRGAN_MODEL_NAME = standalone.modelName
  if (!env.VVR_REALESRGAN_PROJECT_ROOT) patch.VVR_REALESRGAN_PROJECT_ROOT = projectRoot

  const probe = probeBinaryHelp(standalone.binary)
  return { patch, standalone, probe }
}

function applyAiLiteEnv(projectRoot, env = process.env) {
  const { patch, standalone, probe } = aiLiteEnvPatch(projectRoot, env)
  return { ...env, ...patch, _vvrAiLite: { standalone, probe } }
}

module.exports = {
  DEFAULT_MODEL,
  detectStandaloneEngine,
  probeBinaryHelp,
  aiLiteEnvPatch,
  applyAiLiteEnv,
}
