import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { EngineCapability } from '../../shared/imageUpscaler'
import { probeRealesrganBinary, type RealesrganProbe } from './realesrganProbe'

/**
 * Models this server is willing to pass to realesrgan-ncnn-vulkan.
 * `upscayl-lite-4x` is the current Upscayl Lite id (native 4×). It is not one of the
 * official Real-ESRGAN weight files, so it is only used when those files are installed.
 * The other names are the official NCNN models shipped with Real-ESRGAN.
 */
export const REALESRGAN_MODELS = {
  'upscayl-lite-4x': { scale: 4, matchesUpscaylLite: true },
  'realesrgan-x4plus': { scale: 4, matchesUpscaylLite: false },
  'realesrgan-x4plus-anime': { scale: 4, matchesUpscaylLite: false },
  'realesrnet-x4plus': { scale: 4, matchesUpscaylLite: false },
} as const

export type RealesrganModelName = keyof typeof REALESRGAN_MODELS

const ALLOWED_BINARIES = new Set([
  'realesrgan-ncnn-vulkan',
  'realesrgan-ncnn-vulkan.exe',
  'upscayl-bin',
  'upscayl-bin.exe',
  'upscayl-ncnn',
  'upscayl-ncnn.exe',
])

export interface RealesrganConfig {
  binary: string
  modelDir: string
  modelName: RealesrganModelName
  scale: number
  matchesUpscaylLite: boolean
  timeoutMs: number
  tile: number
  maxIntermediateEdge: number
}

export type AppEnv = Record<string, string | undefined>

type ReadResult =
  | { ok: true; config: RealesrganConfig }
  | { ok: false; reason: string; model: string | null; scale: number | null; matchesUpscaylLite: boolean }

const DEFAULT_MODEL: RealesrganModelName = 'upscayl-lite-4x'

export function readRealesrgan(env: AppEnv, platform: NodeJS.Platform = process.platform): ReadResult {
  const named = modelChoice(env.VVR_REALESRGAN_MODEL_NAME)
  if (!aiEnabled(env.VVR_AI_UPSCALER_ENABLED)) {
    return {
      ok: false,
      reason: 'AI Lite is turned off on this server.',
      model: named.model,
      scale: named.scale,
      matchesUpscaylLite: named.matchesUpscaylLite,
    }
  }
  if (platform !== 'win32' && platform !== 'linux') {
    return { ok: false, reason: 'AI Lite supports Windows and Linux only.', model: named.model, scale: named.scale, matchesUpscaylLite: named.matchesUpscaylLite }
  }
  if (!named.known) {
    return { ok: false, reason: 'AI Lite is configured with a model this server does not allow.', model: null, scale: null, matchesUpscaylLite: false }
  }
  return {
    ok: true,
    config: {
      binary: env.VVR_REALESRGAN_BINARY?.trim() ?? '',
      modelDir: env.VVR_REALESRGAN_MODEL_DIR?.trim() ?? '',
      modelName: named.model as RealesrganModelName,
      scale: named.scale ?? 4,
      matchesUpscaylLite: named.matchesUpscaylLite,
      timeoutMs: clamp(env.VVR_REALESRGAN_TIMEOUT_MS, 10_000, 30 * 60 * 1000, 180_000),
      tile: tileSize(env.VVR_REALESRGAN_TILE),
      maxIntermediateEdge: clamp(env.VVR_REALESRGAN_MAX_INTERMEDIATE_EDGE, 1024, 16384, 8192),
    },
  }
}

/** Confirms the configured files exist and stay inside the model directory. Does not start the program. */
export async function resolveRealesrganFiles(config: RealesrganConfig): Promise<{ ok: true; config: RealesrganConfig } | { ok: false; reason: string }> {
  const binary = await resolveBinary(config.binary)
  if (!binary.ok) return binary
  const modelDir = await resolveModelDir(config.modelDir, config.modelName)
  if (!modelDir.ok) return modelDir
  return { ok: true, config: { ...config, binary: binary.path, modelDir: modelDir.path } }
}

export async function assessRealesrgan(
  env: AppEnv,
  probe: RealesrganProbe = probeRealesrganBinary,
  platform: NodeJS.Platform = process.platform,
): Promise<{ capability: EngineCapability; config: RealesrganConfig | null }> {
  const read = readRealesrgan(env, platform)
  const blank: EngineCapability = {
    available: false,
    model: read.ok ? read.config.modelName : read.model,
    scale: read.ok ? read.config.scale : read.scale,
    matchesUpscaylLite: read.ok ? read.config.matchesUpscaylLite : read.matchesUpscaylLite,
    reason: read.ok ? null : read.reason,
  }
  if (!read.ok) return { capability: blank, config: null }
  const files = await resolveRealesrganFiles(read.config)
  if (!files.ok) {
    return { capability: { ...blank, available: false, reason: files.reason }, config: null }
  }
  let probed: { ok: boolean; vulkanFailed: boolean }
  try {
    probed = await probe(files.config.binary)
  } catch {
    probed = { ok: false, vulkanFailed: false }
  }
  if (probed.vulkanFailed) {
    return {
      capability: { ...blank, model: files.config.modelName, scale: files.config.scale, matchesUpscaylLite: files.config.matchesUpscaylLite, reason: 'AI Lite could not find a Vulkan graphics device.' },
      config: null,
    }
  }
  if (!probed.ok) {
    return {
      capability: { ...blank, model: files.config.modelName, scale: files.config.scale, matchesUpscaylLite: files.config.matchesUpscaylLite, reason: 'The Real-ESRGAN program could not be started.' },
      config: null,
    }
  }
  return {
    capability: {
      available: true,
      model: files.config.modelName,
      scale: files.config.scale,
      matchesUpscaylLite: files.config.matchesUpscaylLite,
      reason: null,
    },
    config: files.config,
  }
}

function aiEnabled(value: string | undefined): boolean {
  const text = value?.trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

function modelChoice(value: string | undefined): { known: boolean; model: string | null; scale: number | null; matchesUpscaylLite: boolean } {
  const name = (value?.trim() || DEFAULT_MODEL) as string
  if (!Object.prototype.hasOwnProperty.call(REALESRGAN_MODELS, name)) {
    return { known: false, model: null, scale: null, matchesUpscaylLite: false }
  }
  const model = REALESRGAN_MODELS[name as RealesrganModelName]
  return { known: true, model: name, scale: model.scale, matchesUpscaylLite: model.matchesUpscaylLite }
}

function tileSize(value: string | undefined): number {
  if (value == null || value.trim() === '') return 0
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) return 0
  return Math.min(512, Math.max(32, number))
}

function clamp(value: string | undefined, min: number, max: number, fallback: number): number {
  if (value == null || value.trim() === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

async function resolveBinary(binary: string): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (!binary || !path.isAbsolute(binary)) {
    return { ok: false, reason: 'AI Lite is not configured with a usable program path.' }
  }
  let real: string
  try {
    real = await realpath(binary)
    const info = await stat(real)
    if (!info.isFile() || info.size < 1) return { ok: false, reason: 'AI Lite needs the Real-ESRGAN program installed on the server.' }
  } catch {
    return { ok: false, reason: 'AI Lite needs the Real-ESRGAN program installed on the server.' }
  }
  if (!ALLOWED_BINARIES.has(path.basename(real).toLowerCase())) {
    return { ok: false, reason: 'AI Lite is pointed at a program this server does not allow.' }
  }
  if (process.platform !== 'win32') {
    try {
      const info = await stat(real)
      if ((info.mode & 0o111) === 0) return { ok: false, reason: 'The Real-ESRGAN program could not be started.' }
    } catch {
      return { ok: false, reason: 'AI Lite needs the Real-ESRGAN program installed on the server.' }
    }
  }
  return { ok: true, path: real }
}

async function resolveModelDir(modelDir: string, modelName: string): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (!modelDir || !path.isAbsolute(modelDir)) {
    return { ok: false, reason: 'AI Lite is missing the model files for the selected model.' }
  }
  let root: string
  try {
    root = await realpath(modelDir)
    const info = await stat(root)
    if (!info.isDirectory()) return { ok: false, reason: 'AI Lite is missing the model files for the selected model.' }
  } catch {
    return { ok: false, reason: 'AI Lite is missing the model files for the selected model.' }
  }
  const param = path.join(root, `${modelName}.param`)
  const bin = path.join(root, `${modelName}.bin`)
  try {
    const [paramReal, binReal, paramInfo, binInfo] = await Promise.all([realpath(param), realpath(bin), stat(param), stat(bin)])
    if (!sameDir(path.dirname(paramReal), root) || !sameDir(path.dirname(binReal), root)) {
      return { ok: false, reason: 'AI Lite is missing the model files for the selected model.' }
    }
    if (!paramInfo.isFile() || !binInfo.isFile() || paramInfo.size < 1 || binInfo.size < 1) {
      return { ok: false, reason: 'AI Lite is missing the model files for the selected model.' }
    }
  } catch {
    return { ok: false, reason: 'AI Lite is missing the model files for the selected model.' }
  }
  return { ok: true, path: root }
}

function sameDir(left: string, right: string): boolean {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}
