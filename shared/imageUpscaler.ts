/** Image Upscaler contract shared by the editor and the renderer. */

export const IMAGE_UPSCALER_ENGINE_ID = 'lanczos3' as const
export const UPSCALE_ENGINES = ['lanczos3', 'realesrgan-lite'] as const
export type UpscaleEngineId = (typeof UPSCALE_ENGINES)[number]

export const RESOLUTION_PRESETS = [
  { id: 'original', label: 'Original Dimensions', tag: 'orig', width: null, height: null },
  { id: 'upscaled', label: 'Upscaled Dimensions', tag: 'up', width: null, height: null },
  { id: 'fhd', label: 'Full HD', tag: 'FHD', width: 1920, height: 1080 },
  { id: 'qhd', label: '2K / QHD', tag: 'QHD', width: 2560, height: 1440 },
  { id: 'uhd4k', label: '4K UHD', tag: '4K', width: 3840, height: 2160 },
  { id: 'uhd8k', label: '8K UHD', tag: '8K', width: 7680, height: 4320 },
  { id: 'custom', label: 'Custom', tag: 'custom', width: null, height: null },
] as const

export type ResolutionPresetId = (typeof RESOLUTION_PRESETS)[number]['id']
export type ResizeMode = 'cover' | 'contain' | 'fill'
export type CropPosition = 'center' | 'top' | 'bottom' | 'left' | 'right'
export type PaddingChoice = 'black' | 'white' | 'custom' | 'transparent'
export type OutputFormat = 'png' | 'jpeg' | 'webp'
export type SharpenPreset = 'none' | 'subtle' | 'moderate'
export type ScaleFactor = 'auto' | 1 | 2 | 3 | 4
export type UpscaleStageStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'reused'
export type ExportStageStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
export type UpscaleItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type UpscaleJobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface UpscaleLimits {
  maxFileBytes: number
  maxBatch: number
  maxInputEdge: number
  maxInputPixels: number
  maxOutputEdge: number
  maxOutputPixels: number
  minEdge: number
  concurrency: number
  jobTtlMs: number
  minFreeBytes: number
  previewMaxEdge: number
  maxIntermediateEdge: number
  maxIntermediatePixels: number
}

/** Defaults sized for a shared Node process that also runs FFmpeg. */
export const DEFAULT_UPSCALE_LIMITS: UpscaleLimits = {
  maxFileBytes: 40 * 1024 * 1024,
  maxBatch: 8,
  maxInputEdge: 8192,
  maxInputPixels: 7680 * 4320,
  maxOutputEdge: 7680,
  maxOutputPixels: 7680 * 4320,
  minEdge: 2,
  concurrency: 1,
  jobTtlMs: 2 * 60 * 60 * 1000,
  minFreeBytes: 512 * 1024 * 1024,
  previewMaxEdge: 1440,
  maxIntermediateEdge: 8192,
  maxIntermediatePixels: 8192 * 8192,
}

export interface UpscaleOptions {
  /** Lanczos3 unless the client explicitly selects AI Lite. */
  engine: UpscaleEngineId
  preset: ResolutionPresetId
  width: number
  height: number
  mode: ResizeMode
  cropPosition: CropPosition
  padding: PaddingChoice
  paddingColor: string
  format: OutputFormat
  quality: number
  sharpen: SharpenPreset
  /**
   * Standard mode skips the Lanczos resize when the image is already the target size.
   * AI Lite still runs the model in that case, then fits the result to the exact size.
   */
  preserveWhenMatched: boolean
  /** Uniform upscale factor before export. `auto` picks a scale from the export target. */
  scaleFactor: ScaleFactor
}

export interface UpscaleStageResult {
  width: number
  height: number
  effectiveScale: number
  aiRan: boolean
  skippedUpscale: boolean
  note?: string | null
}

export interface UpscaleResult {
  width: number
  height: number
  format: OutputFormat
  bytes: number
  skippedResize: boolean
  /** Set when an engine had to qualify the result. Lanczos3 leaves this empty. */
  note?: string | null
}

export interface UpscaleProcessContext {
  signal?: AbortSignal
}

/** One image transformation. Lanczos3 is the default. AI Lite is optional. */
export interface ImageUpscaleEngine {
  readonly id: string
  runUpscaleStage(
    inputPath: string,
    intermediatePath: string,
    options: UpscaleOptions,
    effectiveScale: number,
    limits: UpscaleLimits,
    context?: UpscaleProcessContext,
  ): Promise<UpscaleStageResult>
  /** Combined upscale + export for tests and legacy callers. */
  process(
    inputPath: string,
    outputPath: string,
    options: UpscaleOptions,
    limits: UpscaleLimits,
    context?: UpscaleProcessContext,
  ): Promise<UpscaleResult>
}

export interface EngineCapability {
  available: boolean
  model: string | null
  scale: number | null
  /** True only when the configured model id is the Upscayl Lite model. */
  matchesUpscaylLite: boolean
  reason: string | null
}

export interface UpscalerCapabilities {
  engines: {
    lanczos3: EngineCapability
    'realesrgan-lite': EngineCapability
  }
}

export interface SharpenParams {
  sigma: number
  m1: number
  m2: number
}

/** Mild unsharp values. Sharpening is separate from Lanczos resampling. */
export const SHARPEN_PRESETS: Record<Exclude<SharpenPreset, 'none'>, SharpenParams> = {
  subtle: { sigma: 0.55, m1: 0.25, m2: 0.55 },
  moderate: { sigma: 0.85, m1: 0.4, m2: 1 },
}

export interface PublicUpscaleItem {
  id: string
  name: string
  status: UpscaleItemStatus
  error: string | null
  warning: string | null
  outputName: string | null
  outputBytes: number | null
  /** Increments on every successful export so preview URLs change even when byte size is unchanged. */
  outputRevision: number | null
  inputWidth: number | null
  inputHeight: number | null
  width: number | null
  height: number | null
  format: OutputFormat | null
  skippedResize: boolean
  intermediateWidth: number | null
  intermediateHeight: number | null
  effectiveScale: number | null
  upscaleStage: UpscaleStageStatus
  exportStage: ExportStageStatus
  intermediateReused: boolean
  aiRan: boolean
}

export interface PublicUpscaleJob {
  id: string
  status: UpscaleJobStatus
  engine: UpscaleEngineId
  /** Options used for the last queued run (upscale + export or re-export only). */
  options: UpscaleOptions
  items: PublicUpscaleItem[]
  createdAt: number
}

export interface ResizeSummary {
  sourceWidth: number
  sourceHeight: number
  targetWidth: number
  targetHeight: number
  sourceAspect: string
  targetAspect: string
  scaleX: number
  scaleY: number
  scaleLabel: string
  warning: string | null
  matchesTarget: boolean
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function defaultUpscaleOptions(): UpscaleOptions {
  return {
    engine: 'lanczos3',
    preset: 'uhd4k',
    width: 3840,
    height: 2160,
    mode: 'contain',
    cropPosition: 'center',
    padding: 'black',
    paddingColor: '#000000',
    format: 'png',
    quality: 90,
    sharpen: 'none',
    preserveWhenMatched: true,
    scaleFactor: 'auto',
  }
}

export function resolveExportDimensions(
  sourceWidth: number,
  sourceHeight: number,
  intermediateWidth: number,
  intermediateHeight: number,
  options: UpscaleOptions,
): { width: number; height: number } {
  if (options.preset === 'original') {
    return { width: sourceWidth, height: sourceHeight }
  }
  if (options.preset === 'upscaled') {
    if (intermediateWidth > 0 && intermediateHeight > 0) {
      return { width: intermediateWidth, height: intermediateHeight }
    }
    return { width: sourceWidth, height: sourceHeight }
  }
  return { width: options.width, height: options.height }
}

/** Scale-to-cover then crop offsets for export-stage Cover mode (object-fit: cover). */
export function coverCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  cropPosition: CropPosition,
): { scaledWidth: number; scaledHeight: number; left: number; top: number } {
  if (sourceWidth < 1 || sourceHeight < 1) {
    return { scaledWidth: targetWidth, scaledHeight: targetHeight, left: 0, top: 0 }
  }
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const scaledWidth = Math.max(targetWidth, Math.round(sourceWidth * scale))
  const scaledHeight = Math.max(targetHeight, Math.round(sourceHeight * scale))
  const excessW = scaledWidth - targetWidth
  const excessH = scaledHeight - targetHeight
  let left = 0
  let top = 0
  if (excessW > 0) {
    if (cropPosition === 'left') left = 0
    else if (cropPosition === 'right') left = excessW
    else left = Math.round(excessW / 2)
  }
  if (excessH > 0) {
    if (cropPosition === 'top') top = 0
    else if (cropPosition === 'bottom') top = excessH
    else top = Math.round(excessH / 2)
  }
  return { scaledWidth, scaledHeight, left, top }
}

export function resolveIntermediateDimensions(
  sourceWidth: number,
  sourceHeight: number,
  effectiveScale: number,
): { width: number; height: number } {
  const scale = Math.min(4, Math.max(1, effectiveScale))
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

/**
 * Picks a uniform upscale factor before export.
 * Cover-style `neededScale` drives the target; Standard skips upscaling when export fits in the source.
 * AI Lite may step down when the intermediate would exceed server limits.
 */
export function selectAutoEffectiveScale(input: {
  sourceWidth: number
  sourceHeight: number
  exportWidth: number
  exportHeight: number
  engine: UpscaleEngineId
  limits: Pick<UpscaleLimits, 'maxIntermediateEdge' | 'maxIntermediatePixels'>
}): { effectiveScale: number; reason: string } {
  const { sourceWidth, sourceHeight, exportWidth, exportHeight, engine, limits } = input
  if (sourceWidth < 1 || sourceHeight < 1) {
    return { effectiveScale: 1, reason: 'Source dimensions are missing; keeping native resolution.' }
  }
  if (engine === 'lanczos3' && exportWidth <= sourceWidth && exportHeight <= sourceHeight) {
    return {
      effectiveScale: 1,
      reason: 'Export fits inside the source; Standard keeps native resolution.',
    }
  }
  const needed = Math.max(exportWidth / sourceWidth, exportHeight / sourceHeight)
  let effective = Math.min(4, Math.max(1, Math.ceil(needed)))
  while (effective > 1) {
    const { width, height } = resolveIntermediateDimensions(sourceWidth, sourceHeight, effective)
    const edge = Math.max(width, height)
    const pixels = width * height
    if (edge <= limits.maxIntermediateEdge && pixels <= limits.maxIntermediatePixels) break
    effective -= 1
  }
  if (effective < Math.ceil(needed)) {
    return {
      effectiveScale: effective,
      reason: `Auto scale reduced to ${effective}× so the intermediate stays within the server limit (${limits.maxIntermediateEdge}px edge).`,
    }
  }
  if (effective === 1 && needed < 1) {
    return { effectiveScale: 1, reason: 'Export is smaller than the source; no enlargement is needed.' }
  }
  return {
    effectiveScale: effective,
    reason: `Auto chose ${effective}× to cover the ${exportWidth}×${exportHeight} export box.`,
  }
}

export function resolveEffectiveScale(
  options: UpscaleOptions,
  sourceWidth: number,
  sourceHeight: number,
  limits: UpscaleLimits,
): { effectiveScale: number; autoReason: string | null } {
  const exportDims = resolveExportDimensions(sourceWidth, sourceHeight, 0, 0, options)
  if (options.scaleFactor !== 'auto') {
    return { effectiveScale: options.scaleFactor, autoReason: null }
  }
  const auto = selectAutoEffectiveScale({
    sourceWidth,
    sourceHeight,
    exportWidth: exportDims.width,
    exportHeight: exportDims.height,
    engine: options.engine,
    limits,
  })
  return { effectiveScale: auto.effectiveScale, autoReason: auto.reason }
}

export function serializeUpscaleParamsForHash(
  engine: UpscaleEngineId,
  scaleFactor: ScaleFactor,
  effectiveScale: number,
): string {
  return JSON.stringify({ engine, scaleFactor, effectiveScale })
}

export function serializeExportParamsForHash(options: UpscaleOptions, exportWidth: number, exportHeight: number): string {
  return JSON.stringify({
    preset: options.preset,
    width: exportWidth,
    height: exportHeight,
    mode: options.mode,
    cropPosition: options.cropPosition,
    padding: options.padding,
    paddingColor: options.paddingColor,
    format: options.format,
    quality: options.quality,
    sharpen: options.sharpen,
    preserveWhenMatched: options.preserveWhenMatched,
  })
}

export function presetById(id: string): (typeof RESOLUTION_PRESETS)[number] | null {
  return RESOLUTION_PRESETS.find((preset) => preset.id === id) ?? null
}

export function outputExtension(format: OutputFormat): 'png' | 'jpg' | 'webp' {
  if (format === 'jpeg') return 'jpg'
  return format
}

/** Maps a sniffed image MIME type to the upscaler output format enum. */
export function outputFormatFromMime(mime: string): OutputFormat | null {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpeg'
  if (mime === 'image/webp') return 'webp'
  return null
}

export function contentTypeForFormat(format: OutputFormat): string {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  return 'image/png'
}

export function sharpenParams(preset: SharpenPreset): SharpenParams | null {
  if (preset === 'none') return null
  return SHARPEN_PRESETS[preset]
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function aspectLabel(width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return '—'
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

export function resizeSummary(
  sourceWidth: number,
  sourceHeight: number,
  options: UpscaleOptions,
  intermediateWidth = 0,
  intermediateHeight = 0,
): ResizeSummary {
  const exportDims = resolveExportDimensions(sourceWidth, sourceHeight, intermediateWidth, intermediateHeight, options)
  const scaleX = sourceWidth > 0 ? exportDims.width / sourceWidth : 0
  const scaleY = sourceHeight > 0 ? exportDims.height / sourceHeight : 0
  const uniform = Math.abs(scaleX - scaleY) < 0.01
  const scaleLabel = uniform ? `${scaleX.toFixed(2)}×` : `${scaleX.toFixed(2)}× wide, ${scaleY.toFixed(2)}× tall`
  return {
    sourceWidth,
    sourceHeight,
    targetWidth: exportDims.width,
    targetHeight: exportDims.height,
    sourceAspect: aspectLabel(sourceWidth, sourceHeight),
    targetAspect: aspectLabel(options.width, options.height),
    scaleX,
    scaleY,
    scaleLabel,
    warning:
      options.engine === 'realesrgan-lite'
        ? aiScaleWarning(sourceWidth, sourceHeight, exportDims.width, exportDims.height)
        : enlargementWarning(sourceWidth, sourceHeight, exportDims.width, exportDims.height),
    matchesTarget: sourceWidth === exportDims.width && sourceHeight === exportDims.height,
  }
}

export function aiScaleWarning(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): string | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  if (scale < 1.25 && scale > 0.8) return null
  return 'AI Lite rebuilds edges and texture. It can invent detail or change fine artwork. It is not a lossless recovery of the original.'
}

export function enlargementWarning(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): string | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const small = Math.min(sourceWidth, sourceHeight) < 480 && scale >= 2.5
  if (scale >= 4 || small) {
    return `This enlarges a ${sourceWidth}×${sourceHeight} image by about ${scale.toFixed(1)}×. Lanczos3 only interpolates pixels that are already in the file. It cannot recover detail that was never captured.`
  }
  return null
}

export function sanitizeStem(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? 'image'
  const stem = base.replace(/\.[^.]+$/, '')
  const cleaned = stem
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 60)
  return cleaned || 'image'
}

export function uniqueOutputName(
  originalName: string,
  options: UpscaleOptions,
  used: Set<string>,
  exportWidth: number = options.width,
  exportHeight: number = options.height,
): string {
  const preset = presetById(options.preset)
  const tag = preset?.tag ?? 'custom'
  const stem = sanitizeStem(originalName)
  const ext = outputExtension(options.format)
  const suffix = `_${tag}_${exportWidth}x${exportHeight}`
  let name = `${stem}${suffix}.${ext}`
  let n = 2
  while (used.has(name.toLowerCase())) {
    name = `${stem}${suffix}_${n}.${ext}`
    n += 1
  }
  used.add(name.toLowerCase())
  return name
}

export function normalizeOptions(
  raw: unknown,
  limits: UpscaleLimits = DEFAULT_UPSCALE_LIMITS,
): { options: UpscaleOptions; warnings: string[] } {
  if (!raw || typeof raw !== 'object') throw new Error('Upscale settings are missing.')
  const data = raw as Record<string, unknown>
  let engine: UpscaleEngineId = 'lanczos3'
  if (data.engine != null && data.engine !== '') {
    if (data.engine !== 'lanczos3' && data.engine !== 'realesrgan-lite') throw new Error('Choose an upscaling engine.')
    engine = data.engine
  }
  let presetId = typeof data.preset === 'string' ? data.preset : ''
  if (!presetId && data.exportPreset === 'original') presetId = 'upscaled'
  if (!presetId) presetId = 'uhd4k'
  const preset = presetById(presetId)
  if (!preset) throw new Error('Choose a resolution preset.')
  const dynamicPreset = preset.id === 'original' || preset.id === 'upscaled'
  let width = dynamicPreset ? positiveInt(data.width) ?? limits.minEdge : preset.width ?? positiveInt(data.width)
  let height = dynamicPreset ? positiveInt(data.height) ?? limits.minEdge : preset.height ?? positiveInt(data.height)
  if (preset.id === 'custom' && (!width || !height)) throw new Error('Enter a whole-number width and height.')
  if (!dynamicPreset && preset.id !== 'custom') {
    width = preset.width ?? width
    height = preset.height ?? height
  }
  if (!width || !height) throw new Error('Enter a whole-number width and height.')
  if (!dynamicPreset) {
    if (width < limits.minEdge || height < limits.minEdge) {
      throw new Error(`Width and height must be at least ${limits.minEdge} pixels.`)
    }
  }
  if (preset.id !== 'original' && preset.id !== 'upscaled') {
    if (width > limits.maxOutputEdge || height > limits.maxOutputEdge) {
      throw new Error(`Width and height cannot exceed ${limits.maxOutputEdge} pixels.`)
    }
    if (width * height > limits.maxOutputPixels) {
      throw new Error('That output size uses more pixels than this server allows.')
    }
  }
  const mode = data.mode
  if (mode !== 'cover' && mode !== 'contain' && mode !== 'fill') throw new Error('Choose contain, cover, or fill.')
  const cropPosition = data.cropPosition
  if (
    cropPosition !== 'center' &&
    cropPosition !== 'top' &&
    cropPosition !== 'bottom' &&
    cropPosition !== 'left' &&
    cropPosition !== 'right'
  ) {
    throw new Error('Choose a crop position.')
  }
  const padding = data.padding
  if (padding !== 'black' && padding !== 'white' && padding !== 'custom' && padding !== 'transparent') {
    throw new Error('Choose a padding color.')
  }
  const paddingColor = typeof data.paddingColor === 'string' && HEX.test(data.paddingColor) ? data.paddingColor : '#000000'
  const format = data.format
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') throw new Error('Choose PNG, JPEG, or WebP.')
  const sharpen = data.sharpen
  if (sharpen !== 'none' && sharpen !== 'subtle' && sharpen !== 'moderate') throw new Error('Choose a sharpen preset.')
  let quality = Math.round(Number(data.quality))
  if (!Number.isFinite(quality)) quality = 90
  quality = Math.min(100, Math.max(60, quality))
  let scaleFactor: ScaleFactor = 'auto'
  if (data.scaleFactor != null && data.scaleFactor !== '') {
    const rawScale = data.scaleFactor === 'auto' ? 'auto' : Number(data.scaleFactor)
    if (rawScale === 'auto') scaleFactor = 'auto'
    else if (rawScale === 1 || rawScale === 2 || rawScale === 3 || rawScale === 4) scaleFactor = rawScale
    else throw new Error('Choose an upscale factor of auto, 1×, 2×, 3×, or 4×.')
  }
  const warnings: string[] = []
  let resolvedPadding: PaddingChoice = padding
  if (format === 'jpeg' && padding === 'transparent') {
    resolvedPadding = 'black'
    warnings.push('JPEG cannot store transparency. Transparent padding was changed to black.')
  }
  return {
    options: {
      engine,
      preset: preset.id,
      width,
      height,
      mode,
      cropPosition,
      padding: resolvedPadding,
      paddingColor,
      format,
      quality,
      sharpen,
      preserveWhenMatched: data.preserveWhenMatched !== false,
      scaleFactor,
    },
    warnings,
  }
}

export function limitsFromEnv(env: Record<string, string | undefined> = readProcessEnv()): UpscaleLimits {
  const fileMb = clampInt(env.RIBO_UPSCALER_MAX_FILE_MB, 1, 80, DEFAULT_UPSCALE_LIMITS.maxFileBytes / (1024 * 1024))
  const batch = clampInt(env.RIBO_UPSCALER_MAX_BATCH, 1, 12, DEFAULT_UPSCALE_LIMITS.maxBatch)
  const inputEdge = clampInt(env.RIBO_UPSCALER_MAX_INPUT_EDGE, 256, 8192, DEFAULT_UPSCALE_LIMITS.maxInputEdge)
  const outputEdge = clampInt(env.RIBO_UPSCALER_MAX_OUTPUT_EDGE, 256, 7680, DEFAULT_UPSCALE_LIMITS.maxOutputEdge)
  const inputPixels = clampInt(env.RIBO_UPSCALER_MAX_INPUT_PIXELS, 256 * 256, DEFAULT_UPSCALE_LIMITS.maxInputPixels, DEFAULT_UPSCALE_LIMITS.maxInputPixels)
  const outputPixels = clampInt(
    env.RIBO_UPSCALER_MAX_OUTPUT_PIXELS,
    256 * 256,
    DEFAULT_UPSCALE_LIMITS.maxOutputPixels,
    DEFAULT_UPSCALE_LIMITS.maxOutputPixels,
  )
  const concurrency = clampInt(env.RIBO_UPSCALER_CONCURRENCY, 1, 2, DEFAULT_UPSCALE_LIMITS.concurrency)
  const ttlMin = clampInt(env.RIBO_UPSCALER_JOB_TTL_MIN, 5, 24 * 60, DEFAULT_UPSCALE_LIMITS.jobTtlMs / 60000)
  const freeMb = clampInt(env.RIBO_UPSCALER_MIN_FREE_MB, 64, 8192, DEFAULT_UPSCALE_LIMITS.minFreeBytes / (1024 * 1024))
  const preview = clampInt(env.RIBO_UPSCALER_PREVIEW_EDGE, 320, 1920, DEFAULT_UPSCALE_LIMITS.previewMaxEdge)
  const midEdge = clampInt(env.RIBO_REALESRGAN_MAX_INTERMEDIATE_EDGE, 1024, 16384, DEFAULT_UPSCALE_LIMITS.maxIntermediateEdge)
  return {
    maxFileBytes: fileMb * 1024 * 1024,
    maxBatch: batch,
    maxInputEdge: inputEdge,
    maxInputPixels: inputPixels,
    maxOutputEdge: outputEdge,
    maxOutputPixels: outputPixels,
    minEdge: DEFAULT_UPSCALE_LIMITS.minEdge,
    concurrency,
    jobTtlMs: ttlMin * 60 * 1000,
    minFreeBytes: freeMb * 1024 * 1024,
    previewMaxEdge: preview,
    maxIntermediateEdge: midEdge,
    maxIntermediatePixels: midEdge * midEdge,
  }
}

/** Ask before replacing a Screensaver source. Cancel leaves the Screensaver project untouched. */
export function screensaverTransferAction(hasExistingSource: boolean, choice: 'replace' | 'cancel' | null): 'ask' | 'send' | 'abort' {
  if (!hasExistingSource) return 'send'
  if (choice === 'replace') return 'send'
  if (choice === 'cancel') return 'abort'
  return 'ask'
}

export function resizeModeLabel(mode: ResizeMode): string {
  if (mode === 'cover') return 'Cover — fill and crop'
  if (mode === 'fill') return 'Fill — stretch'
  return 'Contain — preserve complete image'
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const color = HEX.test(hex) ? hex : '#000000'
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  }
}

export function paddingRgba(options: UpscaleOptions): { r: number; g: number; b: number; alpha: number } {
  if (options.padding === 'transparent' && options.format !== 'jpeg') return { r: 0, g: 0, b: 0, alpha: 0 }
  if (options.padding === 'white') return { r: 255, g: 255, b: 255, alpha: 1 }
  if (options.padding === 'custom') {
    const rgb = hexToRgb(options.paddingColor)
    return { ...rgb, alpha: 1 }
  }
  return { r: 0, g: 0, b: 0, alpha: 1 }
}

function readProcessEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return proc?.env ?? {}
}

function positiveInt(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number) || number <= 0) return null
  return number
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  if (value == null || value.trim() === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}
