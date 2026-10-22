import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { EncoderChoice, ScreensaverProfile } from '../../shared/screensaver'
import type { ScreensaverComposition } from '../../shared/screensaverComposition'
import { EncoderRejected, selectEncoder, type EncoderId } from './encoders'
import { n, RenderCancelled, spawnFfmpeg, verifyVideoOutput, type FfmpegStats } from './ffmpegUtil'
import { probeSourceDetails } from './probe'
import { audioFilterLine, canStreamCopy, compositionFilterLines, legacyScaleFilter, type GraphJob } from './screensaverGraph'
import { jobsDir, outputsDir } from './storage'

export interface ScreensaverRenderRequest {
  mediaPath: string
  mediaKind: 'image' | 'video'
  mode: 'static' | 'loop'
  width: number
  height: number
  fps: number
  duration: number
  fit: 'contain' | 'cover' | 'blur'
  loopType: 'hard' | 'smooth'
  crossfadeSeconds: number
  audioMode: 'none' | 'source' | 'upload'
  audioVolume: number
  audioFadeIn: number
  audioFadeOut: number
  loopAudio: boolean
  backgroundColor: string
  musicPath: string | null
  sourceDuration: number
  sourceHasAudio: boolean
  profile?: ScreensaverProfile
  encoder?: EncoderChoice
  composition?: ScreensaverComposition | null
  compositionPath?: string | null
  framePath?: string | null
  maskPath?: string | null
  sourceWidth?: number
  sourceHeight?: number
  sourceCodec?: string | null
  sourcePixFmt?: string | null
  sourceAudioCodec?: string | null
}

export interface ScreensaverRenderHooks {
  cancelled: () => boolean
  onProgress: (progress: number, message?: string) => void
  onStats?: (stats: FfmpegStats) => void
  onSpawn?: (pid: number) => void
  onEncode?: (info: { encoder: string; hardware: boolean; encoderId: EncoderId }) => void
  onStatus: (status: 'preparing' | 'rendering' | 'verifying' | 'cancelled', message: string) => void
  registerKill: (kill: () => void) => void
}

interface ChosenEncoder {
  id: EncoderId
  label: string
  hardware: boolean
  args: string[]
}

export async function renderScreensaver(
  raw: ScreensaverRenderRequest & { id: string },
  hooks: ScreensaverRenderHooks,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('preparing', 'Preparing media')
  const job = normalize(raw)
  const still = job.mediaKind === 'image' || Boolean(job.compositionPath)
  const chosen = await selectEncoder({
    choice: job.encoder,
    profile: job.profile,
    width: job.width,
    height: job.height,
    still,
  })
  hooks.onEncode?.({ encoder: chosen.label, hardware: chosen.hardware, encoderId: chosen.id })
  try {
    return await renderWithEncoder(job, chosen, hooks, null)
  } catch (error) {
    if (job.encoder !== 'auto' || chosen.id === 'libx264' || hooks.cancelled() || error instanceof RenderCancelled) throw error
    const detail = error instanceof Error ? error.message : 'The hardware encoder failed.'
    const cpu = await selectEncoder({ choice: 'cpu', profile: job.profile, width: job.width, height: job.height, still })
    hooks.onEncode?.({ encoder: cpu.label, hardware: false, encoderId: cpu.id })
    const result = await renderWithEncoder(job, cpu, hooks, null)
    return { ...result, warning: joinWarning(result.warning, `${chosen.label} failed (${detail}). Used CPU encoding instead.`) }
  }
}

async function renderWithEncoder(
  job: NormalizedJob,
  encoder: ChosenEncoder,
  hooks: ScreensaverRenderHooks,
  inheritedWarning: string | null,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  const outputPath = path.join(outputsDir, `${job.id}.mp4`)
  const workDir = path.join(jobsDir, job.id)
  await mkdir(workDir, { recursive: true })
  let warning = inheritedWarning
  const expectAudio = wantsAudio(job)

  if (canStreamCopy(job)) {
    try {
      await encodeCopy(job, outputPath, hooks)
      const verified = await verifyReady(outputPath, job, expectAudio)
      return { ...verified, warning }
    } catch (error) {
      if (hooks.cancelled() || error instanceof RenderCancelled) throw error
      warning = joinWarning(warning, 'Stream copy was not safe for this file. The video was re-encoded.')
      await rm(outputPath, { force: true }).catch(() => undefined)
    }
  }

  if (job.mode === 'loop' && job.loopType === 'smooth' && job.mediaKind === 'video') {
    const fade = Math.min(job.crossfadeSeconds, job.sourceDuration / 2 - 0.05)
    if (fade >= 0.25 && job.sourceDuration >= 1) {
      try {
        const cyclePath = path.join(workDir, 'cycle.mp4')
        await encodeSmoothCycle(job, encoder, cyclePath, fade, hooks)
        const cycle = await probeSourceDetails(cyclePath)
        await encodeLoopCopy(cyclePath, outputPath, job, hooks, cycle.audioCodec != null)
        try {
          const verified = await verifyReady(outputPath, job, expectAudio)
          return { ...verified, warning }
        } catch (error) {
          if (hooks.cancelled() || error instanceof RenderCancelled) throw error
          warning = joinWarning(warning, 'The looped crossfade could not be copied. It was re-encoded for the full duration.')
          await rm(outputPath, { force: true }).catch(() => undefined)
          await encodeFromCycle(job, encoder, cyclePath, outputPath, hooks)
          const verified = await verifyReady(outputPath, job, expectAudio)
          return { ...verified, warning }
        }
      } catch (error) {
        if (hooks.cancelled() || error instanceof RenderCancelled) throw error
        if (error instanceof EncoderRejected) throw error
        warning = joinWarning(warning, 'Smooth loop was not possible for this clip. Used a hard loop instead.')
      }
    } else {
      warning = joinWarning(warning, 'Smooth loop was not possible for this clip. Used a hard loop instead.')
    }
  }

  await encodeFiltered(job, encoder, outputPath, workDir, hooks)
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('verifying', 'Validating output')
  const verified = await verifyVideoOutput(outputPath, job.width, job.height, job.duration, expectAudio)
  return { ...verified, warning }
}

async function encodeCopy(job: NormalizedJob, outputPath: string, hooks: ScreensaverRenderHooks): Promise<void> {
  hooks.onStatus('rendering', 'Encoding')
  const args = ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats', '-stream_loop', '-1', '-i', job.mediaPath]
  await attachAudio(args, job, true)
  args.push('-c:v', 'copy', '-t', n(job.duration + 0.05), '-movflags', '+faststart', outputPath)
  await spawnFfmpeg(args, job.duration, hooks)
}

async function encodeLoopCopy(
  cyclePath: string,
  outputPath: string,
  job: NormalizedJob,
  hooks: ScreensaverRenderHooks,
  _cycleHasAudio: boolean,
): Promise<void> {
  hooks.onStatus('rendering', 'Encoding')
  const args = ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats', '-stream_loop', '-1', '-i', cyclePath]
  await attachAudio(args, job, false)
  args.push('-c:v', 'copy', '-t', n(job.duration + 0.05), '-movflags', '+faststart', outputPath)
  await spawnFfmpeg(args, job.duration, hooks)
}

async function encodeFromCycle(
  job: NormalizedJob,
  encoder: ChosenEncoder,
  cyclePath: string,
  outputPath: string,
  hooks: ScreensaverRenderHooks,
): Promise<void> {
  hooks.onStatus('rendering', 'Encoding')
  const args = ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats', '-stream_loop', '-1', '-i', cyclePath]
  await attachAudio(args, job, false)
  args.push(...encoder.args, '-r', String(job.fps), '-t', n(job.duration + 0.05), '-movflags', '+faststart', outputPath)
  await spawnFfmpeg(args, job.duration, hooks)
}

async function encodeSmoothCycle(
  job: NormalizedJob,
  encoder: ChosenEncoder,
  cyclePath: string,
  fade: number,
  hooks: ScreensaverRenderHooks,
): Promise<void> {
  hooks.onStatus('rendering', 'Encoding')
  const offset = Math.max(0, job.sourceDuration - fade)
  const lines = [
    `[0:v]split=2[v1][v2]`,
    `[v1]trim=0:${n(offset)},setpts=PTS-STARTPTS[va]`,
    `[v2]trim=0:${n(fade)},setpts=PTS-STARTPTS[vb]`,
    `[va][vb]xfade=transition=fade:duration=${n(fade)}:offset=${n(Math.max(0, offset - fade))}[vx]`,
  ]
  if (job.composition && job.sourceWidth > 0 && job.sourceHeight > 0) {
    lines.push(
      ...compositionFilterLines({
        composition: job.composition,
        inputLabel: 'vx',
        outputLabel: 'vout',
        sourceWidth: job.sourceWidth,
        sourceHeight: job.sourceHeight,
        width: job.width,
        height: job.height,
        fps: job.fps,
        duration: job.sourceDuration,
        maskIndex: null,
        frameIndex: null,
      }),
    )
  } else {
    lines.push(`[vx]${legacyScaleFilter(job.width, job.height, job.fit, job.backgroundColor)},fps=${job.fps},trim=0:${n(job.sourceDuration)},setpts=PTS-STARTPTS[vout]`)
  }
  const filterPath = path.join(jobsDir, job.id, 'cycle.txt')
  await mkdir(path.dirname(filterPath), { recursive: true })
  await writeFile(filterPath, lines.join(';\n'))
  const args = [
    '-y',
    '-hide_banner',
    '-progress',
    'pipe:1',
    '-nostats',
    '-i',
    job.mediaPath,
    '-filter_complex_script',
    filterPath,
    '-map',
    '[vout]',
    '-an',
    ...encoder.args,
    '-r',
    String(job.fps),
    '-t',
    n(job.sourceDuration),
    '-movflags',
    '+faststart',
    cyclePath,
  ]
  await spawnFfmpeg(args, job.sourceDuration, hooks)
}

async function encodeFiltered(
  job: NormalizedJob,
  encoder: ChosenEncoder,
  outputPath: string,
  workDir: string,
  hooks: ScreensaverRenderHooks,
): Promise<void> {
  hooks.onStatus('rendering', 'Encoding')
  const lines: string[] = []
  const args = ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats']
  const precomposed = Boolean(job.compositionPath) && (job.mediaKind === 'image' || job.mode === 'static')
  if (precomposed && job.compositionPath) {
    args.push('-loop', '1', '-framerate', String(job.fps), '-i', job.compositionPath)
  } else if (job.mediaKind === 'image' || job.mode === 'static') {
    args.push('-loop', '1', '-framerate', '1', '-i', job.mediaPath)
    lines.push(`[0:v]${legacyScaleFilter(job.width, job.height, job.fit, job.backgroundColor)},fps=${job.fps},trim=0:${n(job.duration)},setpts=PTS-STARTPTS[vout]`)
  } else if (job.composition && job.sourceWidth > 0) {
    args.push('-stream_loop', '-1', '-i', job.mediaPath)
    let maskIndex: number | null = null
    let frameIndex: number | null = null
    if (job.maskPath) {
      args.push('-i', job.maskPath)
      maskIndex = 1
    }
    if (job.framePath) {
      args.push('-loop', '1', '-i', job.framePath)
      frameIndex = maskIndex == null ? 1 : 2
    }
    lines.push(
      ...compositionFilterLines({
        composition: job.composition,
        inputLabel: '0:v',
        outputLabel: 'vout',
        sourceWidth: job.sourceWidth,
        sourceHeight: job.sourceHeight,
        width: job.width,
        height: job.height,
        fps: job.fps,
        duration: job.duration,
        maskIndex,
        frameIndex,
      }),
    )
  } else {
    args.push('-stream_loop', '-1', '-i', job.mediaPath)
    lines.push(`[0:v]${legacyScaleFilter(job.width, job.height, job.fit, job.backgroundColor)},fps=${job.fps},trim=0:${n(job.duration)},setpts=PTS-STARTPTS[vout]`)
  }

  const musicIndex = args.filter((arg) => arg === '-i').length
  if (wantsAudio(job) && job.audioMode === 'upload' && job.musicPath) {
    if (job.loopAudio) args.push('-stream_loop', '-1')
    args.push('-i', job.musicPath)
    lines.push(
      audioFilterLine({
        inputLabel: `${musicIndex}:a`,
        volume: job.audioVolume,
        fadeIn: job.audioFadeIn,
        fadeOut: job.audioFadeOut,
        duration: job.duration,
        loopSamples: false,
      }),
    )
  } else if (wantsAudio(job) && job.audioMode === 'source') {
    lines.push(
      audioFilterLine({
        inputLabel: '0:a',
        volume: job.audioVolume,
        fadeIn: job.audioFadeIn,
        fadeOut: job.audioFadeOut,
        duration: job.duration,
        loopSamples: false,
      }),
    )
  }

  if (lines.length) {
    const filterPath = path.join(workDir, 'filter.txt')
    await writeFile(filterPath, lines.join(';\n'))
    args.push('-filter_complex_script', filterPath)
    args.push('-map', lines.some((line) => line.includes('[vout]')) ? '[vout]' : '0:v:0')
    if (lines.some((line) => line.includes('[aout]'))) args.push('-map', '[aout]')
  } else {
    args.push('-map', '0:v:0')
  }
  args.push(...encoder.args, '-r', String(job.fps), '-t', n(job.duration + 0.05))
  if (wantsAudio(job)) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
  else args.push('-an')
  args.push('-movflags', '+faststart', outputPath)
  await spawnFfmpeg(args, job.duration, hooks)
}

async function attachAudio(args: string[], job: NormalizedJob, videoHasAudio: boolean): Promise<void> {
  if (!wantsAudio(job)) {
    args.push('-map', '0:v:0', '-an')
    return
  }
  const plainSource = job.audioVolume > 0.98 && job.audioFadeIn < 0.05 && job.audioFadeOut < 0.05 && job.sourceAudioCodec === 'aac'
  if (job.audioMode === 'source' && videoHasAudio && plainSource) {
    args.push('-map', '0:v:0', '-map', '0:a:0', '-c:a', 'copy')
    return
  }
  let audioIndex = 0
  if (job.audioMode === 'upload' && job.musicPath) {
    if (job.loopAudio) args.push('-stream_loop', '-1')
    args.push('-i', job.musicPath)
    audioIndex = 1
  } else if (job.audioMode === 'source' && !videoHasAudio) {
    args.push('-stream_loop', '-1', '-i', job.mediaPath)
    audioIndex = 1
  }
  const filter = audioFilterLine({
    inputLabel: `${audioIndex}:a`,
    volume: job.audioVolume,
    fadeIn: job.audioFadeIn,
    fadeOut: job.audioFadeOut,
    duration: job.duration,
    loopSamples: false,
  })
  const filterPath = path.join(jobsDir, job.id, 'audio.txt')
  await mkdir(path.dirname(filterPath), { recursive: true })
  await writeFile(filterPath, filter)
  args.push('-filter_complex_script', filterPath, '-map', '0:v:0', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
}

async function verifyReady(
  outputPath: string,
  job: NormalizedJob,
  expectAudio: boolean,
): Promise<{ outputPath: string; bytes: number; duration: number }> {
  const details = await probeSourceDetails(outputPath)
  if (details.startTime < -0.2) throw new Error('The looped file had broken timestamps.')
  return verifyVideoOutput(outputPath, job.width, job.height, job.duration, expectAudio)
}

function wantsAudio(job: NormalizedJob): boolean {
  if (job.audioVolume <= 0.001) return false
  if (job.audioMode === 'upload') return Boolean(job.musicPath)
  if (job.audioMode === 'source') return job.sourceHasAudio && job.mediaKind === 'video'
  return false
}

type NormalizedJob = ScreensaverRenderRequest & { id: string; profile: ScreensaverProfile; encoder: EncoderChoice } & GraphJob

function normalize(raw: ScreensaverRenderRequest & { id: string }): NormalizedJob {
  return {
    ...raw,
    profile: raw.profile ?? 'balanced',
    encoder: raw.encoder ?? 'cpu',
    composition: raw.composition ?? null,
    compositionPath: raw.compositionPath ?? null,
    framePath: raw.framePath ?? null,
    maskPath: raw.maskPath ?? null,
    sourceWidth: raw.sourceWidth ?? 0,
    sourceHeight: raw.sourceHeight ?? 0,
    sourceCodec: raw.sourceCodec ?? null,
    sourcePixFmt: raw.sourcePixFmt ?? null,
    sourceAudioCodec: raw.sourceAudioCodec ?? null,
  }
}

function joinWarning(current: string | null, next: string): string {
  return current ? `${current} ${next}` : next
}
