import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cfrLibx264Args, h264Level, resolveCfrEncodeSettings } from './encodingConfig'

describe('encodingConfig', () => {
  it('uses level 5.2 for 4K60 and lower levels otherwise', () => {
    assert.equal(h264Level(3840, 2160, 60), '5.2')
    assert.equal(h264Level(3840, 2160, 30), '5.1')
    assert.equal(h264Level(1920, 1080, 60), '4.2')
    assert.equal(h264Level(1920, 1080, 24), '4.0')
  })

  it('maps quality presets to CRF / preset / GOP', () => {
    const high = resolveCfrEncodeSettings('high', 60, 3840, 2160)
    const balanced = resolveCfrEncodeSettings('balanced', 60, 3840, 2160)
    const compact = resolveCfrEncodeSettings('compact', 60, 3840, 2160)
    assert.equal(high.crf, 18)
    assert.equal(high.preset, 'medium')
    assert.equal(balanced.crf, 20)
    assert.equal(balanced.preset, 'veryfast')
    assert.equal(compact.crf, 24)
    assert.equal(compact.gopSeconds, 5)
    assert.equal(balanced.gopSeconds, 2)
    assert.equal(balanced.timescale, 60_000)
  })

  it('emits closed-GOP CFR args with stillimage tune only for static', () => {
    const settings = resolveCfrEncodeSettings('balanced', 60, 1920, 1080)
    const still = cfrLibx264Args(settings, true)
    const motion = cfrLibx264Args(settings, false)
    assert.ok(still.includes('stillimage'))
    assert.equal(motion.includes('stillimage'), false)
    assert.ok(still.includes('+cgop'))
    assert.ok(still.includes('force-cfr=1') || still.some((arg) => String(arg).includes('force-cfr=1')))
  })
})
