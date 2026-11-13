import { stat } from 'node:fs/promises'
import os from 'node:os'
import sharp from 'sharp'
import {
  contentTypeForFormat,
  paddingRgba,
  coverCropRect,
  resolveEffectiveScale,
  resolveExportDimensions,
  resolveIntermediateDimensions,
  sharpenParams,
  type ImageUpscaleEngine,
  type OutputFormat,
  type UpscaleLimits,
  type UpscaleOptions,
  type UpscaleResult,
  type UpscaleStageResult,
} from '../../shared/imageUpscaler'

export class UpscaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpscaleError'
  }
}

export interface InspectedImage {
  width: number
  height: number
  format: OutputFormat
  hasAlpha: boolean
  orientation: number
  pages: number
}

const OUTPUT_FORMAT: Record<OutputFormat, string> = {
  png: 'png',
  jpeg: 'jpeg',
  webp: 'webp',
}

let configured = false

export function configureSharp(): void {
  if (configured) return
  configured = true
  const requested = Number(process.env.RIBO_UPSCALER_VIPS_CONCURRENCY)
  const threads = Number.isFinite(requested) && requested > 0 ? Math.min(4, Math.round(requested)) : Math.min(2, Math.max(1, os.cpus().length))
  sharp.concurrency(threads)
  sharp.cache(false)
}

export function createLanczosEngine(): ImageUpscaleEngine {
  configureSharp()
  return {
    id: 'lanczos3',
    runUpscaleStage: runUpscaleStageStandard,
    process: processLanczos,
  }
}

export async function inspectImage(
  filePath: string,
  limits: UpscaleLimits,
  bounds?: { maxEdge: number; maxPixels: number },
): Promise<InspectedImage> {
  configureSharp()
  const maxEdge = bounds?.maxEdge ?? limits.maxInputEdge
  const maxPixels = bounds?.maxPixels ?? limits.maxInputPixels
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    meta = await sharp(filePath, { ...sharpOptions(limits), limitInputPixels: maxPixels }).metadata()
  } catch (error) {
    throw new UpscaleError(publicError(error, 'This file is not a valid PNG, JPEG, or WebP image.'))
  }
  const format = normalizeFormat(meta.format)
  if (!format) throw new UpscaleError('Use a PNG, JPEG, or WebP image. Other formats are not accepted.')
  const pages = meta.pages ?? 1
  if (pages > 1) throw new UpscaleError('Animated images are not supported. Export a single frame first.')
  const storedWidth = meta.width ?? 0
  const storedHeight = meta.height ?? 0
  if (storedWidth < 1 || storedHeight < 1) throw new UpscaleError('This image has no readable dimensions.')
  const orientation = meta.orientation ?? 1
  const swaps = orientation >= 5 && orientation <= 8
  const width = swaps ? storedHeight : storedWidth
  const height = swaps ? storedWidth : storedHeight
  if (width > maxEdge || height > maxEdge || width * height > maxPixels) {
    throw new UpscaleError(
      `This image is too large to process safely (limit ${maxEdge}px per edge and ${maxPixels.toLocaleString('en-US')} pixels).`,
    )
  }
  return {
    width,
    height,
    format,
    hasAlpha: Boolean(meta.hasAlpha),
    orientation,
    pages,
  }
}

export async function runUpscaleStageStandard(
  inputPath: string,
  intermediatePath: string,
  options: UpscaleOptions,
  effectiveScale: number,
  limits: UpscaleLimits,
): Promise<UpscaleStageResult> {
  configureSharp()
  const info = await inspectImage(inputPath, limits)
  const file = await stat(inputPath)
  if (file.size > limits.maxFileBytes) {
    throw new UpscaleError(`Images must be ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB or smaller.`)
  }
  const { width, height } = resolveIntermediateDimensions(info.width, info.height, effectiveScale)
  const already = info.width === width && info.height === height
  if (already) {
    const { copyFile } = await import('node:fs/promises')
    const canCopy = info.format === 'png' && info.orientation === 1
    if (canCopy) await copyFile(inputPath, intermediatePath)
    else {
      await sharp(inputPath, { ...sharpOptions(limits), limitInputPixels: limits.maxInputPixels })
        .rotate()
        .png({ compressionLevel: 1 })
        .toFile(intermediatePath)
    }
    return { width, height, effectiveScale, aiRan: false, skippedUpscale: true }
  }
  await sharp(inputPath, { ...sharpOptions(limits), limitInputPixels: limits.maxInputPixels })
    .rotate()
    .resize(width, height, { kernel: sharp.kernel.lanczos3, fit: 'fill', withoutEnlargement: false })
    .png({ compressionLevel: 1 })
    .toFile(intermediatePath)
  const written = await sharp(intermediatePath).metadata()
  return {
    width: written.width ?? width,
    height: written.height ?? height,
    effectiveScale,
    aiRan: false,
    skippedUpscale: false,
  }
}

export async function runExportStage(
  intermediatePath: string,
  outputPath: string,
  options: UpscaleOptions,
  sourceWidth: number,
  sourceHeight: number,
  intermediateWidth: number,
  intermediateHeight: number,
  limits: UpscaleLimits,
): Promise<UpscaleResult> {
  configureSharp()
  const exportDims = resolveExportDimensions(sourceWidth, sourceHeight, intermediateWidth, intermediateHeight, options)
  const exportOptions: UpscaleOptions = { ...options, width: exportDims.width, height: exportDims.height }
  const sameSize = intermediateWidth === exportDims.width && intermediateHeight === exportDims.height
  const skippedResize = sameSize && options.preserveWhenMatched && options.mode === 'fill'
  const info = await inspectImage(intermediatePath, limits, {
    maxEdge: Math.max(limits.maxOutputEdge, limits.maxIntermediateEdge),
    maxPixels: Math.max(limits.maxOutputPixels, limits.maxIntermediatePixels),
  })
  const canCopy =
    skippedResize &&
    options.sharpen === 'none' &&
    info.orientation === 1 &&
    info.format === options.format &&
    !(options.format === 'jpeg' && info.hasAlpha)
  if (canCopy) {
    const { copyFile } = await import('node:fs/promises')
    await copyFile(intermediatePath, outputPath)
    const verified = await verifyOutputFile(outputPath, exportOptions)
    const outputStat = await stat(outputPath)
    return {
      width: verified.width,
      height: verified.height,
      format: options.format,
      bytes: outputStat.size,
      skippedResize: true,
    }
  }
  const fitted = await writeFittedImage(intermediatePath, outputPath, exportOptions, limits, {
    skipResize: skippedResize,
    maxEdge: Math.max(limits.maxOutputEdge, limits.maxIntermediateEdge),
    maxPixels: Math.max(limits.maxOutputPixels, limits.maxIntermediatePixels),
  })
  return { ...fitted, skippedResize }
}

export async function processLanczos(
  inputPath: string,
  outputPath: string,
  options: UpscaleOptions,
  limits: UpscaleLimits,
): Promise<UpscaleResult> {
  configureSharp()
  const info = await inspectImage(inputPath, limits)
  const { effectiveScale } = resolveEffectiveScale(options, info.width, info.height, limits)
  const work = `${outputPath}.stage.png`
  const stage = await runUpscaleStageStandard(inputPath, work, options, effectiveScale, limits)
  try {
    return await runExportStage(work, outputPath, options, info.width, info.height, stage.width, stage.height, limits)
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(work, { force: true }).catch(() => undefined)
  }
}

export async function writeFittedImage(
  inputPath: string,
  outputPath: string,
  options: UpscaleOptions,
  limits: UpscaleLimits,
  fit?: { skipResize?: boolean; maxEdge?: number; maxPixels?: number },
): Promise<UpscaleResult> {
  configureSharp()
  const maxEdge = fit?.maxEdge ?? limits.maxInputEdge
  const maxPixels = fit?.maxPixels ?? limits.maxInputPixels
  await inspectImage(inputPath, limits, { maxEdge, maxPixels })
  let skipResize = fit?.skipResize === true
  if (options.mode === 'cover' || options.mode === 'contain') skipResize = false
  const base = sharp(inputPath, { ...sharpOptions(limits), limitInputPixels: maxPixels }).rotate()
  let pipeline = base
  if (!skipResize) {
    if (options.mode === 'cover') {
      const meta = await base.clone().metadata()
      const srcW = meta.width ?? 1
      const srcH = meta.height ?? 1
      const crop = coverCropRect(srcW, srcH, options.width, options.height, options.cropPosition)
      pipeline = base
        .resize(crop.scaledWidth, crop.scaledHeight, { kernel: sharp.kernel.lanczos3, fit: 'fill', withoutEnlargement: false })
        .extract({ left: crop.left, top: crop.top, width: options.width, height: options.height })
    } else {
      pipeline = base.resize(options.width, options.height, {
        kernel: sharp.kernel.lanczos3,
        fit: options.mode === 'contain' ? 'contain' : 'fill',
        background: paddingRgba(options),
        withoutEnlargement: false,
      })
    }
  }
  const sharpen = sharpenParams(options.sharpen)
  if (sharpen) pipeline = pipeline.sharpen(sharpen)
  if (options.format === 'jpeg') pipeline = pipeline.flatten({ background: paddingRgba(options) })
  pipeline = encode(pipeline, options)
  try {
    await pipeline.toFile(outputPath)
  } catch (error) {
    throw new UpscaleError(publicError(error, 'The image could not be resized.'))
  }
  const verified = await verifyOutputFile(outputPath, options)
  const outputStat = await stat(outputPath)
  return {
    width: verified.width,
    height: verified.height,
    format: options.format,
    bytes: outputStat.size,
    skippedResize: skipResize,
  }
}

export async function verifyOutputFile(
  filePath: string,
  options: UpscaleOptions,
): Promise<{ width: number; height: number; format: OutputFormat }> {
  configureSharp()
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    meta = await sharp(filePath, { failOn: 'error', animated: false }).metadata()
    await sharp(filePath, { failOn: 'error', animated: false }).resize(1, 1).raw().toBuffer()
  } catch (error) {
    throw new UpscaleError(publicError(error, 'The processed file could not be decoded.'))
  }
  const format = normalizeFormat(meta.format)
  if (format !== options.format) {
    throw new UpscaleError(`Output format is ${meta.format ?? 'unknown'}, not ${options.format}.`)
  }
  if (meta.width !== options.width || meta.height !== options.height) {
    throw new UpscaleError(
      `Output is ${meta.width ?? 0}×${meta.height ?? 0}, not the requested ${options.width}×${options.height}.`,
    )
  }
  return { width: meta.width, height: meta.height, format }
}

export async function writeComparisonPreview(
  sourcePath: string,
  previewPath: string,
  maxEdge: number,
): Promise<{ width: number; height: number }> {
  configureSharp()
  const meta = await sharp(sourcePath, { failOn: 'error', animated: false }).metadata()
  const sourceWidth = meta.width ?? 1
  const sourceHeight = meta.height ?? 1
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  await sharp(sourcePath, { failOn: 'error', animated: false })
    .resize(width, height, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .webp({ quality: 80, effort: 4 })
    .toFile(previewPath)
  const written = await sharp(previewPath).metadata()
  return { width: written.width ?? width, height: written.height ?? height }
}

export function magicMatches(format: OutputFormat, bytes: Buffer): boolean {
  if (format === 'png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (format === 'jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

export function publicError(error: unknown, fallback: string): string {
  if (error instanceof UpscaleError) return error.message
  const text = error instanceof Error ? error.message : ''
  if (/pixel limit|exceeds pixel|Input image exceeds/i.test(text)) return 'This image is too large to process safely.'
  if (/unsupported image|corrupt|premature|Vips|invalid/i.test(text)) return fallback
  if (!text || /[/\\]/.test(text)) return fallback
  return text.slice(0, 240)
}

function sharpOptions(limits: UpscaleLimits) {
  return {
    failOn: 'error' as const,
    limitInputPixels: limits.maxInputPixels,
    sequentialRead: true,
    animated: false,
    unlimited: false,
  }
}

function encode(pipeline: ReturnType<typeof sharp>, options: UpscaleOptions): ReturnType<typeof sharp> {
  if (options.format === 'jpeg') {
    return pipeline.jpeg({ quality: options.quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
  }
  if (options.format === 'webp') {
    return pipeline.webp({ quality: options.quality, alphaQuality: 100, effort: 4 })
  }
  return pipeline.png({ compressionLevel: 6, effort: 7 })
}

function normalizeFormat(format: string | undefined): OutputFormat | null {
  if (format === 'jpg') return 'jpeg'
  if (format === 'png' || format === 'jpeg' || format === 'webp') return format
  return null
}

export function formatContentType(format: OutputFormat): string {
  return contentTypeForFormat(format)
}
