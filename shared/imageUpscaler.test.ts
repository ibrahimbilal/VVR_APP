import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_UPSCALE_LIMITS,
  defaultUpscaleOptions,
  enlargementWarning,
  normalizeOptions,
  resolveEffectiveScale,
  resolveExportDimensions,
  coverCropRect,
  resolveIntermediateDimensions,
  resizeModeLabel,
  resizeSummary,
  sanitizeStem,
  screensaverTransferAction,
  selectAutoEffectiveScale,
  serializeExportParamsForHash,
  serializeUpscaleParamsForHash,
  sharpenParams,
  uniqueOutputName,
  outputFormatFromMime,
} from './imageUpscaler'

describe('image upscaler settings', () => {
  it('defaults to Lanczos3 and accepts an omitted engine', () => {
    const options = defaultUpscaleOptions()
    assert.equal(options.engine, 'lanczos3')
    const legacy = { ...options } as Record<string, unknown>
    delete legacy.engine
    assert.equal(normalizeOptions(legacy).options.engine, 'lanczos3')
    assert.equal(normalizeOptions({ ...options, engine: 'realesrgan-lite' }).options.engine, 'realesrgan-lite')
    assert.throws(() => normalizeOptions({ ...options, engine: 'cuda' }), /engine/i)
  })

  it('defaults to 4K UHD contain', () => {
    const options = defaultUpscaleOptions()
    assert.equal(options.preset, 'uhd4k')
    assert.equal(options.width, 3840)
    assert.equal(options.height, 2160)
    assert.equal(options.mode, 'contain')
    assert.equal(options.sharpen, 'none')
    assert.equal(options.format, 'png')
  })

  it('maps sniffed MIME types to export formats', () => {
    assert.equal(outputFormatFromMime('image/png'), 'png')
    assert.equal(outputFormatFromMime('image/jpeg'), 'jpeg')
    assert.equal(outputFormatFromMime('image/webp'), 'webp')
    assert.equal(outputFormatFromMime('image/gif'), null)
  })

  it('forces preset dimensions and rejects oversized custom output', () => {
    const preset = normalizeOptions({ ...defaultUpscaleOptions(), preset: 'uhd8k', width: 10, height: 10 })
    assert.equal(preset.options.width, 7680)
    assert.equal(preset.options.height, 4320)
    assert.throws(
      () => normalizeOptions({ ...defaultUpscaleOptions(), preset: 'custom', width: 8000, height: 8000 }),
      /cannot exceed|more pixels/,
    )
  })

  it('replaces transparent JPEG padding with black and a warning', () => {
    const result = normalizeOptions({ ...defaultUpscaleOptions(), preset: 'custom', width: 20, height: 20, format: 'jpeg', padding: 'transparent' })
    assert.equal(result.options.padding, 'black')
    assert.match(result.warnings[0] ?? '', /JPEG cannot store transparency/)
  })

  it('builds unique sanitized filenames', () => {
    const options = normalizeOptions({ ...defaultUpscaleOptions(), preset: 'uhd4k' }).options
    const used = new Set<string>()
    const first = uniqueOutputName('../landscape.png', options, used)
    const second = uniqueOutputName('landscape.png', options, used)
    assert.equal(first, 'landscape_4K_3840x2160.png')
    assert.equal(second, 'landscape_4K_3840x2160_2.png')
    const original = normalizeOptions({ ...defaultUpscaleOptions(), preset: 'original' }).options
    assert.equal(uniqueOutputName('photo.png', original, new Set(), 1972, 1109), 'photo_orig_1972x1109.png')
    assert.equal(sanitizeStem('..\\..\\mountains.jpg'), 'mountains')
    assert.doesNotMatch(first, /[/\\]/)
  })

  it('describes enlargement without claiming recovered detail', () => {
    const summary = resizeSummary(320, 180, normalizeOptions({ ...defaultUpscaleOptions(), preset: 'uhd4k' }).options)
    assert.equal(summary.targetWidth, 3840)
    assert.equal(summary.targetHeight, 2160)
    assert.match(summary.warning ?? '', /cannot recover detail/)
    const ai = resizeSummary(320, 180, normalizeOptions({ ...defaultUpscaleOptions(), engine: 'realesrgan-lite' }).options)
    assert.match(ai.warning ?? '', /not a lossless recovery/)
    assert.doesNotMatch(ai.warning ?? '', /Lanczos3 only/)
    assert.equal(enlargementWarning(3840, 2160, 3840, 2160), null)
    assert.match(resizeModeLabel('fill'), /stretch/)
  })

  it('keeps sharpen presets mild and optional', () => {
    assert.equal(sharpenParams('none'), null)
    const subtle = sharpenParams('subtle')
    const moderate = sharpenParams('moderate')
    assert.ok(subtle && subtle.sigma < 1)
    assert.ok(moderate && moderate.sigma <= 1)
    assert.ok(moderate && subtle && moderate.sigma > subtle.sigma)
  })

  it('asks before replacing a screensaver source', () => {
    assert.equal(screensaverTransferAction(false, null), 'send')
    assert.equal(screensaverTransferAction(true, null), 'ask')
    assert.equal(screensaverTransferAction(true, 'cancel'), 'abort')
    assert.equal(screensaverTransferAction(true, 'replace'), 'send')
  })

  it('computes cover crop offsets from crop position', () => {
    const wide = coverCropRect(8, 4, 4, 4, 'center')
    const left = coverCropRect(8, 4, 4, 4, 'left')
    const right = coverCropRect(8, 4, 4, 4, 'right')
    assert.ok(left.left < wide.left)
    assert.ok(right.left > wide.left)
    const top = coverCropRect(4, 8, 4, 4, 'top')
    assert.equal(top.top, 0)
  })

  it('resolves export and intermediate dimensions for each export preset', () => {
    const fourK = normalizeOptions({ ...defaultUpscaleOptions(), preset: 'uhd4k' }).options
    assert.deepEqual(resolveExportDimensions(800, 600, 1600, 1200, fourK), { width: 3840, height: 2160 })
    const original = normalizeOptions({ ...defaultUpscaleOptions(), preset: 'original' }).options
    assert.deepEqual(resolveExportDimensions(1972, 1109, 7888, 4436, original), { width: 1972, height: 1109 })
    const upscaled = normalizeOptions({ ...defaultUpscaleOptions(), preset: 'upscaled' }).options
    assert.deepEqual(resolveExportDimensions(800, 600, 1600, 1200, upscaled), { width: 1600, height: 1200 })
    assert.deepEqual(resolveIntermediateDimensions(100, 50, 3), { width: 300, height: 150 })
  })

  it('picks auto scale with standard and AI policies', () => {
    const limits = DEFAULT_UPSCALE_LIMITS
    const standard = selectAutoEffectiveScale({
      sourceWidth: 960,
      sourceHeight: 540,
      exportWidth: 3840,
      exportHeight: 2160,
      engine: 'lanczos3',
      limits,
    })
    assert.ok(standard.effectiveScale >= 2)
    const inside = selectAutoEffectiveScale({
      sourceWidth: 4000,
      sourceHeight: 3000,
      exportWidth: 1920,
      exportHeight: 1080,
      engine: 'lanczos3',
      limits,
    })
    assert.equal(inside.effectiveScale, 1)
    const fixed = resolveEffectiveScale(normalizeOptions({ ...defaultUpscaleOptions(), scaleFactor: 2 }).options, 100, 100, limits)
    assert.equal(fixed.effectiveScale, 2)
    const hashA = serializeUpscaleParamsForHash('lanczos3', 'auto', 2)
    const hashB = serializeExportParamsForHash(defaultUpscaleOptions(), 3840, 2160)
    assert.notEqual(hashA, hashB)
  })

  it('defaults scale factor for legacy payloads', () => {
    const legacy = { ...defaultUpscaleOptions() } as Record<string, unknown>
    delete legacy.scaleFactor
    const normalized = normalizeOptions(legacy).options
    assert.equal(normalized.scaleFactor, 'auto')
    assert.equal(normalized.preset, 'uhd4k')
  })

  it('documents the default safety limits', () => {
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxBatch, 8)
    assert.equal(DEFAULT_UPSCALE_LIMITS.concurrency, 1)
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxOutputEdge, 7680)
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxOutputPixels, 7680 * 4320)
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxFileBytes, 40 * 1024 * 1024)
  })
})
