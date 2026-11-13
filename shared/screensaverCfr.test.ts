import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_SCREENSAVER_RENDER_MODE,
  isAllowedScreensaverCfrFps,
  isAllowedScreensaverFpsForMode,
  isScreensaverCfrQuality,
  isScreensaverRenderMode,
  SCREENSAVER_CFR_FPS,
  SCREENSAVER_CFR_TIMESCALE,
} from './screensaver'

describe('screensaver CFR shared config', () => {
  it('defaults new projects to Optimized CFR', () => {
    assert.equal(DEFAULT_SCREENSAVER_RENDER_MODE, 'optimized-cfr')
  })

  it('accepts every listed CFR frame rate and timescale', () => {
    for (const fps of SCREENSAVER_CFR_FPS) {
      assert.ok(isAllowedScreensaverCfrFps(fps))
      assert.equal(SCREENSAVER_CFR_TIMESCALE % fps, 0)
    }
    assert.equal(isAllowedScreensaverCfrFps(1), false)
  })

  it('keeps Fast VFR fps rules separate from Optimized CFR', () => {
    assert.equal(isAllowedScreensaverFpsForMode(1, 'fast-vfr'), true)
    assert.equal(isAllowedScreensaverFpsForMode(1, 'optimized-cfr'), false)
    assert.equal(isAllowedScreensaverFpsForMode(25, 'optimized-cfr'), true)
    assert.equal(isAllowedScreensaverFpsForMode(25, 'fast-vfr'), false)
    assert.equal(isAllowedScreensaverFpsForMode(25, null), false)
  })

  it('validates mode and quality enums', () => {
    assert.equal(isScreensaverRenderMode('optimized-cfr'), true)
    assert.equal(isScreensaverRenderMode('legacy'), false)
    assert.equal(isScreensaverCfrQuality('compact'), true)
    assert.equal(isScreensaverCfrQuality('ultra'), false)
  })
})
