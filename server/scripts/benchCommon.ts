import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import { ffmpegBinary, ffprobeBinary, execFileAsync } from '../src/binaries'

const execFileNode = promisify(execFile)

export function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function cpuPercent(samples: { cpu: number; rss: number; at: number }[]): number | 'not measured' {
  if (samples.length < 2) return 'not measured'
  const first = samples[0]!
  const last = samples[samples.length - 1]!
  const cpuDelta = last.cpu - first.cpu
  const wallDelta = (last.at - first.at) / 1000
  if (wallDelta <= 0 || !Number.isFinite(cpuDelta)) return 'not measured'
  return round((cpuDelta / wallDelta) * 100)
}

export function memoryMb(samples: { rss: number }[]): number | 'not measured' {
  if (samples.length === 0) return 'not measured'
  const peak = Math.max(...samples.map((sample) => sample.rss))
  if (!Number.isFinite(peak) || peak <= 0) return 'not measured'
  return round(peak / (1024 * 1024))
}

export function sampleProcess(pid: number): Promise<{ cpu: number; rss: number } | null> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress`,
        ],
        { windowsHide: true, timeout: 2000 },
        (error, stdout) => {
          if (error || !stdout.trim()) {
            resolve(null)
            return
          }
          try {
            const data = JSON.parse(stdout) as { CPU?: number; WorkingSet64?: number }
            if (typeof data.CPU !== 'number' || typeof data.WorkingSet64 !== 'number') {
              resolve(null)
              return
            }
            resolve({ cpu: data.CPU, rss: data.WorkingSet64 })
          } catch {
            resolve(null)
          }
        },
      )
    })
  }
  return readProcStat(pid)
}

async function readProcStat(pid: number): Promise<{ cpu: number; rss: number } | null> {
  try {
    const raw = await execFileNode('cat', [`/proc/${pid}/stat`], { encoding: 'utf8', timeout: 2000 })
    const line = String(raw).trim()
    const close = line.lastIndexOf(')')
    if (close < 0) return null
    const rest = line.slice(close + 2).split(' ')
    const utime = Number(rest[11])
    const stime = Number(rest[12])
    const rssPages = Number(rest[21])
    if (!Number.isFinite(utime) || !Number.isFinite(rssPages)) return null
    return { cpu: (utime + stime) / 100, rss: rssPages * 4096 }
  } catch {
    return null
  }
}

export async function probeOutput(file: string): Promise<{
  width: number
  height: number
  codec: string | null
  duration: number
  videoBitrate: number | null
  audioCodec: string | null
}> {
  const probe = await execFileAsync(ffprobeBinary(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])
  const data = JSON.parse(probe.stdout) as {
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; bit_rate?: string }[]
    format?: { duration?: string; bit_rate?: string }
  }
  const video = data.streams?.find((stream) => stream.codec_type === 'video')
  const audio = data.streams?.find((stream) => stream.codec_type === 'audio')
  const vbr = video?.bit_rate ?? data.format?.bit_rate
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    codec: video?.codec_name ?? null,
    duration: Number(data.format?.duration ?? 0),
    videoBitrate: vbr ? Number(vbr) : null,
    audioCodec: audio?.codec_name ?? null,
  }
}

export async function systemInfo(): Promise<Record<string, string | number>> {
  const version = await execFileAsync(ffmpegBinary(), ['-version'], { windowsHide: true })
  return {
    os: `${process.platform} ${os.release()}`,
    cpus: os.cpus().length,
    memoryGb: round(os.totalmem() / (1024 ** 3)),
    ffmpeg: (version.stdout.split(/\r?\n/)[0] ?? 'unknown').trim(),
    node: process.version,
  }
}
