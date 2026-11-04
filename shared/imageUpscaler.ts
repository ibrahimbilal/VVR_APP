/** Image Upscaler contract shared by the editor and the renderer. */

export const IMAGE_UPSCALER_ENGINE_ID = 'lanczos3' as const
export const UPSCALE_ENGINES = ['lanczos3', 'realesrgan-lite'] as const
export type UpscaleEngineId = (typeof UPSCALE_ENGINES)[number]

export const RESOLUTION_PRESETS = [
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
}

/** Defaults sized for a shared Hostinger Node process that also runs FFmpeg. */
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
  inputWidth: number | null
  inputHeight: number | null
  width: number | null
  height: number | null
  format: OutputFormat | null
  skippedResize: boolean
}

export interface PublicUpscaleJob {
  id: string
  status: UpscaleJobStatus
  engine: UpscaleEngineId
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
  }
}

export function presetById(id: string): (typeof RESOLUTION_PRESETS)[number] | null {
  return RESOLUTION_PRESETS.find((preset) => preset.id === id) ?? null
}

export function outputExtension(format: OutputFormat): 'png' | 'jpg' | 'webp' {
  if (format === 'jpeg') return 'jpg'
  return format
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

export function resizeSummary(sourceWidth: number, sourceHeight: number, options: UpscaleOptions): ResizeSummary {
  const scaleX = sourceWidth > 0 ? options.width / sourceWidth : 0
  const scaleY = sourceHeight > 0 ? options.height / sourceHeight : 0
  const uniform = Math.abs(scaleX - scaleY) < 0.01
  const scaleLabel = uniform ? `${scaleX.toFixed(2)}×` : `${scaleX.toFixed(2)}× wide, ${scaleY.toFixed(2)}× tall`
  return {
    sourceWidth,
    sourceHeight,
    targetWidth: options.width,
    targetHeight: options.height,
    sourceAspect: aspectLabel(sourceWidth, sourceHeight),
    targetAspect: aspectLabel(options.width, options.height),
    scaleX,
    scaleY,
    scaleLabel,
    warning:
      options.engine === 'realesrgan-lite'
        ? aiScaleWarning(sourceWidth, sourceHeight, options.width, options.height)
        : enlargementWarning(sourceWidth, sourceHeight, options.width, options.height),
    matchesTarget: sourceWidth === options.width && sourceHeight === options.height,
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
): string {
  const preset = presetById(options.preset)
  const tag = preset?.tag ?? 'custom'
  const stem = sanitizeStem(originalName)
  const ext = outputExtension(options.format)
  const suffix = `_${tag}_${options.width}x${options.height}`
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
  const preset = presetById(typeof data.preset === 'string' ? data.preset : '')
  if (!preset) throw new Error('Choose a resolution preset.')
  let width = preset.width ?? positiveInt(data.width)
  let height = preset.height ?? positiveInt(data.height)
  if (!width || !height) throw new Error('Enter a whole-number width and height.')
  if (width < limits.minEdge || height < limits.minEdge) {
    throw new Error(`Width and height must be at least ${limits.minEdge} pixels.`)
  }
  if (width > limits.maxOutputEdge || height > limits.maxOutputEdge) {
    throw new Error(`Width and height cannot exceed ${limits.maxOutputEdge} pixels.`)
  }
  if (width * height > limits.maxOutputPixels) {
    throw new Error('That output size uses more pixels than this server allows.')
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
    },
    warnings,
  }
}

export function limitsFromEnv(env: Record<string, string | undefined> = readProcessEnv()): UpscaleLimits {
  const fileMb = clampInt(env.VVR_UPSCALER_MAX_FILE_MB, 1, 80, DEFAULT_UPSCALE_LIMITS.maxFileBytes / (1024 * 1024))
  const batch = clampInt(env.VVR_UPSCALER_MAX_BATCH, 1, 12, DEFAULT_UPSCALE_LIMITS.maxBatch)
  const inputEdge = clampInt(env.VVR_UPSCALER_MAX_INPUT_EDGE, 256, 8192, DEFAULT_UPSCALE_LIMITS.maxInputEdge)
  const outputEdge = clampInt(env.VVR_UPSCALER_MAX_OUTPUT_EDGE, 256, 7680, DEFAULT_UPSCALE_LIMITS.maxOutputEdge)
  const inputPixels = clampInt(env.VVR_UPSCALER_MAX_INPUT_PIXELS, 256 * 256, DEFAULT_UPSCALE_LIMITS.maxInputPixels, DEFAULT_UPSCALE_LIMITS.maxInputPixels)
  const outputPixels = clampInt(
    env.VVR_UPSCALER_MAX_OUTPUT_PIXELS,
    256 * 256,
    DEFAULT_UPSCALE_LIMITS.maxOutputPixels,
    DEFAULT_UPSCALE_LIMITS.maxOutputPixels,
  )
  const concurrency = clampInt(env.VVR_UPSCALER_CONCURRENCY, 1, 2, DEFAULT_UPSCALE_LIMITS.concurrency)
  const ttlMin = clampInt(env.VVR_UPSCALER_JOB_TTL_MIN, 5, 24 * 60, DEFAULT_UPSCALE_LIMITS.jobTtlMs / 60000)
  const freeMb = clampInt(env.VVR_UPSCALER_MIN_FREE_MB, 64, 8192, DEFAULT_UPSCALE_LIMITS.minFreeBytes / (1024 * 1024))
  const preview = clampInt(env.VVR_UPSCALER_PREVIEW_EDGE, 320, 1920, DEFAULT_UPSCALE_LIMITS.previewMaxEdge)
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
