import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { defaultAudioLooperSettings, type AudioLooperFormat, type AudioLooperSettings } from '../../shared/audioLooper'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { cancelJob, createAudioLooperJob, getJob } from '../src/jobs'
import { probeAudioDetails } from '../src/probe'
import { renderAudioLooper } from '../src/renderAudioLooper'
import { ensureStorage, jobsDir, outputsDir } from '../src/storage'

const execFileAsync = promisify(execFile)

async function main(): Promise<void> {
  const enabled = process.env.VVR_AUDIO_LOOPER_TEST === '1' || process.env.npm_lifecycle_event === 'test:audio-looper'
  if (!enabled) {
    console.log('Run via npm run test:audio-looper or set VVR_AUDIO_LOOPER_TEST=1.')
    return
  }
  process.env.VVR_AUDIO_LOOPER_TEST = '1'
  await ensureStorage()
  const work = path.join(outputsDir, '..', 'verify-audio-looper')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  await mkdir(jobsDir, { recursive: true })

  const source = path.join(work, 'source-3s.wav')
  await buildJoinSource(source)
  const sourceInfo = await probeAudioDetails(source)
  const sourceDuration = sourceInfo.duration
  if (sourceDuration < 2.8 || sourceDuration > 3.2) {
    throw new Error(`join source duration ${sourceDuration} was not ~3s`)
  }
  const longSource = path.join(work, 'source-12s.wav')
  await synthSine(longSource, 12, 330)

  await checkFormat(source, 'wav', 10, sourceDuration)
  await checkFormat(source, 'mp3', 10, sourceDuration)
  await checkFormat(source, 'flac', 10, sourceDuration)

  const trimmed = await renderCase('trim', longSource, 12, {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 4,
    format: 'wav',
    filename: 'trim',
  })
  assertNear(trimmed.duration, 4, 0.3, 'trim duration')
  if (trimmed.duration > 4.4) throw new Error('trim: extra silence at the end')

  const simple = await renderCase('simple-join', source, sourceDuration, {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 10,
    loopMode: 'simple',
    format: 'wav',
    filename: 'simple',
  })
  assertNear(simple.duration, 10, 0.3, 'simple duration')
  const simpleBefore = await bandEnergy(simple.outputPath, sourceDuration - 0.12, 0.06)
  const simpleAfter = await bandEnergy(simple.outputPath, sourceDuration + 0.06, 0.06)
  if (!(simpleBefore.high > simpleBefore.low * 1.5)) {
    throw new Error(`simple join: expected 880Hz dominant before the cut (low=${simpleBefore.low.toFixed(4)} high=${simpleBefore.high.toFixed(4)})`)
  }
  if (!(simpleAfter.low > simpleAfter.high * 1.5)) {
    throw new Error(`simple join: expected 440Hz dominant after the cut (low=${simpleAfter.low.toFixed(4)} high=${simpleAfter.high.toFixed(4)})`)
  }

  const seamless = await renderCase('seamless-join', source, sourceDuration, {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 10,
    loopMode: 'seamless',
    crossfadeSeconds: 0.25,
    format: 'wav',
    filename: 'seamless',
  })
  assertNear(seamless.duration, 10, 0.3, 'seamless duration')
  const join = await bandEnergy(seamless.outputPath, 0.06, 0.1)
  const nextJoin = await bandEnergy(seamless.outputPath, sourceDuration - 0.25 + 0.06, 0.1)
  if (join.low < 0.008 || join.high < 0.008) {
    throw new Error(`seamless join: expected mixed 440Hz and 880Hz at the wrap (low=${join.low.toFixed(4)} high=${join.high.toFixed(4)})`)
  }
  if (join.low > join.high * 12 || join.high > join.low * 12) {
    throw new Error(`seamless join: one tone overwhelms the other — not a crossfade (low=${join.low.toFixed(4)} high=${join.high.toFixed(4)})`)
  }
  if (nextJoin.low < 0.008 || nextJoin.high < 0.008) {
    throw new Error(`seamless join: the looped cycle boundary is not crossfaded (low=${nextJoin.low.toFixed(4)} high=${nextJoin.high.toFixed(4)})`)
  }

  const faded = await renderCase('fades', source, sourceDuration, {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 8,
    format: 'wav',
    fadeInSeconds: 1,
    fadeOutSeconds: 1,
    volumePercent: 50,
    filename: 'fade',
  })
  const start = await rms(faded.outputPath, 0, 0.08)
  const mid = await rms(faded.outputPath, 3, 0.2)
  const end = await rms(faded.outputPath, 7.9, 0.08)
  if (!(start < mid * 0.5)) throw new Error('fade in did not reduce the opening level')
  if (!(end < mid * 0.5)) throw new Error('fade out did not reduce the closing level')

  const control = await renderCase('volume-control', source, sourceDuration, {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 6,
    format: 'wav',
    volumePercent: 100,
    filename: 'full',
  })
  const quiet = await rms(faded.outputPath, 3, 0.2)
  const loud = await rms(control.outputPath, 3, 0.2)
  if (!(quiet < loud * 0.8)) throw new Error('volume 50% was not quieter than 100%')

  await checkPlaylist(work)
  await checkTrimRange(work)
  await checkCancel(source)

  await rm(work, { recursive: true, force: true })
  console.log('Audio looper verify OK')
}

function hooks() {
  return {
    cancelled: () => false,
    onProgress: () => undefined,
    onStatus: () => undefined,
    registerKill: () => undefined,
  }
}

async function renderCase(
  label: string,
  sourcePath: string,
  sourceDuration: number,
  settings: AudioLooperSettings,
): Promise<{ outputPath: string; duration: number }> {
  const id = `00000000-0000-4000-8000-${label.replace(/[^a-z0-9]/gi, '').padEnd(12, '0').slice(0, 12)}`
  const result = await renderAudioLooper(
    {
      id,
      sourcePath,
      sourceDuration,
      sourceSampleRate: 48000,
      sourceChannels: 1,
      settings,
    },
    hooks(),
  )
  const probed = await probeAudioDetails(result.outputPath)
  await rm(path.join(jobsDir, id), { recursive: true, force: true }).catch(() => undefined)
  return { outputPath: result.outputPath, duration: probed.duration }
}

async function checkFormat(source: string, format: AudioLooperFormat, target: number, sourceDuration = 3): Promise<void> {
  const rendered = await renderCase(`fmt-${format}`, source, sourceDuration, {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: target,
    format,
    mp3Bitrate: 192,
    filename: `fmt-${format}`,
  })
  assertNear(rendered.duration, target, format === 'mp3' ? 0.35 : 0.25, `${format} duration`)
  const details = await probeAudioDetails(rendered.outputPath)
  const expected = format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : 'pcm_s16le'
  if (details.codec !== expected) throw new Error(`${format}: codec ${details.codec}`)
  if (details.size < 256) throw new Error(`${format}: empty file`)
  await rm(rendered.outputPath, { force: true }).catch(() => undefined)
}

async function buildJoinSource(file: string): Promise<void> {
  const dir = path.dirname(file)
  const a = path.join(dir, 'a.wav')
  const b = path.join(dir, 'b.wav')
  const c = path.join(dir, 'c.wav')
  await synthSine(a, 0.25, 440)
  await synthSine(b, 2.5, 100)
  await synthSine(c, 0.25, 880)
  const list = path.join(dir, 'concat.txt')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(list, `file '${a.replace(/\\/g, '/')}'\nfile '${b.replace(/\\/g, '/')}'\nfile '${c.replace(/\\/g, '/')}'\n`)
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-c:a',
    'pcm_s16le',
    file,
  ])
}

async function synthSine(
  file: string,
  duration: number,
  frequency: number,
  options?: { channels?: number; volume?: number },
): Promise<void> {
  const channels = options?.channels ?? 1
  const volume = options?.volume ?? 1
  const filters: string[] = []
  if (volume !== 1) filters.push(`volume=${volume}`)
  if (channels === 2) filters.push('aformat=channel_layouts=stereo')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`,
    ...(filters.length ? ['-af', filters.join(',')] : []),
    '-ac',
    String(channels),
    '-c:a',
    'pcm_s16le',
    file,
  ])
}

async function checkPlaylist(work: string): Promise<void> {
  const low = path.join(work, 'low-4.wav')
  const high = path.join(work, 'high-4.wav')
  const quiet = path.join(work, 'quiet-4.wav')
  const loud = path.join(work, 'loud-4.wav')
  const stereo = path.join(work, 'stereo-3.wav')
  const mono = path.join(work, 'mono-3.wav')
  const short = path.join(work, 'short-2.wav')
  await synthSine(low, 4, 440)
  await synthSine(high, 4, 880)
  await synthSine(quiet, 4, 440, { volume: 0.05 })
  await synthSine(loud, 4, 880, { volume: 0.8 })
  await synthSine(mono, 3, 440, { channels: 1 })
  await synthSine(stereo, 3, 880, { channels: 2 })
  await synthSine(short, 2, 440)

  const forward = await renderPlaylistCase('orderfwd', [clip(low, 4, 1), clip(high, 4, 1)], {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 6,
    playlistCrossfade: false,
    format: 'wav',
    filename: 'orderfwd',
  })
  const forwardStart = await bandEnergy(forward.outputPath, 0.2, 0.2)
  if (!(forwardStart.low > forwardStart.high * 1.5)) {
    throw new Error('playlist order: the first track was not exported first')
  }
  await rm(forward.outputPath, { force: true }).catch(() => undefined)

  const reverse = await renderPlaylistCase('orderrev', [clip(high, 4, 1), clip(low, 4, 1)], {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 6,
    playlistCrossfade: false,
    format: 'wav',
    filename: 'orderrev',
  })
  const reverseStart = await bandEnergy(reverse.outputPath, 0.2, 0.2)
  if (!(reverseStart.high > reverseStart.low * 1.5)) {
    throw new Error('playlist order: reversing the tracks did not reverse the export')
  }
  await rm(reverse.outputPath, { force: true }).catch(() => undefined)

  const faded = await renderPlaylistCase('plxfade', [clip(low, 4, 1), clip(high, 4, 1)], {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 10,
    playlistCrossfade: true,
    playlistCrossfadeSeconds: 0.5,
    format: 'wav',
    filename: 'plxfade',
  })
  assertNear(faded.duration, 10, 0.35, 'playlist crossfade duration')
  const wrap = await bandEnergy(faded.outputPath, 0.12, 0.16)
  const nextWrap = await bandEnergy(faded.outputPath, 7.12, 0.16)
  if (wrap.low < 0.008 || wrap.high < 0.008) {
    throw new Error(`playlist wrap: expected both tones at the start (low=${wrap.low.toFixed(4)} high=${wrap.high.toFixed(4)})`)
  }
  if (nextWrap.low < 0.008 || nextWrap.high < 0.008) {
    throw new Error(`playlist wrap: the repeated join is not crossfaded (low=${nextWrap.low.toFixed(4)} high=${nextWrap.high.toFixed(4)})`)
  }
  const body = await rms(faded.outputPath, 1.4, 0.2)
  if (!(body > 0.02)) throw new Error('playlist crossfade inserted silence inside the sequence')
  await rm(faded.outputPath, { force: true }).catch(() => undefined)

  try {
    await renderPlaylistCase('shortxf', [clip(short, 2, 1), clip(high, 4, 1)], {
      ...defaultAudioLooperSettings(),
      targetDurationSeconds: 8,
      playlistCrossfade: true,
      playlistCrossfadeSeconds: 3,
      format: 'wav',
      filename: 'shortxf',
    })
    throw new Error('short crossfade should have been rejected')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/at most|too short|short crossfade/.test(message)) throw error
    if (/short crossfade should have been rejected/.test(message)) throw error
    await rm(path.join(jobsDir, '00000000-0000-4000-8000-shortxf00000'), { recursive: true, force: true }).catch(() => undefined)
  }

  const rawQuiet = await rms(quiet, 0.5, 0.4)
  const rawLoud = await rms(loud, 0.5, 0.4)
  const normalized = await renderPlaylistCase('loudnorm', [clip(quiet, 4, 1), clip(loud, 4, 1)], {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 8,
    playlistCrossfade: false,
    normalizeLoudness: true,
    format: 'wav',
    filename: 'loudnorm',
  })
  const normQuiet = await rms(normalized.outputPath, 0.5, 0.4)
  const normLoud = await rms(normalized.outputPath, 4.5, 0.4)
  const rawRatio = rawLoud / Math.max(rawQuiet, 1e-6)
  const normRatio = normLoud / Math.max(normQuiet, 1e-6)
  if (!(normRatio < rawRatio * 0.5)) {
    throw new Error(`loudness matching did not pull the tracks together (raw ${rawRatio.toFixed(2)} vs ${normRatio.toFixed(2)})`)
  }
  await rm(normalized.outputPath, { force: true }).catch(() => undefined)

  const mixed = await renderPlaylistCase('mixlayout', [clip(mono, 3, 1), clip(stereo, 3, 2)], {
    ...defaultAudioLooperSettings(),
    targetDurationSeconds: 6,
    playlistCrossfade: false,
    format: 'wav',
    filename: 'mixlayout',
  })
  const mixedInfo = await probeAudioDetails(mixed.outputPath)
  if (mixedInfo.channels !== 2) throw new Error(`mixed layout exported ${mixedInfo.channels} channels`)
  assertNear(mixedInfo.duration, 6, 0.35, 'mixed layout duration')
  await rm(mixed.outputPath, { force: true }).catch(() => undefined)
}

function clip(file: string, duration: number, channels: number): { path: string; duration: number; channels: number } {
  return { path: file, duration, channels }
}

async function renderPlaylistCase(
  label: string,
  files: { path: string; duration: number; channels: number }[],
  settings: AudioLooperSettings,
): Promise<{ outputPath: string; duration: number }> {
  const id = `00000000-0000-4000-8000-${label.replace(/[^a-z0-9]/gi, '').padEnd(12, '0').slice(0, 12)}`
  const sources = files.map((file) => ({
    path: file.path,
    duration: file.duration,
    sampleRate: 48000,
    channels: file.channels,
    trimStart: 0,
    trimEnd: file.duration,
  }))
  const result = await renderAudioLooper(
    {
      id,
      sourcePath: files[0]?.path ?? '',
      sourceDuration: files[0]?.duration ?? 0,
      sourceSampleRate: 48000,
      sourceChannels: files[0]?.channels ?? 1,
      settings: {
        ...settings,
        tracks: sources.map((source, index) => ({
          id: `track-${index + 1}`,
          trimStart: 0,
          trimEnd: source.trimEnd,
        })),
      },
      sources,
    },
    hooks(),
  )
  const probed = await probeAudioDetails(result.outputPath)
  await rm(path.join(jobsDir, id), { recursive: true, force: true }).catch(() => undefined)
  return { outputPath: result.outputPath, duration: probed.duration }
}

async function checkTrimRange(work: string): Promise<void> {
  const low = path.join(work, 'trim-low.wav')
  const high = path.join(work, 'trim-high.wav')
  const joined = path.join(work, 'trim-join.wav')
  await synthSine(low, 6, 440)
  await synthSine(high, 6, 880)
  const list = path.join(work, 'trim-join.txt')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(list, `file '${low.replace(/\\/g, '/')}'\nfile '${high.replace(/\\/g, '/')}'\n`)
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-c:a',
    'pcm_s16le',
    joined,
  ])
  const id = '00000000-0000-4000-8000-trimrange000'
  const result = await renderAudioLooper(
    {
      id,
      sourcePath: joined,
      sourceDuration: 12,
      sourceSampleRate: 48000,
      sourceChannels: 1,
      settings: {
        ...defaultAudioLooperSettings(),
        targetDurationSeconds: 8,
        loopMode: 'simple',
        format: 'wav',
        filename: 'trimrange',
        tracks: [{ id: 'keep-high', trimStart: 6, trimEnd: 12 }],
      },
    },
    hooks(),
  )
  const probed = await probeAudioDetails(result.outputPath)
  assertNear(probed.duration, 8, 0.35, 'trimmed loop duration')
  const opening = await bandEnergy(result.outputPath, 0.2, 0.2)
  if (!(opening.high > opening.low * 1.5)) {
    throw new Error('trim range: the export did not start at the trimmed region')
  }
  await rm(result.outputPath, { force: true }).catch(() => undefined)
  await rm(path.join(jobsDir, id), { recursive: true, force: true }).catch(() => undefined)
}

async function bandEnergy(file: string, start: number, duration: number): Promise<{ low: number; high: number }> {
  const low = await filteredRms(file, start, duration, 'bandpass=f=440:width_type=h:width=60')
  const high = await filteredRms(file, start, duration, 'bandpass=f=880:width_type=h:width=60')
  return { low, high }
}

async function filteredRms(file: string, start: number, duration: number, filter: string): Promise<number> {
  const result = await execFileAsync(ffmpegBinary(), [
    '-hide_banner',
    '-ss',
    String(start),
    '-t',
    String(duration),
    '-i',
    file,
    '-af',
    `${filter},astats=metadata=1:reset=1`,
    '-f',
    'null',
    '-',
  ])
  return parseRms(String(result.stderr ?? ''))
}

async function rms(file: string, start: number, duration: number): Promise<number> {
  const result = await execFileAsync(ffmpegBinary(), [
    '-hide_banner',
    '-ss',
    String(start),
    '-t',
    String(duration),
    '-i',
    file,
    '-af',
    'astats=metadata=1:reset=1',
    '-f',
    'null',
    '-',
  ])
  return parseRms(String(result.stderr ?? ''))
}

function parseRms(stderr: string): number {
  const match = /RMS level dB:\s*(-?\d+(?:\.\d+)?)/i.exec(stderr)
  if (!match) return 0
  const db = Number(match[1])
  if (!Number.isFinite(db)) return 0
  return Math.pow(10, db / 20)
}

async function checkCancel(sourcePath: string): Promise<void> {
  const { randomUUID } = await import('node:crypto')
  const id = randomUUID()
  createAudioLooperJob(id, {
    sourcePath,
    sourceDuration: 3,
    sourceSampleRate: 48000,
    sourceChannels: 1,
    settings: {
      ...defaultAudioLooperSettings(),
      targetDurationSeconds: 45,
      format: 'mp3',
      mp3Bitrate: 320,
      filename: 'cancel-me',
    },
    downloadName: 'cancel-me',
    outputExt: '.mp3',
  })
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const view = getJob(id)
    if (view && (view.status === 'rendering' || view.status === 'preparing' || view.status === 'queued')) {
      const cancelled = cancelJob(id)
      if (cancelled?.status !== 'cancelled') throw new Error('cancel: status was not cancelled')
      await new Promise((resolve) => setTimeout(resolve, 400))
      const later = getJob(id)
      if (later && later.status !== 'cancelled') throw new Error(`cancel: ended as ${later.status}`)
      return
    }
    if (view?.status === 'done') {
      throw new Error('cancel: job finished before it could be cancelled')
    }
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  cancelJob(id)
  throw new Error('cancel: job never started')
}

function assertNear(actual: number, expected: number, slack: number, label: string): void {
  if (actual < expected - slack || actual > expected + slack) {
    throw new Error(`${label}: expected ${expected}s ± ${slack}, got ${actual}`)
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
