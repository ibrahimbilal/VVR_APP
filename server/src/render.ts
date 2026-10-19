import { spawn } from 'node:child_process'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { frameMetrics } from '../../shared/frame'
import { resolveFade, sequenceDuration } from '../../shared/timeline'
import { ffmpegBinary } from './binaries'
import { probeMedia } from './probe'
import { jobsDir, outputsDir } from './storage'

export interface RenderClip {
  id: string
  path: string
  trimStart: number
  trimEnd: number
  hasAudio: boolean
}

export interface RenderRequest {
  clips: RenderClip[]
  overlays: string[]
  musicPath: string | null
  width: number
  height: number
  fps: number
  bannerHeight: number
  bannerColor: string
  scaleMode: 'crop' | 'fit' | 'blur'
  backgroundColor: string
  transition: 'cut' | 'fade'
  fadeDuration: number
  keepAudio: boolean
  normalize: boolean
  originalVolume: number
  musicVolume: number
}

export interface RenderHooks {
  cancelled: () => boolean
  onProgress: (progress: number, message?: string) => void
  onStatus: (status: 'preparing' | 'rendering' | 'verifying' | 'cancelled', message: string) => void
  registerKill: (kill: () => void) => void
}

export class RenderCancelled extends Error {
  constructor() {
    super('Render cancelled.')
    this.name = 'RenderCancelled'
  }
}

interface Attempt {
  fade: number
  normalize: boolean
  note: string | null
}

export async function renderProject(
  job: RenderRequest & { id: string },
  hooks: RenderHooks,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('preparing', 'Preparing the timeline.')

  const durations = job.clips.map((clip) => clip.trimEnd - clip.trimStart)
  const requestedFade = resolveFade(durations, job.transition, job.fadeDuration)
  const useClipAudio = job.keepAudio && job.originalVolume > 0.001 && job.clips.some((clip) => clip.hasAudio)
  const wantNormalize = useClipAudio && job.normalize
  const attempts = buildAttempts(requestedFade, wantNormalize)
  const metrics = frameMetrics(job.width, job.height, job.bannerHeight)
  const expected = sequenceDuration(durations, requestedFade)

  let warning: string | null = null
  let lastError = 'Rendering failed.'
  for (let index = 0; index < attempts.length; index++) {
    if (hooks.cancelled()) throw new RenderCancelled()
    const attempt = attempts[index]
    if (!attempt) continue
    const attemptExpected = sequenceDuration(durations, attempt.fade)
    try {
      if (index > 0) hooks.onProgress(0, attempt.note ?? 'Retrying the render.')
      await runFfmpeg(job, metrics, attempt, useClipAudio, attemptExpected, hooks)
      if (hooks.cancelled()) throw new RenderCancelled()
      hooks.onStatus('verifying', 'Checking the finished file.')
      const verified = await verifyOutput(
        path.join(outputsDir, `${job.id}.mp4`),
        metrics.width,
        metrics.height,
        attemptExpected,
        useClipAudio || job.musicPath != null,
      )
      return { ...verified, warning }
    } catch (error) {
      await rm(path.join(outputsDir, `${job.id}.mp4`), { force: true }).catch(() => undefined)
      if (error instanceof RenderCancelled) throw error
      lastError = error instanceof Error ? error.message : lastError
      const retry = index < attempts.length - 1 && isRetryable(lastError)
      if (!retry) break
    }
  }
  throw new Error(lastError)
}

function buildAttempts(fade: number, normalize: boolean): Attempt[] {
  const attempts: Attempt[] = [{ fade, normalize, note: null }]
  if (normalize) {
    attempts.push({
      fade,
      normalize: false,
      note: 'Audio normalization was skipped because it failed on this footage.',
    })
  }
  if (fade > 0) {
    attempts.push({
      fade: 0,
      normalize: false,
      note: 'Crossfade was skipped because it failed on this footage. The export uses hard cuts.',
    })
  }
  const seen = new Set<string>()
  return attempts.filter((attempt) => {
    const key = `${attempt.fade}:${attempt.normalize}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function runFfmpeg(
  job: RenderRequest & { id: string },
  metrics: { width: number; height: number; bannerHeight: number },
  attempt: Attempt,
  useClipAudio: boolean,
  expected: number,
  hooks: RenderHooks,
): Promise<void> {
  const workDir = path.join(jobsDir, job.id)
  await mkdir(workDir, { recursive: true })
  const graph = buildFilter(job, metrics, attempt, useClipAudio, expected)
  const scriptPath = path.join(workDir, 'filter.txt')
  await writeFile(scriptPath, graph.filter)
  const outputPath = path.join(outputsDir, `${job.id}.mp4`)

  const args: string[] = ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats']
  for (const clip of job.clips) args.push('-fflags', '+genpts', '-i', clip.path)
  for (const overlay of job.overlays) args.push('-i', overlay)
  if (job.musicPath) args.push('-stream_loop', '-1', '-i', job.musicPath)
  args.push('-filter_complex_script', scriptPath, '-map', `[${graph.videoLabel}]`)
  if (graph.audioLabel) args.push('-map', `[${graph.audioLabel}]`)
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(job.fps),
    '-max_muxing_queue_size',
    '1024',
  )
  if (graph.audioLabel) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
  args.push('-t', n(expected + 0.12), '-movflags', '+faststart', outputPath)

  hooks.onStatus('rendering', 'Rendering the MP4.')
  await spawnFfmpeg(args, expected, hooks)
}

function buildFilter(
  job: RenderRequest,
  metrics: { width: number; height: number; bannerHeight: number },
  attempt: Attempt,
  useClipAudio: boolean,
  expected: number,
): { filter: string; videoLabel: string; audioLabel: string | null } {
  const lines: string[] = []
  const { width, height, bannerHeight } = metrics
  const videoHeight = height - bannerHeight
  const fade = attempt.fade

  job.clips.forEach((clip, index) => {
    const kept = clip.trimEnd - clip.trimStart
    lines.push(
      `[${index}:v]trim=start=${n(clip.trimStart)}:end=${n(clip.trimEnd)},setpts=PTS-STARTPTS,fps=${job.fps},settb=AVTB,setsar=1[base${index}]`,
    )
    if (job.scaleMode === 'crop') {
      lines.push(
        `[base${index}]scale=${width}:${videoHeight}:force_original_aspect_ratio=increase:force_divisible_by=2:flags=bicubic,crop=${width}:${videoHeight},setsar=1[fitted${index}]`,
      )
    } else if (job.scaleMode === 'fit') {
      lines.push(
        `[base${index}]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:${ffColor(job.backgroundColor)},setsar=1[fitted${index}]`,
      )
    } else {
      lines.push(`[base${index}]split[bg${index}][fg${index}]`)
      lines.push(
        `[bg${index}]scale=${width}:${videoHeight}:force_original_aspect_ratio=increase:force_divisible_by=2:flags=bicubic,crop=${width}:${videoHeight},gblur=sigma=24[bgs${index}]`,
      )
      lines.push(
        `[fg${index}]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic[fgs${index}]`,
      )
      lines.push(
        `[bgs${index}][fgs${index}]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:format=auto[fitted${index}]`,
      )
    }
    const overlayIndex = job.clips.length + index
    lines.push(
      `[fitted${index}]pad=${width}:${height}:0:${bannerHeight}:${ffColor(job.bannerColor)},format=yuv420p[framed${index}]`,
    )
    lines.push(
      `[framed${index}][${overlayIndex}:v]overlay=0:0:format=auto,format=yuv420p,fps=${job.fps},settb=AVTB,setsar=1[v${index}]`,
    )

    if (useClipAudio) {
      if (clip.hasAudio) {
        const loudness = attempt.normalize ? ',loudnorm=I=-16:TP=-1.5:LRA=11' : ''
        lines.push(
          `[${index}:a]atrim=start=${n(clip.trimStart)}:end=${n(clip.trimEnd)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(job.originalVolume)}${loudness}[a${index}]`,
        )
      } else {
        lines.push(
          `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=start=0:end=${n(kept)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`,
        )
      }
    }
  })

  let videoLabel = 'vcat'
  if (fade > 0) {
    let cursor = job.clips[0] ? job.clips[0].trimEnd - job.clips[0].trimStart : 0
    let previous = '[v0]'
    for (let index = 1; index < job.clips.length; index++) {
      const label = index === job.clips.length - 1 ? 'vfade' : `vx${index}`
      const offset = cursor - fade
      lines.push(`${previous}[v${index}]xfade=transition=fade:duration=${n(fade)}:offset=${n(offset)}[${label}]`)
      cursor += job.clips[index]!.trimEnd - job.clips[index]!.trimStart - fade
      previous = `[${label}]`
    }
    videoLabel = 'vfade'
  } else if (useClipAudio) {
    const pairs = job.clips.map((_, index) => `[v${index}][a${index}]`).join('')
    lines.push(`${pairs}concat=n=${job.clips.length}:v=1:a=1[vcat][acat]`)
  } else {
    const videos = job.clips.map((_, index) => `[v${index}]`).join('')
    lines.push(`${videos}concat=n=${job.clips.length}:v=1:a=0[vcat]`)
  }

  let audioLabel: string | null = null
  if (useClipAudio && fade > 0) {
    let previous = '[a0]'
    for (let index = 1; index < job.clips.length; index++) {
      const label = index === job.clips.length - 1 ? 'afade' : `ax${index}`
      lines.push(`${previous}[a${index}]acrossfade=d=${n(fade)}:c1=tri:c2=tri[${label}]`)
      previous = `[${label}]`
    }
    audioLabel = 'afade'
  } else if (useClipAudio) {
    audioLabel = 'acat'
  }

  if (job.musicPath) {
    const musicIndex = job.clips.length + job.overlays.length
    const fadeOut = expected > 0.8 ? `,afade=t=in:st=0:d=0.25,afade=t=out:st=${n(Math.max(0, expected - 0.35))}:d=0.3` : ''
    lines.push(
      `[${musicIndex}:a]atrim=start=0:end=${n(expected)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(job.musicVolume)}${fadeOut}[bgm]`,
    )
    if (audioLabel) {
      lines.push(`[${audioLabel}][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`)
      audioLabel = 'aout'
    } else {
      audioLabel = 'bgm'
    }
  }

  return { filter: lines.join(';\n'), videoLabel, audioLabel }
}

function spawnFfmpeg(args: string[], expected: number, hooks: RenderHooks): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    hooks.registerKill(() => {
      child.kill()
    })
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      for (const line of text.split(/\r?\n/)) {
        const stamp = /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
        if (!stamp) continue
        const seconds = Number(stamp[1]) * 3600 + Number(stamp[2]) * 60 + Number(stamp[3])
        hooks.onProgress(Math.max(0, Math.min(0.99, seconds / Math.max(expected, 0.1))))
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000)
    })
    child.on('error', (error) => {
      fail(new Error(error.message.includes('ENOENT') ? 'FFmpeg binary is missing. Reinstall dependencies with npm install.' : error.message))
    })
    child.on('close', (code) => {
      if (hooks.cancelled()) {
        fail(new RenderCancelled())
        return
      }
      if (code === 0) {
        if (!settled) {
          settled = true
          resolve()
        }
        return
      }
      fail(new Error(friendlyFfmpegError(stderr)))
    })
  })
}

async function verifyOutput(
  file: string,
  width: number,
  height: number,
  expected: number,
  expectAudio: boolean,
): Promise<{ outputPath: string; bytes: number; duration: number }> {
  const probed = await probeMedia(file)
  const info = await stat(file)
  if (!probed.hasVideo || probed.width !== width || probed.height !== height) {
    throw new Error('The export did not match the 9:16 frame. It was discarded.')
  }
  if (probed.codec !== 'h264') {
    throw new Error('The export was not encoded as H.264. It was discarded.')
  }
  if (info.size < 2048 || probed.duration < Math.max(0.4, expected - 0.75)) {
    throw new Error('The export looked incomplete, so it was discarded.')
  }
  if (probed.duration > expected + 1.5) {
    throw new Error('The export was longer than the timeline, so it was discarded.')
  }
  if (expectAudio && !probed.hasAudio) {
    throw new Error('The export is missing its audio track. It was discarded.')
  }
  return { outputPath: file, bytes: info.size, duration: probed.duration }
}

function friendlyFfmpegError(stderr: string): string {
  if (/No space left on device/i.test(stderr)) return 'Not enough disk space to render the video.'
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const useful = lines.filter((line) => /error|invalid|failed|no such|mismatch|found/i.test(line))
  const detail = useful.at(-1) || lines.at(-1)
  return detail ? `Rendering failed. ${detail}` : 'Rendering failed.'
}

function isRetryable(message: string): boolean {
  return /loudnorm|xfade|acrossfade|aformat|channel_layout|mismatch|filter|Invalid argument|Error reinitializing|conversion failed|incomplete|longer than the timeline|did not match/i.test(
    message,
  )
}

function ffColor(hex: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  return match ? `0x${match[1]}` : '0x000000'
}

function n(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3)
}
