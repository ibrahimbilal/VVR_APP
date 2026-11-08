import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { EngineCapability, ImageUpscaleEngine, UpscalerCapabilities, UpscaleLimits, UpscaleOptions, UpscaleProcessContext, UpscaleResult, UpscaleStageResult } from '../../shared/imageUpscaler'
import { resolveEffectiveScale, resolveIntermediateDimensions } from '../../shared/imageUpscaler'
import { createLanczosEngine, inspectImage, runExportStage, UpscaleError } from './imageUpscaler'
import type { UpscaleEngineRegistry } from './imageUpscalerJobs'
import { runNativeProcess, type NativeRunOptions, type NativeRunResult } from './nativeProcess'
import { assessRealesrgan, readRealesrgan, resolveRealesrganFiles, type AppEnv, type RealesrganConfig } from './realesrganConfig'
import { probeRealesrganBinary, type RealesrganProbe } from './realesrganProbe'

export interface RealesrganEngineDeps {
  env?: () => AppEnv
  run?: (command: string, args: readonly string[], options: NativeRunOptions) => Promise<NativeRunResult>
  probe?: RealesrganProbe
  platform?: NodeJS.Platform
  cacheMs?: number
}

/**
 * Real-ESRGAN NCNN Vulkan at the model's native 4× scale, then Lanczos to the effective intermediate size.
 * Export fitting happens separately in the job pipeline.
 */
export function createRealesrganEngine(deps: RealesrganEngineDeps = {}): ImageUpscaleEngine {
  const env = deps.env ?? (() => process.env)
  const run = deps.run ?? runNativeProcess
  return {
    id: 'realesrgan-lite',
    runUpscaleStage: (inputPath, intermediatePath, options, effectiveScale, limits, context) =>
      runUpscaleStageAi(inputPath, intermediatePath, options, effectiveScale, limits, context, env, run, deps.platform),
    async process(inputPath, outputPath, options, limits, context) {
      const info = await inspectImage(inputPath, limits)
      const { effectiveScale } = resolveEffectiveScale(options, info.width, info.height, limits)
      const work = `${outputPath}.stage.png`
      const stage = await runUpscaleStageAi(inputPath, work, options, effectiveScale, limits, context, env, run, deps.platform)
      try {
        const fitted = await runExportStage(work, outputPath, options, info.width, info.height, stage.width, stage.height, limits)
        return { ...fitted, note: stage.note ?? null, skippedResize: fitted.skippedResize }
      } finally {
        await rm(work, { force: true }).catch(() => undefined)
      }
    },
  }
}

async function runUpscaleStageAi(
  inputPath: string,
  intermediatePath: string,
  _options: UpscaleOptions,
  effectiveScale: number,
  limits: UpscaleLimits,
  context: UpscaleProcessContext | undefined,
  env: () => AppEnv,
  run: (command: string, args: readonly string[], options: NativeRunOptions) => Promise<NativeRunResult>,
  platform?: NodeJS.Platform,
): Promise<UpscaleStageResult> {
  throwIfCancelled(context?.signal)
  const ready = await runnableConfig(env(), platform)
  if (!ready.ok) throw new UpscaleError(ready.reason)
  const config = ready.config
  const info = await inspectImage(inputPath, limits)
  const file = await stat(inputPath)
  if (file.size > limits.maxFileBytes) {
    throw new UpscaleError(`Images must be ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB or smaller.`)
  }
  const target = resolveIntermediateDimensions(info.width, info.height, effectiveScale)
  const planned = planAiInputSize(info.width, info.height, config.scale, config.maxIntermediateEdge, config.maxIntermediateEdge * config.maxIntermediateEdge)
  const work = `${intermediatePath}.aiwork`
  await mkdir(work, { recursive: true })
  const notes: string[] = []
  try {
    throwIfCancelled(context?.signal)
    const prepared = path.join(work, 'input.png')
    const aiOutput = path.join(work, 'model.png')
    let pipeline = sharp(inputPath, { failOn: 'error', animated: false, limitInputPixels: limits.maxInputPixels, sequentialRead: true }).rotate()
    if (planned.reduced) {
      pipeline = pipeline.resize(planned.width, planned.height, { kernel: sharp.kernel.lanczos3, fit: 'fill', withoutEnlargement: true })
    }
    await pipeline.png({ compressionLevel: 1 }).toFile(prepared)
    throwIfCancelled(context?.signal)
    const preparedMeta = await sharp(prepared).metadata()
    const preparedWidth = preparedMeta.width ?? 0
    const preparedHeight = preparedMeta.height ?? 0
    if (preparedWidth < 1 || preparedHeight < 1) throw new UpscaleError('The image could not be prepared for AI upscaling.')
    const args = [
      '-i',
      prepared,
      '-o',
      aiOutput,
      '-s',
      String(config.scale),
      '-m',
      config.modelDir,
      '-n',
      config.modelName,
      '-f',
      'png',
      '-t',
      String(config.tile),
    ]
    let result: NativeRunResult
    try {
      result = await run(config.binary, args, { timeoutMs: config.timeoutMs, signal: context?.signal })
    } catch {
      throw new UpscaleError('The Real-ESRGAN program could not be started.')
    }
    if (result.cancelled || context?.signal?.aborted) throw new UpscaleError('AI upscaling was cancelled.')
    if (result.timedOut) throw new UpscaleError('AI upscaling took too long and was stopped.')
    if (result.code !== 0) {
      logAiFailure(result.stderr)
      throw new UpscaleError(failureMessage(result.stderr))
    }
    let aiWidth = 0
    let aiHeight = 0
    let aiHasAlpha = false
    try {
      const aiMeta = await sharp(aiOutput, { failOn: 'error', animated: false, limitInputPixels: false }).metadata()
      aiWidth = aiMeta.width ?? 0
      aiHeight = aiMeta.height ?? 0
      aiHasAlpha = aiMeta.hasAlpha === true
    } catch {
      throw new UpscaleError('AI upscaling did not produce an image.')
    }
    if (aiWidth !== preparedWidth * config.scale || aiHeight !== preparedHeight * config.scale) {
      throw new UpscaleError('The AI model returned an unexpected image size.')
    }
    if (planned.reduced) {
      notes.push('The image was reduced before AI upscaling so the temporary image stays within the memory limit.')
    }
    if (info.hasAlpha && !aiHasAlpha) {
      notes.push('The AI model did not keep transparency. Transparent areas were flattened on the intermediate.')
    }
    throwIfCancelled(context?.signal)
    const needsResize = aiWidth !== target.width || aiHeight !== target.height
    if (needsResize) {
      await sharp(aiOutput, { failOn: 'error', animated: false, limitInputPixels: false })
        .resize(target.width, target.height, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
        .png({ compressionLevel: 1 })
        .toFile(intermediatePath)
    } else {
      const { copyFile } = await import('node:fs/promises')
      await copyFile(aiOutput, intermediatePath)
    }
    const written = await sharp(intermediatePath).metadata()
    return {
      width: written.width ?? target.width,
      height: written.height ?? target.height,
      effectiveScale,
      aiRan: true,
      skippedUpscale: false,
      note: notes.join(' ') || null,
    }
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function createUpscaleEngineRegistry(deps: RealesrganEngineDeps = {}): UpscaleEngineRegistry {
  const lanczos = createLanczosEngine()
  const ai = createRealesrganEngine(deps)
  const env = deps.env ?? (() => process.env)
  const probe = deps.probe ?? probeRealesrganBinary
  const cacheMs = deps.cacheMs ?? 10_000
  let cache: { at: number; pending: Promise<{ capability: EngineCapability; config: RealesrganConfig | null }> } | null = null

  function assessed() {
    const now = Date.now()
    if (cache && now - cache.at < cacheMs) return cache.pending
    const pending = assessRealesrgan(env(), probe, deps.platform)
    cache = { at: now, pending }
    return pending
  }

  return {
    resolve(id) {
      return id === 'realesrgan-lite' ? ai : lanczos
    },
    async unavailableReason(id) {
      if (id !== 'realesrgan-lite') return null
      const result = await assessed()
      return result.capability.available ? null : result.capability.reason ?? 'AI Lite is not available on this server.'
    },
    async capabilities(): Promise<UpscalerCapabilities> {
      const result = await assessed()
      return {
        engines: {
          lanczos3: { available: true, model: null, scale: null, matchesUpscaylLite: false, reason: null },
          'realesrgan-lite': result.capability,
        },
      }
    },
  }
}

/** Shrinks the AI input only when a native 4× image would pass the temporary size cap. */
export function planAiInputSize(
  width: number,
  height: number,
  scale: number,
  maxEdge: number,
  maxPixels: number,
): { width: number; height: number; reduced: boolean } {
  const grownEdge = Math.max(width, height) * scale
  const grownPixels = width * height * scale * scale
  const factor = Math.max(1, grownEdge / maxEdge, Math.sqrt(grownPixels / maxPixels))
  if (factor <= 1) return { width, height, reduced: false }
  let nextW = Math.max(2, Math.floor(width / factor))
  let nextH = Math.max(2, Math.floor(height / factor))
  while (
    (nextW * scale > maxEdge || nextH * scale > maxEdge || nextW * nextH * scale * scale > maxPixels) &&
    (nextW > 2 || nextH > 2)
  ) {
    if (nextW >= nextH && nextW > 2) nextW -= 1
    else if (nextH > 2) nextH -= 1
    else break
  }
  return { width: nextW, height: nextH, reduced: nextW !== width || nextH !== height }
}

async function runnableConfig(env: AppEnv, platform?: NodeJS.Platform): Promise<{ ok: true; config: RealesrganConfig } | { ok: false; reason: string }> {
  const read = readRealesrgan(env, platform)
  if (!read.ok) return { ok: false, reason: read.reason }
  return resolveRealesrganFiles(read.config)
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new UpscaleError('AI upscaling was cancelled.')
}

function failureMessage(stderr: string): string {
  if (/vulkan|vk[A-Z]/i.test(stderr)) return 'AI upscaling could not use a Vulkan graphics device.'
  if (/find model|load model|param file|unknown model/i.test(stderr)) return 'The AI model files could not be loaded.'
  return 'AI upscaling failed.'
}

function logAiFailure(stderr: string): void {
  const text = stderr.replace(/[A-Za-z]:\\[^\s'"]+/g, '[path]').replace(/\/(?:[\w.-]+\/)+[\w.-]+/g, '[path]').slice(0, 400)
  if (text.trim()) console.error(`[image-upscaler] AI upscaling failed. ${text}`)
}
