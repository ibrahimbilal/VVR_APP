import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ffprobeBinary } from './binaries'

const execFileAsync = promisify(execFile)

export interface FrameTimestamp {
  ptsTime: number
  duration: number | null
}

export async function readVideoFrameTimestamps(file: string, limit = 5000): Promise<FrameTimestamp[]> {
  const probe = await execFileAsync(ffprobeBinary(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_frames',
    '-show_entries',
    'frame=pkt_pts_time,best_effort_timestamp_time,pkt_duration_time',
    '-of',
    'json',
    file,
  ])
  const data = JSON.parse(probe.stdout) as {
    frames?: { pkt_pts_time?: string; best_effort_timestamp_time?: string; pkt_duration_time?: string }[]
  }
  const frames = (data.frames ?? []).slice(0, limit)
  return frames.map((frame) => {
    const raw = frame.pkt_pts_time ?? frame.best_effort_timestamp_time ?? '0'
    const durationRaw = frame.pkt_duration_time
    return {
      ptsTime: Number(raw),
      duration: durationRaw != null && durationRaw !== 'N/A' ? Number(durationRaw) : null,
    }
  })
}

export function assertMonotonicTimestamps(frames: FrameTimestamp[]): void {
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index]!.ptsTime + 0.0001 < frames[index - 1]!.ptsTime) {
      throw new Error(`Non-monotonic frame timestamp at index ${index}.`)
    }
  }
}

export function countFramesInRange(frames: FrameTimestamp[], startSec: number, endSec: number): number {
  return frames.filter((frame) => frame.ptsTime >= startSec - 0.05 && frame.ptsTime < endSec - 0.05).length
}

export function averageFrameInterval(frames: FrameTimestamp[], startSec: number, endSec: number): number | null {
  const slice = frames.filter((frame) => frame.ptsTime >= startSec && frame.ptsTime < endSec)
  if (slice.length < 2) return null
  let total = 0
  for (let index = 1; index < slice.length; index += 1) {
    total += slice[index]!.ptsTime - slice[index - 1]!.ptsTime
  }
  return total / (slice.length - 1)
}
