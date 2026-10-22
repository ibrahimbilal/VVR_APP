import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { EncoderChoice, ScreensaverProfile } from '../../shared/screensaver'
import { profileQualityTier } from '../../shared/screensaver'
import { execFileAsync, ffmpegBinary } from './binaries'
import { tmpDir } from './storage'

export type EncoderId = 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'h264_videotoolbox' | 'h264_mf'

export interface EncoderInfo {
  id: EncoderId
  label: string
  hardware: boolean
  listed: boolean
  verified: boolean
  detail: string | null
}

interface CacheFile {
  version: string
  checks: Record<string, { ok: boolean; detail: string | null }>
  benches: Record<string, { winner: EncoderId; speeds: Partial<Record<EncoderId, number>> }>
}

const CANDIDATES: { id: EncoderId; label: string; hardware: boolean }[] = [
  { id: 'libx264', label: 'CPU (libx264)', hardware: false },
  { id: 'h264_nvenc', label: 'NVIDIA NVENC', hardware: true },
  { id: 'h264_qsv', label: 'Intel Quick Sync', hardware: true },
  { id: 'h264_amf', label: 'AMD AMF', hardware: true },
  { id: 'h264_videotoolbox', label: 'Apple VideoToolbox', hardware: true },
  { id: 'h264_mf', label: 'Windows Media Foundation', hardware: true },
]

export class EncoderRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncoderRejected'
  }
}

export function encoderLabel(id: EncoderId): string {
  return CANDIDATES.find((item) => item.id === id)?.label ?? id
}

export function encoderIsHardware(id: EncoderId): boolean {
  return CANDIDATES.find((item) => item.id === id)?.hardware ?? false
}

export function x264Threads(): number {
  const env = Number(process.env.VVR_X264_THREADS)
  if (Number.isFinite(env) && env >= 1) return Math.min(16, Math.floor(env))
  return Math.max(1, Math.min(4, os.cpus().length))
}

/**
 * Quality stays in the CRF 20 band except for the High profile (CRF 16).
 * Hardware flags are the closest quality mode each encoder accepts:
 * NVENC VBR CQ, QSV ICQ global_quality, AMF CQP, VideoToolbox quality, Media Foundation quality.
 */
export function encoderArgs(id: EncoderId, tier: 'standard' | 'high', still: boolean): string[] {
  if (id === 'libx264') {
    const args = [
      '-c:v',
      'libx264',
      '-preset',
      tier === 'high' ? 'medium' : 'veryfast',
      '-crf',
      tier === 'high' ? '16' : '20',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      String(x264Threads()),
    ]
    if (still) args.push('-tune', 'stillimage')
    return args
  }
  if (id === 'h264_nvenc') {
    return ['-c:v', 'h264_nvenc', '-preset', tier === 'high' ? 'p6' : 'p4', '-rc', 'vbr', '-cq', tier === 'high' ? '16' : '20', '-b:v', '0', '-pix_fmt', 'yuv420p']
  }
  if (id === 'h264_qsv') {
    return ['-c:v', 'h264_qsv', '-preset', tier === 'high' ? 'medium' : 'veryfast', '-global_quality', tier === 'high' ? '16' : '20', '-pix_fmt', 'yuv420p']
  }
  if (id === 'h264_amf') {
    const qp = tier === 'high' ? '16' : '20'
    return ['-c:v', 'h264_amf', '-rc', 'cqp', '-qp_i', qp, '-qp_p', qp, '-quality', tier === 'high' ? 'quality' : 'balanced', '-pix_fmt', 'yuv420p']
  }
  if (id === 'h264_videotoolbox') {
    return ['-c:v', 'h264_videotoolbox', '-q:v', tier === 'high' ? '80' : '65', '-pix_fmt', 'yuv420p']
  }
  return ['-c:v', 'h264_mf', '-rate_control', 'quality', '-quality', tier === 'high' ? '90' : '75', '-pix_fmt', 'yuv420p']
}

export async function encoderCatalog(): Promise<{ version: string; encoders: EncoderInfo[]; autoStill: string | null; autoMotion: string | null }> {
  const cache = await loadCache()
  const listed = await listedEncoders()
  const encoders: EncoderInfo[] = []
  for (const candidate of CANDIDATES) {
    const isListed = listed.has(candidate.id)
    if (!isListed) {
      encoders.push({ ...candidate, listed: false, verified: false, detail: 'Not included in this FFmpeg build.' })
      continue
    }
    const check = await verifyEncoder(candidate.id, 640, 360, cache)
    encoders.push({ ...candidate, listed: true, verified: check.ok, detail: check.ok ? null : check.detail })
  }
  await saveCache(cache)
  const still = cache.benches[benchKey(1920, 1080, true, 'standard')]?.winner
  const motion = cache.benches[benchKey(1920, 1080, false, 'standard')]?.winner
  return {
    version: cache.version,
    encoders,
    autoStill: still ? encoderLabel(still) : null,
    autoMotion: motion ? encoderLabel(motion) : null,
  }
}

export async function selectEncoder(input: {
  choice: EncoderChoice
  profile: ScreensaverProfile
  width: number
  height: number
  still: boolean
}): Promise<{ id: EncoderId; label: string; hardware: boolean; args: string[] }> {
  const tier = profileQualityTier(input.profile)
  const still = input.still
  if (input.choice === 'cpu') {
    return { id: 'libx264', label: encoderLabel('libx264'), hardware: false, args: encoderArgs('libx264', tier, still) }
  }
  if (input.choice !== 'auto') {
    const id = input.choice
    const check = await verifyEncoder(id, input.width, input.height, await loadCache())
    if (!check.ok) {
      throw new EncoderRejected(
        `${encoderLabel(id)} could not encode ${input.width}×${input.height} (${check.detail ?? 'encoder failed to start'}). CPU encoding was not used because this encoder was selected.`,
      )
    }
    return { id, label: encoderLabel(id), hardware: encoderIsHardware(id), args: encoderArgs(id, tier, still) }
  }
  const winner = await benchWinner(input.width, input.height, still, tier)
  return { id: winner, label: encoderLabel(winner), hardware: encoderIsHardware(winner), args: encoderArgs(winner, tier, still) }
}

async function benchWinner(width: number, height: number, still: boolean, tier: 'standard' | 'high'): Promise<EncoderId> {
  const cache = await loadCache()
  const key = benchKey(width, height, still, tier)
  const cached = cache.benches[key]
  if (cached?.winner) return cached.winner
  const listed = await listedEncoders()
  const speeds: Partial<Record<EncoderId, number>> = {}
  for (const candidate of CANDIDATES) {
    if (!listed.has(candidate.id)) continue
    const check = await verifyEncoder(candidate.id, width, height, cache)
    if (!check.ok) continue
    const result = await runProgressEncode(benchArgs(candidate.id, width, height, still, tier), 120_000)
    if (result.ok && result.speed != null && result.speed > 0) speeds[candidate.id] = result.speed
    else if (result.ok) speeds[candidate.id] = 0.01
  }
  if (speeds.libx264 == null) speeds.libx264 = 0.01
  let winner: EncoderId = 'libx264'
  const cpu = speeds.libx264 ?? 0
  for (const candidate of CANDIDATES) {
    if (!candidate.hardware) continue
    const speed = speeds[candidate.id]
    if (speed != null && speed > cpu * 1.08 && speed > (speeds[winner] ?? 0)) winner = candidate.id
  }
  cache.benches[key] = { winner, speeds }
  await saveCache(cache)
  return winner
}

function benchArgs(id: EncoderId, width: number, height: number, still: boolean, tier: 'standard' | 'high'): string[] {
  const source = still ? `color=c=black:s=${width}x${height}:r=30:d=3` : `testsrc=size=${width}x${height}:rate=30:duration=3`
  return ['-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-f', 'lavfi', '-i', source, ...encoderArgs(id, tier, still), '-t', '3', '-f', 'null', '-']
}

async function verifyEncoder(id: EncoderId, width: number, height: number, cache: CacheFile): Promise<{ ok: boolean; detail: string | null }> {
  const key = `${id}@${width}x${height}`
  const hit = cache.checks[key]
  if (hit) return hit
  const listed = await listedEncoders()
  if (!listed.has(id)) {
    const miss = { ok: false, detail: 'Not included in this FFmpeg build.' }
    cache.checks[key] = miss
    return miss
  }
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${width}x${height}:r=10:d=0.3`,
    ...encoderArgs(id, 'standard', false),
    '-frames:v',
    '2',
    '-f',
    'null',
    '-',
  ]
  const result = await runProgressEncode(args, 60_000)
  const entry = { ok: result.ok, detail: result.ok ? null : result.error || 'Encoder failed to start.' }
  cache.checks[key] = entry
  await saveCache(cache)
  return entry
}

function runProgressEncode(args: string[], timeoutMs: number): Promise<{ ok: boolean; speed: number | null; error: string }> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegBinary(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let speed: number | null = null
    let settled = false
    const finish = (value: { ok: boolean; speed: number | null; error: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, speed, error: 'Encoder test timed out.' })
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const match = /^speed=\s*([\d.]+)x/.exec(line)
        if (match) speed = Number(match[1])
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2500)
    })
    child.on('error', (error) => finish({ ok: false, speed: null, error: error.message }))
    child.on('close', (code) => {
      if (code === 0) finish({ ok: true, speed, error: '' })
      else finish({ ok: false, speed: null, error: usefulError(stderr) })
    })
  })
}

function usefulError(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const dll = lines.find((line) => /dll|nvcuda|amfrt/i.test(line))
  if (dll) return dll
  const specific = [...lines].reverse().find((line) => /failed to open|not supported|unknown error|operation not permitted|no device|negotiation failed/i.test(line))
  return specific || lines.at(-1) || 'Encoder failed to start.'
}

let listedCache: Set<EncoderId> | null = null

async function listedEncoders(): Promise<Set<EncoderId>> {
  if (listedCache) return listedCache
  const result = await execFileAsync(ffmpegBinary(), ['-hide_banner', '-encoders'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
  const found = new Set<EncoderId>()
  for (const candidate of CANDIDATES) {
    if (new RegExp(`\\b${candidate.id}\\b`).test(result.stdout)) found.add(candidate.id)
  }
  listedCache = found
  return found
}

function benchKey(width: number, height: number, still: boolean, tier: 'standard' | 'high'): string {
  return `${width}x${height}:${still ? 'still' : 'motion'}:${tier}`
}

let cachePromise: Promise<CacheFile> | null = null

async function loadCache(): Promise<CacheFile> {
  if (!cachePromise) cachePromise = readCache()
  return cachePromise
}

async function readCache(): Promise<CacheFile> {
  const version = await ffmpegVersion()
  try {
    const raw = await readFile(cachePath(), 'utf8')
    const parsed = JSON.parse(raw) as CacheFile
    if (parsed.version === version && parsed.checks && parsed.benches) return parsed
  } catch {
    // A missing or stale cache is rebuilt.
  }
  return { version, checks: {}, benches: {} }
}

async function saveCache(cache: CacheFile): Promise<void> {
  await mkdir(tmpDir, { recursive: true })
  await writeFile(cachePath(), JSON.stringify(cache))
}

function cachePath(): string {
  return path.join(tmpDir, 'encoder-cache.json')
}

async function ffmpegVersion(): Promise<string> {
  const result = await execFileAsync(ffmpegBinary(), ['-version'], { windowsHide: true })
  return result.stdout.split(/\r?\n/)[0] ?? 'unknown'
}
