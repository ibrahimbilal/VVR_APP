import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { playbackProgress, resamplePeaks, WAVEFORM_PLAYED_OPACITY, WAVEFORM_UNPLAYED_OPACITY } from './waveform'

describe('waveform helpers', () => {
  it('keeps unplayed opacity at 0.8 and played at 1', () => {
    assert.equal(WAVEFORM_UNPLAYED_OPACITY, 0.8)
    assert.equal(WAVEFORM_PLAYED_OPACITY, 1)
  })

  it('maps currentTime to a 0–1 playback ratio', () => {
    assert.equal(playbackProgress(0, 10), 0)
    assert.equal(playbackProgress(2.5, 10), 0.25)
    assert.equal(playbackProgress(10, 10), 1)
    assert.equal(playbackProgress(12, 10), 1)
    assert.equal(playbackProgress(1, 0), 0)
    assert.equal(playbackProgress(Number.NaN, 10), 0)
  })

  it('downsamples peaks by max-pooling so amplitude is preserved', () => {
    const peaks = new Float32Array([0.1, 0.8, 0.2, 0.4])
    const two = resamplePeaks(peaks, 2)
    assert.equal(two.length, 2)
    assert.ok((two[0] ?? 0) > 0.79)
    assert.ok((two[1] ?? 0) > 0.39)
  })
})
