import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import express from 'express'
import { defaultAudioLooperSettings } from '../../shared/audioLooper'
import { createAudioLooperRouter } from './audioLooperRoutes'
import { parseProgressSeconds } from './ffmpegUtil'
import { cancelJob, createAudioLooperJob, getJob, jobOutput, outputFile } from './jobs'
import { ensureStorage, incomingDir, outputsDir } from './storage'

function idleHooks() {
  return true
}

describe('audio looper jobs and routes', () => {
  let server: Server
  let port = 0

  before(async () => {
    process.env.VVR_AUDIO_LOOPER_TEST = '1'
    await ensureStorage()
    const app = express()
    app.use('/api/audio-looper', createAudioLooperRouter())
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address ? address.port : 0
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  it('parses FFmpeg progress timestamps with us/ms fallbacks', () => {
    assert.equal(parseProgressSeconds('out_time_us=1500000'), 1.5)
    assert.equal(parseProgressSeconds('out_time_ms=2500'), 2.5)
    assert.equal(parseProgressSeconds('out_time=00:01:01.5'), 61.5)
    assert.equal(parseProgressSeconds('out_time_us=N/A'), null)
    assert.equal(parseProgressSeconds('speed=1.2x'), null)
  })

  it('keeps ranking/screensaver output paths on .mp4 and uses path.join', () => {
    assert.equal(outputFile('clip-1'), path.join(outputsDir, 'clip-1.mp4'))
    assert.equal(outputFile('clip-1', '.wav'), path.join(outputsDir, 'clip-1.wav'))
    assert.equal(outputFile('clip-1', 'flac'), path.join(outputsDir, 'clip-1.flac'))
    assert.equal(path.basename(outputFile('abc', '.mp3')), 'abc.mp3')
    assert.doesNotMatch(outputFile('abc', '.mp3'), /abc[/\\]\.mp3/)
  })

  it('isolates audio-looper job kind and output extension from ranking', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const job = createAudioLooperJob(id, {
      sourcePath: path.join(incomingDir, 'missing.wav'),
      sourceDuration: 3,
      sourceSampleRate: 48000,
      sourceChannels: 2,
      settings: { ...defaultAudioLooperSettings(), targetDurationSeconds: 10, format: 'wav', filename: 'loop' },
      downloadName: 'loop',
      outputExt: '.wav',
    })
    assert.equal(job.kind, 'audio-looper')
    assert.equal(job.outputExt, '.wav')
    assert.equal(getJob(id)?.kind, 'audio-looper')
    const cancelled = cancelJob(id)
    assert.equal(cancelled?.status, 'cancelled')
    assert.equal(jobOutput(id), null)
    assert.equal(outputFile('ranking-id'), path.join(outputsDir, 'ranking-id.mp4'))
    void idleHooks()
  })

  it('cancels a queued job before it finishes', () => {
    const first = createAudioLooperJob('22222222-2222-4222-8222-222222222222', {
      sourcePath: path.join(incomingDir, 'missing.wav'),
      sourceDuration: 3,
      sourceSampleRate: 48000,
      sourceChannels: 2,
      settings: { ...defaultAudioLooperSettings(), targetDurationSeconds: 10, format: 'wav', filename: 'one' },
      downloadName: 'one',
      outputExt: '.wav',
    })
    const second = createAudioLooperJob('33333333-3333-4333-8333-333333333333', {
      sourcePath: path.join(incomingDir, 'missing.wav'),
      sourceDuration: 3,
      sourceSampleRate: 48000,
      sourceChannels: 2,
      settings: { ...defaultAudioLooperSettings(), targetDurationSeconds: 10, format: 'wav', filename: 'two' },
      downloadName: 'two',
      outputExt: '.flac',
    })
    const cancelled = cancelJob(second.id)
    assert.equal(cancelled?.status, 'cancelled')
    assert.ok((getJob(second.id)?.queuePosition ?? 0) === 0)
    cancelJob(first.id)
  })

  it('rejects missing files, bad JSON, and non-audio uploads, and removes abandoned files', async () => {
    const missing = await fetch(`http://127.0.0.1:${port}/api/audio-looper/export`, { method: 'POST', body: new FormData() })
    assert.equal(missing.status, 400)
    const missingBody = (await missing.json()) as { error?: string }
    assert.match(missingBody.error ?? '', /audio file/i)

    const badJson = new FormData()
    badJson.append('file', new Blob(['RIFF'], { type: 'audio/wav' }), 'x.wav')
    badJson.append('settings', '{not json')
    const bad = await fetch(`http://127.0.0.1:${port}/api/audio-looper/export`, { method: 'POST', body: badJson })
    assert.equal(bad.status, 400)

    const work = path.join(incomingDir, '..', 'audio-looper-test')
    await mkdir(work, { recursive: true })
    const junk = path.join(work, 'notes.txt')
    await writeFile(junk, 'this is not audio')
    const body = new FormData()
    body.append('file', new Blob(['this is not audio'], { type: 'text/plain' }), 'notes.txt')
    body.append('settings', JSON.stringify({ ...defaultAudioLooperSettings(), targetDurationSeconds: 10 }))
    const invalid = await fetch(`http://127.0.0.1:${port}/api/audio-looper/export`, { method: 'POST', body })
    assert.equal(invalid.status, 400)
    await rm(work, { recursive: true, force: true })
  })
})
