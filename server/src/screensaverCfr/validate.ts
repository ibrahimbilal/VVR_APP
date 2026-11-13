import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { ffprobeBinary } from '../binaries'

export interface StreamInfo {
  codec: string | null
  profile: string | null
  level: number | null
  pixFmt: string | null
  width: number | null
  height: number | null
  rate: string | null
  avgRate: string | null
  timeBase: string | null
  nbFrames: number | null
  duration: number | null
  formatDuration: number | null
  hasAudio: boolean
  audioDuration: number | null
}

export interface CfrValidationResult {
  ok: boolean
  reasons: string[]
  packetCount: number
  timeBase: string | null
  expectedTick: number | null
}

function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobeBinary(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.slice(-1500) || 'ffprobe failed'))
    })
  })
}

export async function probeCfrStream(file: string): Promise<StreamInfo> {
  const stdout = await runFfprobe([
    '-v',
    'error',
    '-show_streams',
    '-show_entries',
    'stream=codec_type,codec_name,profile,level,pix_fmt,width,height,avg_frame_rate,r_frame_rate,time_base,nb_frames,duration',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    file,
  ])
  const parsed = JSON.parse(stdout) as {
    streams?: Record<string, string | number | undefined>[]
    format?: { duration?: string }
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video') ?? {}
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
  const num = (value: string | number | undefined): number | null => {
    if (value == null || value === 'N/A') return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  const text = (value: string | number | undefined): string | null => (value == null || value === 'N/A' ? null : String(value))
  return {
    codec: text(video.codec_name),
    profile: text(video.profile),
    level: num(video.level),
    pixFmt: text(video.pix_fmt),
    width: num(video.width),
    height: num(video.height),
    rate: text(video.r_frame_rate),
    avgRate: text(video.avg_frame_rate),
    timeBase: text(video.time_base),
    nbFrames: num(video.nb_frames),
    duration: num(video.duration),
    formatDuration: num(parsed.format?.duration),
    hasAudio: Boolean(audio),
    audioDuration: audio ? num(audio.duration) : null,
  }
}

export function expectedTick(timeBase: string | null, fps: number): number | null {
  if (!timeBase) return null
  const [numText, denText] = timeBase.split('/')
  const num = Number(numText)
  const den = Number(denText)
  if (!num || !den) return null
  const tick = den / (num * fps)
  return Number.isInteger(tick) ? tick : null
}

/**
 * Stream packet CSV from ffprobe without buffering the full JSON document.
 * Validates PTS presentation grid (sorted) and monotonic DTS in decode order.
 */
export async function validateCfrPackets(
  file: string,
  options: {
    fps: number
    expectedFrames: number
    expectedDurationSec: number
    width: number
    height: number
    boundaryIndexes?: number[]
    expectAudio?: boolean
    onProgress?: (ratio: number) => void
  },
): Promise<CfrValidationResult> {
  const info = await probeCfrStream(file)
  const reasons: string[] = []
  if (info.codec !== 'h264') reasons.push(`Codec is ${info.codec ?? 'missing'}, expected h264.`)
  if (info.pixFmt !== 'yuv420p') reasons.push(`Pixel format is ${info.pixFmt ?? 'missing'}, expected yuv420p.`)
  if (info.width !== options.width || info.height !== options.height) {
    reasons.push(`Resolution is ${info.width}x${info.height}, expected ${options.width}x${options.height}.`)
  }
  if (info.rate !== `${options.fps}/1`) reasons.push(`Nominal rate is ${info.rate}, expected ${options.fps}/1.`)
  if (info.avgRate !== `${options.fps}/1`) reasons.push(`Average rate is ${info.avgRate}, expected ${options.fps}/1.`)
  const duration = info.formatDuration ?? info.duration
  const slack = Math.max(0.5 / options.fps, 0.05)
  if (duration == null || Math.abs(duration - options.expectedDurationSec) > slack) {
    reasons.push(`Duration is ${duration ?? 'missing'}, expected ${options.expectedDurationSec.toFixed(6)}.`)
  }
  if (options.expectAudio && !info.hasAudio) reasons.push('Audio track is missing.')
  if (options.expectAudio && info.audioDuration != null && Math.abs(info.audioDuration - options.expectedDurationSec) > 0.25) {
    reasons.push(`Audio duration is ${info.audioDuration}, expected ~${options.expectedDurationSec}.`)
  }

  const tick = expectedTick(info.timeBase, options.fps)
  if (tick == null) reasons.push(`Time base ${info.timeBase ?? 'missing'} cannot represent ${options.fps} fps as an integer tick.`)

  let packetCount = 0
  let prevDts: number | null = null
  let firstPts: number | null = null
  const ptsList: number[] = []
  const missingKeyframes: number[] = []
  const boundarySet = new Set(options.boundaryIndexes ?? [])

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffprobeBinary(),
      ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts,dts,duration,flags', '-of', 'csv=p=0', file],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000)
    })
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      if (!line.trim()) return
      const [ptsText, dtsText, durationText, flags] = line.split(',')
      const pts = Number(ptsText)
      const dts = Number(dtsText)
      const durationValue = durationText != null && durationText !== '' && durationText !== 'N/A' ? Number(durationText) : null
      const key = (flags ?? '').includes('K')
      if (!Number.isFinite(pts) || !Number.isFinite(dts)) {
        reasons.push(`Packet ${packetCount} has invalid timestamps.`)
        return
      }
      if (firstPts == null) firstPts = pts
      ptsList.push(pts)
      if (tick != null) {
        if (durationValue !== tick) reasons.push(`Packet ${packetCount} duration is ${durationValue}, expected ${tick}.`)
        if (prevDts != null && dts !== prevDts + tick) {
          reasons.push(`DTS step breaks at packet ${packetCount}: ${prevDts} -> ${dts}, expected +${tick}.`)
        }
      }
      if (boundarySet.has(packetCount) && !key) missingKeyframes.push(packetCount)
      prevDts = dts
      packetCount += 1
      if (options.onProgress && options.expectedFrames > 0 && packetCount % 600 === 0) {
        options.onProgress(Math.min(0.99, packetCount / options.expectedFrames))
      }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.slice(-1500) || 'ffprobe packet scan failed'))
    })
  })

  if (packetCount !== options.expectedFrames) {
    reasons.push(`Packet count is ${packetCount}, expected ${options.expectedFrames}.`)
  }
  if (info.nbFrames != null && info.nbFrames !== options.expectedFrames) {
    reasons.push(`Container nb_frames is ${info.nbFrames}, expected ${options.expectedFrames}.`)
  }
  if (tick != null && ptsList.length > 0) {
    ptsList.sort((a, b) => a - b)
    for (let index = 0; index < ptsList.length; index += 1) {
      if (ptsList[index] !== index * tick) {
        reasons.push(`PTS grid breaks at sorted index ${index}: ${ptsList[index]} instead of ${index * tick}.`)
        break
      }
    }
  }
  if (missingKeyframes.length) {
    reasons.push(`Segment starts without a keyframe at packet indexes ${missingKeyframes.join(', ')}.`)
  }

  // Deduplicate reasons while preserving order
  const unique: string[] = []
  for (const reason of reasons) {
    if (!unique.includes(reason)) unique.push(reason)
  }

  return {
    ok: unique.length === 0,
    reasons: unique,
    packetCount,
    timeBase: info.timeBase,
    expectedTick: tick,
  }
}
