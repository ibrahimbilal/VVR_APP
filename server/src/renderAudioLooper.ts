import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  LOUDNESS_TARGET_I,
  LOUDNESS_TARGET_LRA,
  LOUDNESS_TARGET_TP,
  outputExtension,
  volumeToFfmpeg,
  type AudioLooperSettings,
} from '../../shared/audioLooper'
import { assertPlaylistTimeline, playlistPeriod } from '../../shared/audioLooperPlaylist'
import { n, RenderCancelled, spawnFfmpeg, verifyAudioOutput, type FfmpegHooks, type FfmpegStats } from './ffmpegUtil'
import { jobsDir, outputsDir } from './storage'

export interface AudioLooperPlaylistSource {
  path: string
  duration: number
  sampleRate: number
  channels: number
  trimStart: number
  trimEnd: number
}

export interface AudioLooperRenderRequest {
  sourcePath: string
  sourceDuration: number
  sourceSampleRate: number
  sourceChannels: number
  settings: AudioLooperSettings
  /** Two or more sources use the playlist graph. One source keeps the existing loop. */
  sources?: AudioLooperPlaylistSource[]
}

export interface AudioLooperRenderHooks {
  cancelled: () => boolean
  onProgress: (progress: number, message?: string) => void
  onStats?: (stats: FfmpegStats) => void
  onSpawn?: (pid: number) => void
  onStatus: (status: 'preparing' | 'rendering' | 'verifying' | 'cancelled', message: string) => void
  registerKill: (kill: () => void) => void
}

export async function renderAudioLooper(
  raw: AudioLooperRenderRequest & { id: string },
  hooks: AudioLooperRenderHooks,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('preparing', 'Preparing audio')

  const target = raw.settings.targetDurationSeconds
  const ext = outputExtension(raw.settings.format)
  const dir = path.join(jobsDir, raw.id)
  await mkdir(dir, { recursive: true })
  const workPath = path.join(dir, `output${ext}`)
  const finalPath = path.join(outputsDir, `${raw.id}${ext}`)

  if (raw.sources && raw.sources.length >= 2) {
    await renderPlaylist(raw, workPath, dir, hooks)
  } else {
    const prepared = await maybeTrimSource(raw, dir, hooks)
    const needsLoop = prepared.sourceDuration < target
    const seamless = prepared.settings.loopMode === 'seamless' && needsLoop
    if (seamless) {
      await renderSeamless(prepared, workPath, dir, hooks)
    } else {
      hooks.onStatus('rendering', needsLoop ? 'Encoding loop' : 'Trimming audio')
      await spawnFfmpeg(simpleArgs(prepared, workPath, needsLoop), target, wrapProgress(hooks, 0, 0.99))
    }
  }

  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('verifying', 'Checking the audio file')
  const verified = await verifyAudioOutput(workPath, target, raw.settings.format)
  await moveOutput(workPath, finalPath)
  return { ...verified, outputPath: finalPath, warning: null }
}

function wrapProgress(hooks: AudioLooperRenderHooks, from: number, to: number): FfmpegHooks {
  return {
    cancelled: hooks.cancelled,
    onProgress: (progress, message) => {
      hooks.onProgress(from + (to - from) * Math.max(0, Math.min(1, progress)), message)
    },
    onStats: hooks.onStats,
    onSpawn: hooks.onSpawn,
    registerKill: hooks.registerKill,
  }
}

function ffmpegPrefix(): string[] {
  return ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats']
}

function encodeArgs(settings: AudioLooperSettings): string[] {
  if (settings.format === 'wav') return ['-c:a', 'pcm_s16le']
  if (settings.format === 'flac') return ['-c:a', 'flac']
  return ['-c:a', 'libmp3lame', '-b:a', `${settings.mp3Bitrate}k`]
}

function outputFilter(settings: AudioLooperSettings, duration: number): string | null {
  const parts: string[] = []
  const volume = volumeToFfmpeg(settings.volumePercent)
  if (Math.abs(volume - 1) > 0.001) parts.push(`volume=${n(volume)}`)
  if (settings.fadeInSeconds > 0.01) parts.push(`afade=t=in:st=0:d=${n(settings.fadeInSeconds)}`)
  if (settings.fadeOutSeconds > 0.01) {
    const start = Math.max(0, duration - settings.fadeOutSeconds)
    parts.push(`afade=t=out:st=${n(start)}:d=${n(settings.fadeOutSeconds)}`)
  }
  parts.push(`atrim=0:${n(duration)}`, 'asetpts=PTS-STARTPTS')
  return parts.length ? parts.join(',') : null
}

function simpleArgs(raw: AudioLooperRenderRequest & { id: string }, workPath: string, loop: boolean): string[] {
  const target = raw.settings.targetDurationSeconds
  const args = [...ffmpegPrefix()]
  if (loop) args.push('-stream_loop', '-1')
  args.push('-i', raw.sourcePath, '-t', n(target), '-vn', '-map', '0:a:0')
  const filter = outputFilter(raw.settings, target)
  if (filter) args.push('-filter:a', filter)
  args.push(...encodeArgs(raw.settings), workPath)
  return args
}

async function renderSeamless(
  raw: AudioLooperRenderRequest & { id: string },
  workPath: string,
  dir: string,
  hooks: AudioLooperRenderHooks,
): Promise<void> {
  const D = raw.sourceDuration
  const C = raw.settings.crossfadeSeconds
  const P = D - C
  if (!(P > 0) || C >= D) {
    throw new Error('Crossfade must be shorter than the source audio.')
  }

  const cyclePath = path.join(dir, 'cycle.wav')
  const xfPath = path.join(dir, 'xf.wav')
  const midPath = path.join(dir, 'mid.wav')
  const listPath = path.join(dir, 'cycle.txt')
  const midDuration = D - 2 * C
  const hasMid = midDuration > 0.001

  hooks.onStatus('preparing', 'Building seamless loop cycle')
  await spawnFfmpeg(
    [
      ...ffmpegPrefix(),
      '-i',
      raw.sourcePath,
      '-filter_complex',
      [
        `[0:a]asplit=2[head][tail]`,
        `[head]atrim=0:${n(C)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${n(C)}:curve=esin[h]`,
        `[tail]atrim=${n(D - C)}:${n(D)},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${n(C)}:curve=esin[t]`,
        `[t][h]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[xf]`,
      ].join(';'),
      '-map',
      '[xf]',
      '-t',
      n(C),
      '-vn',
      '-c:a',
      'pcm_s16le',
      xfPath,
    ],
    C,
    wrapProgress(hooks, 0, 0.04),
  )

  if (hooks.cancelled()) throw new RenderCancelled()

  if (hasMid) {
    await spawnFfmpeg(
      [
        ...ffmpegPrefix(),
        '-i',
        raw.sourcePath,
        '-filter:a',
        `atrim=${n(C)}:${n(D - C)},asetpts=PTS-STARTPTS`,
        '-t',
        n(midDuration),
        '-vn',
        '-map',
        '0:a:0',
        '-c:a',
        'pcm_s16le',
        midPath,
      ],
      midDuration,
      wrapProgress(hooks, 0.04, 0.07),
    )
    const { writeFile } = await import('node:fs/promises')
    const xfEntry = xfPath.replace(/\\/g, '/')
    const midEntry = midPath.replace(/\\/g, '/')
    await writeFile(listPath, `file '${xfEntry}'\nfile '${midEntry}'\n`)
    await spawnFfmpeg(
      [
        ...ffmpegPrefix(),
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:a',
        'pcm_s16le',
        cyclePath,
      ],
      P,
      wrapProgress(hooks, 0.07, 0.09),
    )
  } else {
    await copyFile(xfPath, cyclePath)
  }

  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('rendering', 'Encoding seamless loop')

  const target = raw.settings.targetDurationSeconds
  const filter = outputFilter(raw.settings, target)
  const args = [...ffmpegPrefix(), '-stream_loop', '-1', '-i', cyclePath, '-t', n(target), '-vn', '-map', '0:a:0']
  if (filter) args.push('-filter:a', filter)
  args.push(...encodeArgs(raw.settings), workPath)
  await spawnFfmpeg(args, target, wrapProgress(hooks, 0.08, 0.99))
}

const PCM_FORMAT = 'aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo'
const LIMITER = 'alimiter=limit=0.95:level=disabled'

export function playlistStreamArgs(
  cyclePath: string,
  settings: AudioLooperSettings,
  workPath: string,
  loop: boolean,
): string[] {
  const target = settings.targetDurationSeconds
  const args = [...ffmpegPrefix()]
  if (loop) args.push('-stream_loop', '-1')
  args.push('-i', cyclePath, '-t', n(target), '-vn', '-map', '0:a:0')
  const filter = outputFilter(settings, target)
  if (filter) args.push('-filter:a', filter)
  args.push(...encodeArgs(settings), workPath)
  return args
}

async function maybeTrimSource(
  raw: AudioLooperRenderRequest & { id: string },
  dir: string,
  hooks: AudioLooperRenderHooks,
): Promise<AudioLooperRenderRequest & { id: string }> {
  const track = raw.settings.tracks?.[0]
  if (!track) return raw
  const untouched = track.trimStart <= 0.03 && track.trimEnd >= raw.sourceDuration - 0.05
  if (untouched) return raw
  const trimEnd = Math.min(track.trimEnd, raw.sourceDuration)
  const duration = trimEnd - track.trimStart
  if (!(duration > 0)) throw new Error('Each trim must be longer than zero.')
  const trimmedPath = path.join(dir, 'trimmed.wav')
  hooks.onStatus('preparing', 'Trimming audio')
  await spawnFfmpeg(
    [
      ...ffmpegPrefix(),
      '-i',
      raw.sourcePath,
      '-filter:a',
      `atrim=${n(track.trimStart)}:${n(trimEnd)},asetpts=PTS-STARTPTS,${PCM_FORMAT}`,
      '-t',
      n(duration),
      '-vn',
      '-c:a',
      'pcm_s16le',
      trimmedPath,
    ],
    duration,
    wrapProgress(hooks, 0, 0.08),
  )
  return {
    ...raw,
    sourcePath: trimmedPath,
    sourceDuration: duration,
    sourceSampleRate: 48000,
    sourceChannels: 2,
  }
}

async function renderPlaylist(
  raw: AudioLooperRenderRequest & { id: string },
  workPath: string,
  dir: string,
  hooks: AudioLooperRenderHooks,
): Promise<void> {
  const sources = raw.sources ?? []
  const durations = sources.map((source) => source.trimEnd - source.trimStart)
  const crossfadeOn = raw.settings.playlistCrossfade
  const crossfade = crossfadeOn ? raw.settings.playlistCrossfadeSeconds : 0
  const period = assertPlaylistTimeline(durations, crossfadeOn, crossfade)
  const analyzeEnd = raw.settings.normalizeLoudness ? 0.4 : 0.18

  const prepared: string[] = []
  for (let index = 0; index < sources.length; index += 1) {
    if (hooks.cancelled()) throw new RenderCancelled()
    const source = sources[index]
    if (!source) continue
    const label = raw.settings.normalizeLoudness
      ? `Matching loudness ${index + 1} of ${sources.length}`
      : `Preparing track ${index + 1} of ${sources.length}`
    hooks.onStatus('preparing', label)
    const out = path.join(dir, `track-${index}.wav`)
    const from = (index / sources.length) * analyzeEnd
    const to = ((index + 1) / sources.length) * analyzeEnd
    await prepareTrack(source, out, raw.settings.normalizeLoudness, hooks, from, to)
    prepared.push(out)
  }

  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('preparing', 'Building the sequence')
  const cyclePath = path.join(dir, 'cycle.wav')
  if (crossfadeOn) {
    await buildCrossfadeCycle(prepared, durations, crossfade, period, cyclePath, dir, hooks, analyzeEnd)
  } else {
    await concatWavs(prepared, cyclePath, period, raw.settings.normalizeLoudness, hooks, analyzeEnd, analyzeEnd + 0.08)
  }

  if (hooks.cancelled()) throw new RenderCancelled()
  const target = raw.settings.targetDurationSeconds
  const loop = period < target - 0.001
  hooks.onStatus('rendering', loop ? 'Encoding loop' : 'Trimming audio')
  await spawnFfmpeg(
    playlistStreamArgs(cyclePath, raw.settings, workPath, loop),
    target,
    wrapProgress(hooks, analyzeEnd + 0.1, 0.99),
  )
}

async function prepareTrack(
  source: AudioLooperPlaylistSource,
  outPath: string,
  normalize: boolean,
  hooks: AudioLooperRenderHooks,
  from: number,
  to: number,
): Promise<void> {
  const duration = source.trimEnd - source.trimStart
  const trimmed = `atrim=${n(source.trimStart)}:${n(source.trimEnd)},asetpts=PTS-STARTPTS,${PCM_FORMAT}`
  if (!normalize) {
    await spawnFfmpeg(
      [...ffmpegPrefix(), '-i', source.path, '-filter:a', trimmed, '-t', n(duration), '-vn', '-c:a', 'pcm_s16le', outPath],
      duration,
      wrapProgress(hooks, from, to),
    )
    return
  }
  const measured = await spawnFfmpeg(
    [
      ...ffmpegPrefix(),
      '-i',
      source.path,
      '-filter:a',
      `${trimmed},loudnorm=I=${LOUDNESS_TARGET_I}:TP=${LOUDNESS_TARGET_TP}:LRA=${LOUDNESS_TARGET_LRA}:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    duration,
    wrapProgress(hooks, from, from + (to - from) * 0.45),
  )
  const stats = parseLoudnorm(measured)
  const loudness = stats
    ? `loudnorm=I=${LOUDNESS_TARGET_I}:TP=${LOUDNESS_TARGET_TP}:LRA=${LOUDNESS_TARGET_LRA}:measured_I=${stats.i}:measured_TP=${stats.tp}:measured_LRA=${stats.lra}:measured_thresh=${stats.thresh}:offset=${stats.offset}:linear=true`
    : `loudnorm=I=${LOUDNESS_TARGET_I}:TP=${LOUDNESS_TARGET_TP}:LRA=${LOUDNESS_TARGET_LRA}`
  await spawnFfmpeg(
    [
      ...ffmpegPrefix(),
      '-i',
      source.path,
      '-filter:a',
      `${trimmed},${loudness}`,
      '-t',
      n(duration),
      '-vn',
      '-c:a',
      'pcm_s16le',
      outPath,
    ],
    duration,
    wrapProgress(hooks, from + (to - from) * 0.45, to),
  )
}

function parseLoudnorm(stderr: string): { i: string; tp: string; lra: string; thresh: string; offset: string } | null {
  const blocks = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)
  const raw = blocks?.at(-1)
  if (!raw) return null
  try {
    const json = JSON.parse(raw) as Record<string, unknown>
    const i = loudnormNumber(json.input_i)
    const tp = loudnormNumber(json.input_tp)
    const lra = loudnormNumber(json.input_lra)
    const thresh = loudnormNumber(json.input_thresh)
    const offset = loudnormNumber(json.target_offset)
    if (!i || !tp || !lra || !thresh || !offset) return null
    return { i, tp, lra, thresh, offset }
  } catch {
    return null
  }
}

function loudnormNumber(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null
  return text
}

async function buildCrossfadeCycle(
  tracks: string[],
  durations: number[],
  crossfade: number,
  period: number,
  cyclePath: string,
  dir: string,
  hooks: AudioLooperRenderHooks,
  progressFrom: number,
): Promise<void> {
  let current = tracks[0]
  let currentDuration = durations[0] ?? 0
  if (!current) throw new Error('Add at least two tracks.')
  for (let index = 1; index < tracks.length; index += 1) {
    if (hooks.cancelled()) throw new RenderCancelled()
    const next = tracks[index]
    if (!next) continue
    const joined = path.join(dir, `join-${index}.wav`)
    const outDuration = currentDuration + (durations[index] ?? 0) - crossfade
    await spawnFfmpeg(
      [
        ...ffmpegPrefix(),
        '-i',
        current,
        '-i',
        next,
        '-filter_complex',
        `[0:a][1:a]acrossfade=d=${n(crossfade)}:c1=esin:c2=esin,${PCM_FORMAT}`,
        '-t',
        n(outDuration),
        '-c:a',
        'pcm_s16le',
        joined,
      ],
      outDuration,
      wrapProgress(hooks, progressFrom, progressFrom + 0.06),
    )
    current = joined
    currentDuration = outDuration
  }

  const bodyDuration = currentDuration
  const expectedBody = playlistPeriod(durations, 0) - (durations.length - 1) * crossfade
  if (Math.abs(bodyDuration - expectedBody) > 0.25 && bodyDuration + 1e-3 < crossfade * 2) {
    throw new Error('Crossfade removes the whole sequence. Shorten the transition.')
  }

  const xfPath = path.join(dir, 'xf.wav')
  await spawnFfmpeg(
    [
      ...ffmpegPrefix(),
      '-i',
      current,
      '-filter_complex',
      [
        '[0:a]asplit=2[head][tail]',
        `[head]atrim=0:${n(crossfade)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${n(crossfade)}:curve=esin[h]`,
        `[tail]atrim=${n(Math.max(0, bodyDuration - crossfade))}:${n(bodyDuration)},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${n(crossfade)}:curve=esin[t]`,
        '[t][h]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[xf]',
      ].join(';'),
      '-map',
      '[xf]',
      '-t',
      n(crossfade),
      '-c:a',
      'pcm_s16le',
      xfPath,
    ],
    crossfade,
    wrapProgress(hooks, progressFrom + 0.06, progressFrom + 0.08),
  )

  const midDuration = bodyDuration - 2 * crossfade
  if (midDuration > 0.001) {
    const midPath = path.join(dir, 'mid.wav')
    await spawnFfmpeg(
      [
        ...ffmpegPrefix(),
        '-i',
        current,
        '-filter:a',
        `atrim=${n(crossfade)}:${n(bodyDuration - crossfade)},asetpts=PTS-STARTPTS`,
        '-t',
        n(midDuration),
        '-vn',
        '-c:a',
        'pcm_s16le',
        midPath,
      ],
      midDuration,
      wrapProgress(hooks, progressFrom + 0.08, progressFrom + 0.1),
    )
    await concatWavs([xfPath, midPath], cyclePath, period, true, hooks, progressFrom + 0.1, progressFrom + 0.12)
    return
  }
  await spawnFfmpeg(
    [
      ...ffmpegPrefix(),
      '-i',
      xfPath,
      '-filter:a',
      `${LIMITER},atrim=0:${n(period)},asetpts=PTS-STARTPTS`,
      '-t',
      n(period),
      '-c:a',
      'pcm_s16le',
      cyclePath,
    ],
    period,
    wrapProgress(hooks, progressFrom + 0.08, progressFrom + 0.12),
  )
}

async function concatWavs(
  files: string[],
  outPath: string,
  duration: number,
  limit: boolean,
  hooks: AudioLooperRenderHooks,
  from: number,
  to: number,
): Promise<void> {
  const tail = limit ? `${LIMITER},` : ''
  const filterTail = `${tail}atrim=0:${n(duration)},asetpts=PTS-STARTPTS`
  if (files.length <= 1) {
    const only = files[0]
    if (!only) throw new Error('The sequence is empty.')
    await spawnFfmpeg(
      [...ffmpegPrefix(), '-i', only, '-filter:a', filterTail, '-t', n(duration), '-c:a', 'pcm_s16le', outPath],
      duration,
      wrapProgress(hooks, from, to),
    )
    return
  }
  const inputs = files.flatMap((file) => ['-i', file])
  const pads = files.map((_, index) => `[${index}:a]`).join('')
  await spawnFfmpeg(
    [
      ...ffmpegPrefix(),
      ...inputs,
      '-filter_complex',
      `${pads}concat=n=${files.length}:v=0:a=1,${filterTail}`,
      '-t',
      n(duration),
      '-c:a',
      'pcm_s16le',
      outPath,
    ],
    duration,
    wrapProgress(hooks, from, to),
  )
}

async function moveOutput(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    await rm(from, { force: true }).catch(() => undefined)
  }
}
