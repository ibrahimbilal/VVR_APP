import { stat } from 'node:fs/promises'
import { execFileAsync, ffprobeBinary } from './binaries'

export interface Probe {
  duration: number
  width: number
  height: number
  hasAudio: boolean
  hasVideo: boolean
  codec: string | null
  size: number
}

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string
  tags?: { rotate?: string }
  disposition?: { attached_pic?: number }
  side_data_list?: { rotation?: number }[]
}

interface ProbeJson {
  streams?: ProbeStream[]
  format?: { duration?: string }
}

export async function probeMedia(file: string): Promise<Probe> {
  const data = await readProbe(file)
  const streams = data.streams ?? []
  const video = streams.find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1)
  const hasAudio = streams.some((stream) => stream.codec_type === 'audio')
  const duration = positiveNumber(video?.duration) || positiveNumber(data.format?.duration)
  const info = await stat(file)

  if (!video || !video.width || !video.height || !duration) {
    throw new Error('This file does not contain a readable video stream.')
  }

  const rotation = streamRotation(video)
  const swap = rotation === 90 || rotation === 270
  return {
    duration,
    width: swap ? video.height : video.width,
    height: swap ? video.width : video.height,
    hasAudio,
    hasVideo: true,
    codec: video.codec_name ?? null,
    size: info.size,
  }
}

export async function probeStill(file: string): Promise<{ width: number; height: number }> {
  const data = await readProbe(file)
  const video = (data.streams ?? []).find((stream) => stream.codec_type === 'video')
  if (!video?.width || !video.height) {
    throw new Error('A title overlay was unreadable. Try the export again.')
  }
  return { width: video.width, height: video.height }
}

export async function probeAudioFile(file: string): Promise<{ duration: number }> {
  const data = await readProbe(file)
  const audio = (data.streams ?? []).find((stream) => stream.codec_type === 'audio')
  const duration = positiveNumber(audio?.duration) || positiveNumber(data.format?.duration)
  if (!audio || !duration) throw new Error('The background music file does not contain readable audio.')
  return { duration }
}

async function readProbe(file: string): Promise<ProbeJson> {
  try {
    const result = await execFileAsync(
      ffprobeBinary(),
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
    )
    return JSON.parse(result.stdout) as ProbeJson
  } catch {
    throw new Error('This file could not be read. It may be corrupted or use an unsupported format.')
  }
}

function positiveNumber(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function streamRotation(stream: ProbeStream): number {
  const tag = Math.abs(Math.round(Number(stream.tags?.rotate ?? 0)))
  if (tag) return tag % 360
  const side = stream.side_data_list?.find((entry) => typeof entry.rotation === 'number')
  return Math.abs(Math.round(side?.rotation ?? 0)) % 360
}
