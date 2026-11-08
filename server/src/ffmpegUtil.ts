import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import type { AudioLooperFormat } from '../../shared/audioLooper'
import { ffmpegBinary } from './binaries'
import { ompThreadLimit } from './ffmpegThreading'
import { killProcessTree } from './nativeProcess'
import { probeAudioDetails, probeMedia } from './probe'

export class RenderCancelled extends Error {
  constructor() {
    super('Render cancelled.')
    this.name = 'RenderCancelled'
  }
}

export interface FfmpegStats {
  time: number
  fps: number | null
  speed: number | null
}

export interface FfmpegHooks {
  cancelled: () => boolean
  onProgress: (progress: number, message?: string) => void
  onStats?: (stats: FfmpegStats) => void
  onSpawn?: (pid: number) => void
  registerKill: (kill: () => void) => void
}

export function spawnFfmpeg(args: string[], expected: number, hooks: FfmpegHooks): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OMP_NUM_THREADS: String(ompThreadLimit()) },
    })
    let stderr = ''
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    hooks.registerKill(() => {
      killProcessTree(child)
    })
    if (child.pid) hooks.onSpawn?.(child.pid)
    let fps: number | null = null
    let speed: number | null = null
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      for (const line of text.split(/\r?\n/)) {
        const fpsMatch = /^fps=([\d.]+)/.exec(line)
        if (fpsMatch) fps = Number(fpsMatch[1])
        const speedMatch = /^speed=\s*([\d.]+)x/.exec(line)
        if (speedMatch) speed = Number(speedMatch[1])
        const seconds = parseProgressSeconds(line)
        if (seconds == null) continue
        hooks.onProgress(Math.max(0, Math.min(0.99, seconds / Math.max(expected, 0.1))))
        hooks.onStats?.({ time: seconds, fps, speed })
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
      console.error(`ffmpeg render failed:\n${stderr.slice(-4000)}`)
      fail(new Error(friendlyFfmpegError(stderr)))
    })
  })
}

export async function verifyVideoOutput(
  file: string,
  width: number,
  height: number,
  expected: number,
  expectAudio: boolean,
  frameMismatchMessage = 'The export did not match the requested frame size. It was discarded.',
): Promise<{ outputPath: string; bytes: number; duration: number }> {
  const probed = await probeMedia(file)
  const info = await stat(file)
  if (!probed.hasVideo || probed.width !== width || probed.height !== height) {
    throw new Error(frameMismatchMessage)
  }
  if (probed.codec !== 'h264') {
    throw new Error('The export was not encoded as H.264. It was discarded.')
  }
  const minDuration = Math.max(0.4, expected - Math.max(2, expected * 0.01))
  if (info.size < 2048 || probed.duration < minDuration) {
    throw new Error('The export looked incomplete, so it was discarded.')
  }
  if (probed.duration > expected + Math.max(2, expected * 0.01)) {
    throw new Error('The export was longer than requested, so it was discarded.')
  }
  if (expectAudio && !probed.hasAudio) {
    throw new Error('The export is missing its audio track. It was discarded.')
  }
  return { outputPath: file, bytes: info.size, duration: probed.duration }
}

/** Slack is max(0.25s, 1% of target), capped at 1.5s so long 24h jobs stay close to `-t`. */
export const AUDIO_DURATION_TOLERANCE_FLOOR = 0.25
export const AUDIO_DURATION_TOLERANCE_CAP = 1.5
export const AUDIO_DURATION_TOLERANCE_RATIO = 0.01

export function audioDurationSlack(expected: number): number {
  return Math.max(AUDIO_DURATION_TOLERANCE_FLOOR, Math.min(AUDIO_DURATION_TOLERANCE_CAP, expected * AUDIO_DURATION_TOLERANCE_RATIO))
}

export async function verifyAudioOutput(
  file: string,
  expected: number,
  format: AudioLooperFormat,
): Promise<{ outputPath: string; bytes: number; duration: number }> {
  const probed = await probeAudioDetails(file)
  const info = await stat(file)
  if (!probed.codec || probed.duration <= 0) {
    throw new Error('The export is missing its audio stream. It was discarded.')
  }
  const expectedCodec = format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : 'pcm_s16le'
  if (probed.codec !== expectedCodec) {
    throw new Error(`The export was not encoded as ${format.toUpperCase()}. It was discarded.`)
  }
  if (info.size < 256) {
    throw new Error('The export looked incomplete, so it was discarded.')
  }
  const slack = audioDurationSlack(expected)
  if (probed.duration < expected - slack) {
    throw new Error('The export looked incomplete, so it was discarded.')
  }
  if (probed.duration > expected + slack) {
    throw new Error('The export was longer than requested, so it was discarded.')
  }
  return { outputPath: file, bytes: info.size, duration: probed.duration }
}

/** Parse one FFmpeg `-progress` line. Prefers out_time_us, then out_time_ms, then out_time. */
export function parseProgressSeconds(line: string): number | null {
  const us = /^out_time_us=(-?\d+|N\/A)/.exec(line)
  if (us) {
    if (us[1] === 'N/A') return null
    const seconds = Number(us[1]) / 1_000_000
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  }
  const ms = /^out_time_ms=(-?\d+|N\/A)/.exec(line)
  if (ms) {
    if (ms[1] === 'N/A') return null
    const seconds = Number(ms[1]) / 1_000
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  }
  const stamp = /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!stamp) return null
  const seconds = Number(stamp[1]) * 3600 + Number(stamp[2]) * 60 + Number(stamp[3])
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

export function friendlyFfmpegError(stderr: string): string {
  if (/No space left on device|Disk quota exceeded/i.test(stderr)) return 'Not enough disk space to render the video.'
  const generic = /^(conversion failed!|error marking filters as finished|failed to inject frame into filter network:?)$/i
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !generic.test(line))
  const useful = lines.filter((line) => /error|invalid|failed|no such|mismatch|unrecognized|unavailable|denied|found/i.test(line))
  const detail = useful.at(-1) || lines.at(-1)
  return detail ? `Rendering failed. ${detail}` : 'Rendering failed.'
}

export function n(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3)
}

export function ffColor(hex: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  return match ? `0x${match[1]}` : '0x000000'
}
