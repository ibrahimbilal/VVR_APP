import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { EngineCapability, ImageUpscaleEngine, UpscalerCapabilities } from '../../shared/imageUpscaler'
import { createLanczosEngine, inspectImage, UpscaleError, writeFittedImage } from './imageUpscaler'
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
 * Real-ESRGAN NCNN Vulkan at the model's native scale, then one Lanczos3 fit to the
 * exact requested pixels. The model name comes from configuration, not from the browser.
 */
export function createRealesrganEngine(deps: RealesrganEngineDeps = {}): ImageUpscaleEngine {
  const env = deps.env ?? (() => process.env)
  const run = deps.run ?? runNativeProcess
  return {
    id: 'realesrgan-lite',
    async process(inputPath, outputPath, options, limits, context) {
      throwIfCancelled(context?.signal)
      const ready = await runnableConfig(env(), deps.platform)
      if (!ready.ok) throw new UpscaleError(ready.reason)
      const config = ready.config
      const info = await inspectImage(inputPath, limits)
      const file = await stat(inputPath)
      if (file.size > limits.maxFileBytes) {
        throw new UpscaleError(`Images must be ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB or smaller.`)
      }
      const planned = planAiInputSize(info.width, info.height, config.scale, config.maxIntermediateEdge, config.maxIntermediateEdge * config.maxIntermediateEdge)
      const work = `${outputPath}.aiwork`
      await mkdir(work, { recursive: true })
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
        const notes: string[] = []
        if (planned.reduced) {
          notes.push('The image was reduced before AI upscaling so the temporary image stays within the memory limit, then fitted to the requested size.')
        }
        if (info.hasAlpha && !aiHasAlpha) {
          notes.push('The AI model did not keep transparency. Transparent areas were flattened before the final save.')
        }
        throwIfCancelled(context?.signal)
        const fitted = await writeFittedImage(aiOutput, outputPath, options, limits, {
          skipResize: aiWidth === options.width && aiHeight === options.height,
          maxEdge: Math.max(limits.maxOutputEdge, config.maxIntermediateEdge),
          maxPixels: config.maxIntermediateEdge * config.maxIntermediateEdge,
        })
        return {
          ...fitted,
          skippedResize: false,
          note: notes.join(' ') || null,
        }
      } finally {
        await rm(work, { recursive: true, force: true }).catch(() => undefined)
      }
    },
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
