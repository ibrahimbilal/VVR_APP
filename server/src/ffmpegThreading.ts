import os from 'node:os'

export function logicalCpus(): number {
  return os.cpus().length
}

function lowMemoryHost(): boolean {
  return os.totalmem() < 8 * 1024 ** 3
}

export function x264Threads(): number {
  const env = Number(process.env.VVR_X264_THREADS)
  if (Number.isFinite(env) && env >= 1) return Math.min(16, Math.floor(env))
  const cap = lowMemoryHost() ? 2 : 4
  return Math.max(1, Math.min(cap, logicalCpus()))
}

export function ffmpegGlobalThreads(): number {
  const env = Number(process.env.VVR_FFMPEG_THREADS)
  if (Number.isFinite(env) && env >= 1) return Math.min(16, Math.floor(env))
  const cap = lowMemoryHost() ? 4 : 8
  return Math.max(1, Math.min(cap, logicalCpus()))
}

export function ffmpegFilterThreads(): number {
  const env = Number(process.env.VVR_FFMPEG_FILTER_THREADS)
  if (Number.isFinite(env) && env >= 1) return Math.min(8, Math.floor(env))
  return Math.max(1, Math.min(4, Math.floor(logicalCpus() / 2)))
}

export function x264Params(threads: number): string {
  if (threads <= 1) return 'threads=1:lookahead_threads=1:sliced_threads=0'
  return `threads=${threads}:sliced_threads=1`
}

export function ompThreadLimit(): number {
  return ffmpegFilterThreads()
}
