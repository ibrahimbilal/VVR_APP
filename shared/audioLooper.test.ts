import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applySourceConstraints,
  audioLooperDownloadName,
  combineDuration,
  DEFAULT_CROSSFADE_SECONDS,
  defaultAudioLooperSettings,
  estimateOutputBytes,
  formatHms,
  importExtension,
  maxCrossfadeForSource,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  normalizeSettings,
  outputExtension,
  parseDurationHms,
  repeatCount,
  sanitizeLooperStem,
  splitDuration,
  TEST_MIN_DURATION_SECONDS,
  volumeToFfmpeg,
} from './audioLooper'

function valid(overrides: Record<string, unknown> = {}) {
  return { ...defaultAudioLooperSettings(), ...overrides }
}

describe('audio looper settings', () => {
  it('accepts defaults', () => {
    const settings = normalizeSettings(valid())
    assert.equal(settings.targetDurationSeconds, 7200)
    assert.equal(settings.loopMode, 'simple')
    assert.equal(settings.format, 'mp3')
    assert.equal(settings.mp3Bitrate, 192)
    assert.equal(settings.volumePercent, 100)
    assert.equal(settings.crossfadeSeconds, DEFAULT_CROSSFADE_SECONDS)
  })

  it('rejects missing, NaN, Infinity, and negative values', () => {
    assert.throws(() => normalizeSettings(null), /missing/)
    assert.throws(() => normalizeSettings(valid({ targetDurationSeconds: Number.NaN })), /not a valid number/)
    assert.throws(() => normalizeSettings(valid({ targetDurationSeconds: Number.POSITIVE_INFINITY })), /not a valid number/)
    assert.throws(() => normalizeSettings(valid({ volumePercent: -1 })), /0% and 200%/)
    assert.throws(() => normalizeSettings(valid({ fadeInSeconds: -0.1 })), /negative/)
    assert.throws(() => normalizeSettings(valid({ targetDurationSeconds: 59 })), /between/)
    assert.throws(() => normalizeSettings(valid({ targetDurationSeconds: MAX_DURATION_SECONDS + 1 })), /between/)
    assert.throws(() => normalizeSettings(valid({ targetDurationSeconds: 90.5 })), /whole number/)
  })

  it('rejects unsupported enums instead of clamping them', () => {
    assert.throws(() => normalizeSettings(valid({ format: 'aac' })), /MP3, WAV, or FLAC/)
    assert.throws(() => normalizeSettings(valid({ loopMode: 'crossfade' })), /Simple or Seamless/)
    assert.throws(() => normalizeSettings(valid({ mp3Bitrate: 160 })), /128, 192, 256, or 320/)
  })

  it('allows short targets only when the test floor is passed', () => {
    const short = normalizeSettings(valid({ targetDurationSeconds: 10 }), { minDurationSeconds: TEST_MIN_DURATION_SECONDS })
    assert.equal(short.targetDurationSeconds, 10)
    assert.throws(() => normalizeSettings(valid({ targetDurationSeconds: 10 })), /between/)
    assert.equal(MIN_DURATION_SECONDS, 60)
    assert.equal(MAX_DURATION_SECONDS, 12 * 60 * 60)
  })

  it('parses hh:mm:ss and splits duration', () => {
    assert.equal(parseDurationHms('01:30:05'), 5405)
    assert.equal(combineDuration(2, 0, 0), 7200)
    assert.deepEqual(splitDuration(3661), { hours: 1, minutes: 1, seconds: 1 })
    assert.equal(formatHms(65), '00:01:05')
    assert.throws(() => parseDurationHms('1:99:00'), /hh:mm:ss/)
    assert.throws(() => combineDuration(0, -1, 0), /negative/)
  })

  it('clamps fades so they fit inside the target', () => {
    const settings = normalizeSettings(valid({ targetDurationSeconds: 60, fadeInSeconds: 40, fadeOutSeconds: 40 }))
    assert.equal(settings.fadeInSeconds, 30)
    assert.ok(settings.fadeInSeconds + settings.fadeOutSeconds <= 60)
    const tight = normalizeSettings(valid({ targetDurationSeconds: 60, fadeInSeconds: 30, fadeOutSeconds: 30 }))
    assert.equal(tight.fadeInSeconds, 30)
    assert.equal(tight.fadeOutSeconds, 30)
    const overflow = normalizeSettings(valid({ targetDurationSeconds: 60, fadeInSeconds: 30, fadeOutSeconds: 40 }))
    assert.equal(overflow.fadeInSeconds, 30)
    assert.equal(overflow.fadeOutSeconds, 30)
  })

  it('requires crossfade to be shorter than the source and at most half of it', () => {
    const settings = normalizeSettings(valid({ loopMode: 'seamless', crossfadeSeconds: 0.25 }))
    assert.doesNotThrow(() => applySourceConstraints(settings, 3))
    assert.throws(() => applySourceConstraints({ ...settings, crossfadeSeconds: 3 }, 3), /shorter than the source/)
    assert.throws(() => applySourceConstraints({ ...settings, crossfadeSeconds: 2 }, 3), /at most/)
    assert.ok(maxCrossfadeForSource(3) <= 1.5)
    assert.throws(
      () => normalizeSettings(valid({ loopMode: 'seamless', crossfadeSeconds: 2 }), { sourceDuration: 3 }),
      /at most/,
    )
  })

  it('derives the download name from a sanitized stem and the output format only', () => {
    assert.equal(audioLooperDownloadName('My Loop!', 'mp3'), 'My_Loop.mp3')
    assert.equal(audioLooperDownloadName('rain.wav', 'flac'), 'rain.flac')
    assert.equal(audioLooperDownloadName('..\\..\\track.mp3', 'wav'), 'track.wav')
    assert.equal(sanitizeLooperStem('a'.repeat(80) + '.ogg').length, 60)
    assert.equal(outputExtension('wav'), '.wav')
    assert.equal(importExtension('clip.M4A'), 'm4a')
    assert.equal(importExtension('notes.txt'), null)
    assert.doesNotMatch(audioLooperDownloadName('x', 'mp3'), /[/\\]/)
  })

  it('counts repeats, including trim-when-longer and a 30s to 2h case', () => {
    assert.equal(repeatCount(30, 10, 'simple'), 1)
    assert.equal(repeatCount(3, 10, 'simple'), 10 / 3)
    const twoHours = 2 * 60 * 60
    assert.equal(repeatCount(30, twoHours, 'simple'), twoHours / 30)
    assert.equal(repeatCount(30, twoHours, 'seamless', 0.25), twoHours / (30 - 0.25))
    assert.equal(repeatCount(3, 10, 'seamless', 0.25), 10 / (3 - 0.25))
  })

  it('estimates output size and labels MP3 from bitrate', () => {
    const hourMp3 = estimateOutputBytes(3600, 'mp3', { bitrate: 192 })
    assert.equal(hourMp3, Math.round((192000 * 3600) / 8))
    const wav = estimateOutputBytes(10, 'wav', { sampleRate: 48000, channels: 2 })
    assert.equal(wav, 48000 * 2 * 2 * 10)
    const flac = estimateOutputBytes(10, 'flac', { sampleRate: 48000, channels: 2 })
    assert.ok(flac < wav && flac > 0)
    assert.equal(volumeToFfmpeg(150), 1.5)
  })
})
