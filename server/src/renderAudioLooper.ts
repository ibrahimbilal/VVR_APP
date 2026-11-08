import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  outputExtension,
  volumeToFfmpeg,
  type AudioLooperSettings,
} from '../../shared/audioLooper'
import { n, RenderCancelled, spawnFfmpeg, verifyAudioOutput, type FfmpegHooks, type FfmpegStats } from './ffmpegUtil'
import { jobsDir, outputsDir } from './storage'

export interface AudioLooperRenderRequest {
  sourcePath: string
  sourceDuration: number
  sourceSampleRate: number
  sourceChannels: number
  settings: AudioLooperSettings
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

  const needsLoop = raw.sourceDuration < target
  const seamless = raw.settings.loopMode === 'seamless' && needsLoop

  if (seamless) {
    await renderSeamless(raw, workPath, dir, hooks)
  } else {
    hooks.onStatus('rendering', needsLoop ? 'Encoding loop' : 'Trimming audio')
    await spawnFfmpeg(simpleArgs(raw, workPath, needsLoop), target, wrapProgress(hooks, 0, 0.99))
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

async function moveOutput(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    await rm(from, { force: true }).catch(() => undefined)
  }
}
