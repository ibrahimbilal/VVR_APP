import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import type { EncoderChoice } from '../../shared/screensaver'
import { ffmpegMotionFilterChain, type ImageMotionSegment } from '../../shared/imageMotion'
import { joinFadeAfter, timelineDuration, xfadeJoins } from '../../shared/imageMotionTimeline'
import { selectEncoder, type EncoderId } from './encoders'
import {
  ffmpegFilterThreads,
  ffmpegGlobalThreads,
  x264Params,
  x264Threads,
} from './ffmpegThreading'
import { RenderCancelled, n, spawnFfmpeg, verifyVideoOutput, type FfmpegStats } from './ffmpegUtil'
import { jobsDir, outputsDir } from './storage'

export interface ImageMotionRenderSegment {
  id: string
  path: string
  width: number
  height: number
  motion: ImageMotionSegment['motion']
  transitionAfter: ImageMotionSegment['transitionAfter']
}

export interface ImageMotionRenderRequest {
  segments: ImageMotionRenderSegment[]
  width: number
  height: number
  fps: number
  musicPath: string | null
  musicVolume: number
  musicFadeIn: number
  musicFadeOut: number
  musicOffset: number
  loopMusic: boolean
  encoder?: EncoderChoice
}

export interface ImageMotionRenderHooks {
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

function pseudoSegments(job: ImageMotionRenderRequest): ImageMotionSegment[] {
  return job.segments.map((s) => ({
    id: s.id,
    fileName: '',
    width: s.width,
    height: s.height,
    serverId: null,
    duration: s.motion.duration,
    motion: s.motion,
    transitionAfter: s.transitionAfter,
  }))
}

export async function renderImageMotion(
  job: ImageMotionRenderRequest & { id: string },
  hooks: ImageMotionRenderHooks,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('preparing', 'Preparing image motion timeline.')
  const encoderChoice = job.encoder ?? 'auto'
  const expected = timelineDuration(pseudoSegments(job))
  let encoder = await selectEncoder({
    choice: encoderChoice,
    width: job.width,
    height: job.height,
    still: false,
    workload: 'ranking_motion',
    tier: 'standard',
  })
  hooks.onEncode?.({ encoder: encoder.label, hardware: encoder.hardware, encoderId: encoder.id })
  try {
    return await runEncode(job, encoder, hooks, expected, null)
  } catch (error) {
    if (encoderChoice !== 'auto' || encoder.id === 'libx264' || hooks.cancelled() || error instanceof RenderCancelled) {
      throw error
    }
    const detail = error instanceof Error ? error.message : 'The hardware encoder failed.'
    const failedLabel = encoder.label
    encoder = await selectEncoder({
      choice: 'cpu',
      width: job.width,
      height: job.height,
      still: false,
      workload: 'ranking_motion',
      tier: 'standard',
    })
    hooks.onEncode?.({ encoder: encoder.label, hardware: false, encoderId: encoder.id })
    return runEncode(job, encoder, hooks, expected, `${failedLabel} failed (${detail}). Used CPU encoding instead.`)
  }
}

async function runEncode(
  job: ImageMotionRenderRequest & { id: string },
  encoder: ChosenEncoder,
  hooks: ImageMotionRenderHooks,
  expected: number,
  warning: string | null,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  const workDir = path.join(jobsDir, job.id)
  await mkdir(workDir, { recursive: true })
  const outputPath = path.join(outputsDir, `${job.id}.mp4`)
  const graph = buildFilter(job, expected)
  const filterPath = path.join(workDir, 'filter.txt')
  await writeFile(filterPath, graph.filter)

  const args: string[] = [
    '-y',
    '-hide_banner',
    '-threads',
    String(ffmpegGlobalThreads()),
    '-filter_threads',
    String(ffmpegFilterThreads()),
    '-filter_complex_threads',
    String(ffmpegFilterThreads()),
    '-progress',
    'pipe:1',
    '-nostats',
  ]

  const pseudo = pseudoSegments(job)
  job.segments.forEach((segment, index) => {
    const hold = joinFadeAfter(pseudo, index)
    args.push('-loop', '1', '-framerate', String(job.fps), '-t', n(segment.motion.duration + hold), '-i', segment.path)
  })
  if (job.musicPath) args.push('-stream_loop', '-1', '-i', job.musicPath)

  args.push('-filter_complex_script', filterPath, '-map', `[${graph.videoLabel}]`)
  if (graph.audioLabel) args.push('-map', `[${graph.audioLabel}]`)
  args.push(...encoderVideoArgs(encoder))
  args.push('-pix_fmt', 'yuv420p', '-r', String(job.fps), '-max_muxing_queue_size', '1024')
  if (graph.audioLabel) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
  args.push('-t', n(expected + 0.12), '-movflags', '+faststart', outputPath)

  hooks.onStatus('rendering', 'Rendering the MP4.')
  try {
    await spawnFfmpeg(args, expected, hooks)
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined)
    throw error
  }
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('verifying', 'Checking the finished file.')
  const verified = await verifyVideoOutput(
    outputPath,
    job.width,
    job.height,
    expected,
    Boolean(graph.audioLabel),
    'The export did not match the 9:16 frame. It was discarded.',
  )
  return { ...verified, warning }
}

function buildFilter(job: ImageMotionRenderRequest, expected: number): { filter: string; videoLabel: string; audioLabel: string | null } {
  const lines: string[] = []
  const pseudo = pseudoSegments(job)

  job.segments.forEach((segment, index) => {
    const chain = ffmpegMotionFilterChain(`${index}:v`, segment.width, segment.height, job.width, job.height, segment.motion, job.fps)
    lines.push(chain.replace('[v]', `[v${index}]`))
  })

  let videoLabel = 'v0'
  if (job.segments.length > 1) {
    const joins = xfadeJoins(pseudo)
    let previous = '[v0]'
    let joinCursor = 0
    for (let index = 0; index < job.segments.length - 1; index++) {
      const next = `[v${index + 1}]`
      const label = index === job.segments.length - 2 ? 'vout' : `vm${index}`
      const fade = joins[joinCursor]
      if (fade && fade.fromInput === index) {
        lines.push(`${previous}${next}xfade=transition=fade:duration=${n(fade.fade)}:offset=${n(fade.offset)}[${label}]`)
        joinCursor += 1
      } else {
        lines.push(`${previous}${next}concat=n=2:v=1:a=0[${label}]`)
      }
      previous = `[${label}]`
    }
    videoLabel = 'vout'
  }

  let audioLabel: string | null = null
  const hasMusic = job.musicPath != null && job.musicVolume > 0.001
  if (hasMusic) {
    const musicIndex = job.segments.length
    const fadeIn = Math.max(0, Math.min(30, job.musicFadeIn))
    const fadeOut = Math.max(0, Math.min(30, job.musicFadeOut))
    let audio = `[${musicIndex}:a]atrim=start=${n(job.musicOffset)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(job.musicVolume)}`
    if (fadeIn > 0.001) audio += `,afade=t=in:st=0:d=${n(fadeIn)}`
    if (fadeOut > 0.001 && expected > fadeOut) {
      audio += `,afade=t=out:st=${n(Math.max(0, expected - fadeOut))}:d=${n(fadeOut)}`
    }
    audio += `,atrim=0:${n(expected)}[amout]`
    lines.push(audio)
    audioLabel = 'amout'
  }

  return { filter: lines.join(';\n'), videoLabel, audioLabel }
}

function encoderVideoArgs(encoder: ChosenEncoder): string[] {
  if (encoder.id === 'libx264') {
    const threads = x264Threads()
    return [
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-threads',
      String(threads),
      '-x264-params',
      x264Params(threads),
    ]
  }
  return encoder.args.filter((arg) => arg !== '-pix_fmt' && arg !== 'yuv420p')
}
