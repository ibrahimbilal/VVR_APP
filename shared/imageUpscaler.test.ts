import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_UPSCALE_LIMITS,
  defaultUpscaleOptions,
  enlargementWarning,
  normalizeOptions,
  resizeModeLabel,
  resizeSummary,
  sanitizeStem,
  screensaverTransferAction,
  sharpenParams,
  uniqueOutputName,
} from './imageUpscaler'

describe('image upscaler settings', () => {
  it('defaults to 4K UHD contain', () => {
    const options = defaultUpscaleOptions()
    assert.equal(options.preset, 'uhd4k')
    assert.equal(options.width, 3840)
    assert.equal(options.height, 2160)
    assert.equal(options.mode, 'contain')
    assert.equal(options.sharpen, 'none')
    assert.equal(options.format, 'png')
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
    assert.equal(sanitizeStem('..\\..\\mountains.jpg'), 'mountains')
    assert.doesNotMatch(first, /[/\\]/)
  })

  it('describes enlargement without claiming recovered detail', () => {
    const summary = resizeSummary(320, 180, normalizeOptions({ ...defaultUpscaleOptions(), preset: 'uhd4k' }).options)
    assert.equal(summary.targetWidth, 3840)
    assert.equal(summary.targetHeight, 2160)
    assert.match(summary.warning ?? '', /cannot recover detail/)
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

  it('documents the default safety limits', () => {
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxBatch, 8)
    assert.equal(DEFAULT_UPSCALE_LIMITS.concurrency, 1)
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxOutputEdge, 7680)
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxOutputPixels, 7680 * 4320)
    assert.equal(DEFAULT_UPSCALE_LIMITS.maxFileBytes, 40 * 1024 * 1024)
  })
})
