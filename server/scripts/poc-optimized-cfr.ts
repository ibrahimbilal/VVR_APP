/**
 * Standalone Optimized CFR proof of concept.
 *
 * Does not replace the Screensaver VFR renderer. It builds a 60-second
 * 3840x2160 test film, compares VFR / full CFR / segment-reuse CFR, and
 * writes docs/optimized-cfr-poc-report.md.
 *
 * Stream copy is required for the optimized concat. This script never
 * re-encodes that concat to hide a broken timeline.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { encoderArgs } from '../src/encoders'
import { ompThreadLimit } from '../src/ffmpegThreading'
import { tmpDir } from '../src/storage'
import sharp from 'sharp'

const FPS = 60
const WIDTH = 3840
const HEIGHT = 2160
const ANIM_SECONDS = 7
const SEGMENT_SECONDS = 10
const REMAINDER_SECONDS = 3
const STATIC_REPEATS = 5
const MICRO_REPEATS = 2
const GOP_SECONDS = 2
const ROOT = path.join(tmpDir, 'cfr-poc')
const DOCS_REPORT = path.join(tmpDir, '..', '..', 'docs', 'optimized-cfr-poc-report.md')

interface Timeline {
  fps: number
  width: number
  height: number
  animSeconds: number
  segmentSeconds: number
  repeats: number
  remainderSeconds: number
}

interface TimelineCounts {
  animFrames: number
  segmentFrames: number
  remainderFrames: number
  outputFrames: number
  durationSeconds: number
  segmentStarts: number[]
}

interface Packet {
  pts: number
  dts: number
  duration: number | null
  key: boolean
}

interface StreamInfo {
  codec: string | null
  profile: string | null
  level: number | null
  pixFmt: string | null
  width: number | null
  height: number | null
  rate: string | null
  avgRate: string | null
  timeBase: string | null
  sar: string | null
  colorSpace: string | null
  colorTransfer: string | null
  colorPrimaries: string | null
  colorRange: string | null
  refs: number | null
  hasBFrames: number | null
  nbFrames: number | null
  duration: number | null
  formatDuration: number | null
}

interface CfrCheck {
  ok: boolean
  reasons: string[]
  packetCount: number
  timeBase: string | null
  expectedTick: number | null
  firstPts: number | null
  lastPts: number | null
  boundaryKeyframesMissing: number[]
  nonMonotonous: string[]
}

interface RunStats {
  wallSeconds: number
  peakWorkingSet: number | null
  stderr: string
  stdout: string
}

interface MethodResult {
  id: string
  label: string
  wallSeconds: number
  framesEncoded: number
  outputBytes: number
  peakWorkingSet: number | null
  tempDiskBytes: number
  uniqueEncodedBytes: number
  outputPath: string
  stream: StreamInfo
  check: CfrCheck
  notes: string[]
}

interface Strategy {
  container: 'mp4' | 'mpegts'
  bFrames: number
  label: string
}

const commandNotes: string[] = []

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function counts(timeline: Timeline): TimelineCounts {
  const animFrames = Math.round(timeline.animSeconds * timeline.fps)
  const segmentFrames = Math.round(timeline.segmentSeconds * timeline.fps)
  const remainderFrames = Math.round(timeline.remainderSeconds * timeline.fps)
  const outputFrames = animFrames + segmentFrames * timeline.repeats + remainderFrames
  const starts = [0, animFrames]
  for (let index = 1; index < timeline.repeats; index += 1) starts.push(animFrames + segmentFrames * index)
  starts.push(animFrames + segmentFrames * timeline.repeats)
  return {
    animFrames,
    segmentFrames,
    remainderFrames,
    outputFrames,
    durationSeconds: outputFrames / timeline.fps,
    segmentStarts: starts,
  }
}

function fullTimeline(): Timeline {
  return {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    animSeconds: ANIM_SECONDS,
    segmentSeconds: SEGMENT_SECONDS,
    repeats: STATIC_REPEATS,
    remainderSeconds: REMAINDER_SECONDS,
  }
}

function microTimeline(): Timeline {
  return {
    fps: FPS,
    width: 320,
    height: 180,
    animSeconds: ANIM_SECONDS,
    segmentSeconds: SEGMENT_SECONDS,
    repeats: MICRO_REPEATS,
    remainderSeconds: REMAINDER_SECONDS,
  }
}

async function directoryBytes(directory: string): Promise<number> {
  let total = 0
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) total += await directoryBytes(target)
    else total += (await stat(target)).size
  }
  return total
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function watchWorkingSet(pid: number): ChildProcess {
  const script = `
$peak = 0
try {
  while ($true) {
    $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $proc) { break }
    if ($proc.WorkingSet64 -gt $peak) { $peak = $proc.WorkingSet64 }
    Start-Sleep -Milliseconds 200
  }
} catch {}
Write-Output $peak
`
  return spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
}

function runFfmpeg(args: string[], label: string): Promise<RunStats> {
  const started = performance.now()
  log(`${label}: ffmpeg ${args.slice(0, 8).join(' ')} …`)
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OMP_NUM_THREADS: String(ompThreadLimit()) },
    })
    let stderr = ''
    let stdout = ''
    let lastLog = 0
    const watcher = child.pid ? watchWorkingSet(child.pid) : null
    let watcherText = ''
    watcher?.stdout?.on('data', (chunk: Buffer) => {
      watcherText += chunk.toString()
    })
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout = (stdout + text).slice(-200000)
      const now = performance.now()
      if (now - lastLog < 5000) return
      const time = /out_time=(\S+)/.exec(text)
      if (!time) return
      lastLog = now
      log(`${label}: ${time[1]}`)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 2_000_000) stderr = stderr.slice(-2_000_000)
    })
    child.on('error', (error) => {
      watcher?.kill()
      reject(error)
    })
    child.on('close', (code) => {
      const finish = (peak: number | null) => {
        const stats: RunStats = { wallSeconds: (performance.now() - started) / 1000, peakWorkingSet: peak, stderr, stdout }
        if (code === 0) resolve(stats)
        else reject(new Error(`${label} failed.\n${stderr.slice(-2500)}`))
      }
      if (!watcher) {
        finish(null)
        return
      }
      const timer = setTimeout(() => watcher.kill(), 5000)
      watcher.on('close', () => {
        clearTimeout(timer)
        const peak = Number(watcherText.trim())
        finish(Number.isFinite(peak) && peak > 0 ? peak : null)
      })
    })
  })
}

async function ffprobe(args: string[]): Promise<string> {
  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
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
      if (code === 0) resolve({ stdout })
      else reject(new Error(stderr.slice(-1500) || 'ffprobe failed'))
    })
  })
  return stdout
}

async function probeStream(file: string): Promise<StreamInfo> {
  const stdout = await ffprobe(['-v', 'error', '-show_streams', '-show_entries', 'stream=codec_name,profile,level,pix_fmt,width,height,avg_frame_rate,r_frame_rate,time_base,sample_aspect_ratio,color_space,color_transfer,color_primaries,color_range,refs,has_b_frames,nb_frames,duration', '-show_entries', 'format=duration', '-select_streams', 'v:0', '-of', 'json', file])
  const parsed = JSON.parse(stdout) as {
    streams?: Record<string, string | number | undefined>[]
    format?: { duration?: string }
  }
  const stream = parsed.streams?.[0] ?? {}
  const num = (value: string | number | undefined): number | null => {
    if (value == null || value === 'N/A') return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  const text = (value: string | number | undefined): string | null => (value == null || value === 'N/A' ? null : String(value))
  return {
    codec: text(stream.codec_name),
    profile: text(stream.profile),
    level: num(stream.level),
    pixFmt: text(stream.pix_fmt),
    width: num(stream.width),
    height: num(stream.height),
    rate: text(stream.r_frame_rate),
    avgRate: text(stream.avg_frame_rate),
    timeBase: text(stream.time_base),
    sar: text(stream.sample_aspect_ratio),
    colorSpace: text(stream.color_space),
    colorTransfer: text(stream.color_transfer),
    colorPrimaries: text(stream.color_primaries),
    colorRange: text(stream.color_range),
    refs: num(stream.refs),
    hasBFrames: num(stream.has_b_frames),
    nbFrames: num(stream.nb_frames),
    duration: num(stream.duration),
    formatDuration: num(parsed.format?.duration),
  }
}

async function readPackets(file: string): Promise<Packet[]> {
  const stdout = await ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts,dts,duration,flags', '-of', 'csv=p=0', file])
  const packets: Packet[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [pts, dts, duration, flags] = line.split(',')
    packets.push({
      pts: Number(pts),
      dts: Number(dts),
      duration: duration != null && duration !== '' && duration !== 'N/A' ? Number(duration) : null,
      key: (flags ?? '').includes('K'),
    })
  }
  return packets
}

function nonMonotonousLines(stderr: string): string[] {
  return stderr
    .split(/\r?\n/)
    .filter((line) => /non-monotonous|backward in time|invalid dropping|Timestamps are unset/i.test(line))
    .slice(0, 8)
}

function expectedTick(timeBase: string | null, fps: number): number | null {
  if (!timeBase) return null
  const [numText, denText] = timeBase.split('/')
  const num = Number(numText)
  const den = Number(denText)
  if (!num || !den) return null
  const tick = den / (num * fps)
  return Number.isInteger(tick) ? tick : null
}

function checkCfr(packets: Packet[], info: StreamInfo, timeline: Timeline, stderr: string, boundaryKeyframes = true): CfrCheck {
  const plan = counts(timeline)
  const reasons: string[] = []
  const tick = expectedTick(info.timeBase, timeline.fps)
  const warnings = nonMonotonousLines(stderr)
  if (warnings.length) reasons.push(`FFmpeg reported timestamp warnings (${warnings.length}).`)
  if (info.codec !== 'h264') reasons.push(`Codec is ${info.codec ?? 'missing'}, expected h264.`)
  if (info.pixFmt !== 'yuv420p') reasons.push(`Pixel format is ${info.pixFmt ?? 'missing'}, expected yuv420p.`)
  if (info.width !== timeline.width || info.height !== timeline.height) reasons.push(`Resolution is ${info.width}x${info.height}.`)
  if (info.rate !== `${timeline.fps}/1`) reasons.push(`Nominal rate is ${info.rate}, expected ${timeline.fps}/1.`)
  if (info.avgRate !== `${timeline.fps}/1`) reasons.push(`Average rate is ${info.avgRate}, expected ${timeline.fps}/1.`)
  if (packets.length !== plan.outputFrames) reasons.push(`Packet count is ${packets.length}, expected ${plan.outputFrames}.`)
  if (info.nbFrames != null && info.nbFrames !== plan.outputFrames) reasons.push(`Container nb_frames is ${info.nbFrames}, expected ${plan.outputFrames}.`)
  const duration = info.formatDuration
  if (duration == null || Math.abs(duration - plan.durationSeconds) > 0.5 / timeline.fps) {
    reasons.push(`Duration is ${duration ?? 'missing'}, expected ${plan.durationSeconds.toFixed(3)}.`)
  }
  if (tick == null) reasons.push(`Time base ${info.timeBase ?? 'missing'} cannot represent ${timeline.fps} fps as an integer tick.`)
  if (tick != null && packets.length > 0) {
    const sorted = packets.map((packet) => packet.pts).sort((a, b) => a - b)
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== index * tick) {
        reasons.push(`PTS grid breaks at sorted index ${index}: ${sorted[index]} instead of ${index * tick}.`)
        break
      }
    }
    for (let index = 1; index < packets.length; index += 1) {
      if (packets[index]!.dts !== packets[index - 1]!.dts + tick) {
        reasons.push(`DTS step breaks at packet ${index}: ${packets[index - 1]!.dts} -> ${packets[index]!.dts}, expected +${tick}.`)
        break
      }
    }
    const badDuration = packets.findIndex((packet) => packet.duration !== tick)
    if (badDuration >= 0) reasons.push(`Packet ${badDuration} duration is ${packets[badDuration]?.duration}, expected ${tick}.`)
  }
  const missing = boundaryKeyframes ? plan.segmentStarts.filter((index) => packets[index] && !packets[index]!.key) : []
  if (missing.length) reasons.push(`Segment starts without a keyframe at packet indexes ${missing.join(', ')}.`)
  return {
    ok: reasons.length === 0,
    reasons,
    packetCount: packets.length,
    timeBase: info.timeBase,
    expectedTick: tick,
    firstPts: packets[0]?.pts ?? null,
    lastPts: packets.at(-1)?.pts ?? null,
    boundaryKeyframesMissing: missing,
    nonMonotonous: warnings,
  }
}

function identityMismatch(segments: { name: string; info: StreamInfo }[]): string | null {
  const fields: (keyof StreamInfo)[] = ['codec', 'profile', 'level', 'pixFmt', 'width', 'height', 'sar', 'rate', 'timeBase', 'colorSpace', 'colorTransfer', 'colorPrimaries', 'colorRange', 'refs', 'hasBFrames']
  const first = segments[0]
  if (!first) return 'No segments.'
  for (const segment of segments.slice(1)) {
    for (const field of fields) {
      if (segment.info[field] !== first.info[field]) {
        return `${segment.name} ${field} is ${String(segment.info[field])} and ${first.name} is ${String(first.info[field])}.`
      }
    }
  }
  return null
}

function cfrEncoderArgs(still: boolean, fps: number, bFrames: number): string[] {
  const gop = fps * GOP_SECONDS
  const args = encoderArgs('libx264', 'standard', still)
  const paramsAt = args.indexOf('-x264-params')
  const extra = `open-gop=0:repeat-headers=1:keyint=${gop}:min-keyint=${gop}:scenecut=0:bframes=${bFrames}:ref=3:force-cfr=1`
  if (paramsAt >= 0) args[paramsAt + 1] = `${args[paramsAt + 1]}:${extra}`
  args.push('-profile:v', 'high', '-level:v', '5.2', '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', String(bFrames), '-flags', '+cgop', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv')
  return args
}

function animationFilter(pad: number): string {
  const y = `if(lt(t\\,0.6)\\,H-(t/0.6)*(h+${pad})\\,if(lt(t\\,6.2)\\,H-h-${pad}\\,H-h-${pad}+((t-6.2)/0.7)*(h+${pad}+20)))`
  return [`[0:v]setsar=1[bg]`, `[1:v]format=rgba[btn]`, `[bg][btn]overlay=x=(W-w)/2:y=${y}:eval=frame:enable=lt(t\\,6.9):format=auto`].join(';')
}

async function writeArtwork(file: string, width: number, height: number): Promise<void> {
  await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=1:duration=1`, '-frames:v', '1', file], `artwork ${width}x${height}`)
}

async function writeButton(file: string, width: number, height: number): Promise<void> {
  const font = Math.max(12, Math.round(height * 0.42))
  const radius = Math.max(4, Math.round(height * 0.2))
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#e11d48"/><text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="Arial" font-size="${font}" font-weight="700">SUBSCRIBE</text></svg>`
  await sharp(Buffer.from(svg)).png().toFile(file)
}

async function encodeSegment(options: {
  label: string
  artwork: string
  button: string | null
  frames: number
  fps: number
  width: number
  height: number
  still: boolean
  output: string
  strategy: Strategy
  legacyVfr: boolean
}): Promise<RunStats> {
  const pad = Math.max(8, Math.round(options.height * 0.055))
  const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1', '-nostats']
  if (options.button) {
    args.push('-loop', '1', '-framerate', String(options.fps), '-i', options.artwork, '-loop', '1', '-framerate', String(options.fps), '-i', options.button, '-filter_complex', animationFilter(pad))
  } else {
    args.push('-loop', '1', '-framerate', String(options.legacyVfr ? 1 : options.fps), '-i', options.artwork, '-vf', options.legacyVfr ? 'fps=1,setsar=1' : `fps=${options.fps},setsar=1`)
  }
  args.push('-an', '-frames:v', String(options.frames))
  if (options.legacyVfr) {
    args.push(...encoderArgs('libx264', 'standard', options.still), '-r', options.button ? String(options.fps) : '1', '-movflags', '+faststart')
  } else {
    args.push(...cfrEncoderArgs(options.still, options.fps, options.strategy.bFrames), '-fps_mode', 'cfr', '-r', String(options.fps))
    if (options.strategy.container === 'mp4') args.push('-video_track_timescale', String(options.fps * 1000), '-movflags', '+faststart')
    else args.push('-muxdelay', '0', '-muxpreload', '0', '-f', 'mpegts')
  }
  args.push(options.output)
  commandNotes.push(`${options.label}: ${args.join(' ')}`)
  return runFfmpeg(args, options.label)
}

function assertCopy(args: string[]): void {
  if (!args.includes('copy')) throw new Error('Concat command is not stream copy.')
  if (args.some((arg) => arg.includes('libx264') || arg.startsWith('h264_'))) throw new Error('Concat command would re-encode.')
}

async function concatCopy(listFile: string, output: string, fps: number, label: string): Promise<RunStats> {
  const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1', '-nostats', '-f', 'concat', '-safe', '0', '-i', listFile, '-map', '0:v:0', '-c:v', 'copy', '-video_track_timescale', String(fps * 1000), '-movflags', '+faststart', output]
  assertCopy(args)
  commandNotes.push(`${label}: ${args.join(' ')}`)
  return runFfmpeg(args, label)
}

async function writeConcatList(file: string, names: string[]): Promise<void> {
  const lines = ['ffconcat version 1.0', ...names.map((name) => `file '${name}'`)]
  await writeFile(file, `${lines.join('\n')}\n`)
}

async function encodeOptimized(timeline: Timeline, strategy: Strategy, directory: string, artwork: string, button: string): Promise<{
  stats: RunStats[]
  video: string
  concatStderr: string
  uniqueEncodedBytes: number
  framesEncoded: number
  tempDiskBytes: number
}> {
  await mkdir(directory, { recursive: true })
  const plan = counts(timeline)
  const ext = strategy.container === 'mp4' ? 'mp4' : 'ts'
  const anim = `anim.${ext}`
  const segment = `static-${timeline.segmentSeconds}s.${ext}`
  const remainder = `static-${timeline.remainderSeconds}s.${ext}`
  const shared = { artwork, button, fps: timeline.fps, width: timeline.width, height: timeline.height, strategy, legacyVfr: false }
  const stats = [
    await encodeSegment({ ...shared, label: 'animation', button, frames: plan.animFrames, still: false, output: path.join(directory, anim) }),
    await encodeSegment({ ...shared, label: 'static segment', button: null, frames: plan.segmentFrames, still: true, output: path.join(directory, segment) }),
    await encodeSegment({ ...shared, label: 'static remainder', button: null, frames: plan.remainderFrames, still: true, output: path.join(directory, remainder) }),
  ]
  for (const [name, frames] of [
    [anim, plan.animFrames],
    [segment, plan.segmentFrames],
    [remainder, plan.remainderFrames],
  ] as const) {
    const info = await probeStream(path.join(directory, name))
    const packets = await readPackets(path.join(directory, name))
    assertSegmentGrid(name, packets, info, frames, timeline.fps)
  }
  const identities = await Promise.all([anim, segment, remainder].map(async (name) => ({ name, info: await probeStream(path.join(directory, name)) })))
  const mismatch = identityMismatch(identities)
  if (mismatch) throw new Error(`Segments are not stream-copy compatible: ${mismatch}`)
  const names = [anim, ...Array.from({ length: timeline.repeats }, () => segment), remainder]
  const list = path.join(directory, 'segments.ffconcat')
  await writeConcatList(list, names)
  const listText = await readFile(list, 'utf8')
  const copies = listText.split('\n').filter((line) => line.includes(segment)).length
  if (copies !== timeline.repeats) throw new Error(`Concat list repeats ${segment} ${copies} times.`)
  const physical = (await readdir(directory)).filter((name) => name === segment)
  if (physical.length !== 1) throw new Error(`Expected one physical ${segment}, found ${physical.length}.`)
  const video = path.join(directory, 'video.mp4')
  const concatenated = await concatCopy(list, video, timeline.fps, 'concat copy')
  const uniqueEncodedBytes = (await stat(path.join(directory, anim))).size + (await stat(path.join(directory, segment))).size + (await stat(path.join(directory, remainder))).size
  return {
    stats: [...stats, concatenated],
    video,
    concatStderr: concatenated.stderr,
    uniqueEncodedBytes,
    framesEncoded: plan.animFrames + plan.segmentFrames + plan.remainderFrames,
    tempDiskBytes: await directoryBytes(directory),
  }
}

async function investigateStrategy(): Promise<{ strategy: Strategy; notes: string[] }> {
  const notes: string[] = []
  const attempts: Strategy[] = [
    { container: 'mp4', bFrames: 2, label: 'MP4 segments, 2 B-frames' },
    { container: 'mp4', bFrames: 0, label: 'MP4 segments, no B-frames' },
    { container: 'mpegts', bFrames: 2, label: 'MPEG-TS segments, 2 B-frames' },
    { container: 'mpegts', bFrames: 0, label: 'MPEG-TS segments, no B-frames' },
  ]
  const timeline = microTimeline()
  for (const strategy of attempts) {
    const directory = path.join(ROOT, 'micro', `${strategy.container}-bf${strategy.bFrames}`)
    await rm(directory, { recursive: true, force: true })
    await mkdir(directory, { recursive: true })
    log(`Micro-test ${strategy.label}`)
    try {
      const artwork = path.join(directory, 'artwork.png')
      const button = path.join(directory, 'button.png')
      await writeArtwork(artwork, timeline.width, timeline.height)
      await writeButton(button, 120, 28)
      const encoded = await encodeOptimized(timeline, strategy, directory, artwork, button)
      const info = await probeStream(encoded.video)
      const packets = await readPackets(encoded.video)
      const check = checkCfr(packets, info, timeline, encoded.concatStderr)
      if (!check.ok) {
        notes.push(`${strategy.label}: rejected. ${check.reasons.join(' ')}`)
        continue
      }
      const muxed = path.join(directory, 'muxed.mp4')
      await muxSilence(encoded.video, muxed, counts(timeline).durationSeconds)
      const muxInfo = await probeStream(muxed)
      const muxPackets = await readPackets(muxed)
      const muxCheck = checkCfr(muxPackets, muxInfo, timeline, '')
      if (!muxCheck.ok) {
        notes.push(`${strategy.label}: video concat passed, audio mux broke CFR. ${muxCheck.reasons.join(' ')}`)
        continue
      }
      if (checksum(packets) !== checksum(muxPackets)) {
        notes.push(`${strategy.label}: audio mux changed video timestamps.`)
        continue
      }
      notes.push(`${strategy.label}: passed ${counts(timeline).outputFrames} frames at ${info.timeBase}, tick ${check.expectedTick}.`)
      await rm(path.join(ROOT, 'micro'), { recursive: true, force: true })
      return { strategy, notes }
    } catch (error) {
      notes.push(`${strategy.label}: failed. ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
    }
  }
  throw new Error(`No stream-copy strategy produced CFR.\n${notes.join('\n')}`)
}

function assertSegmentGrid(name: string, packets: Packet[], info: StreamInfo, frames: number, fps: number): void {
  const tick = expectedTick(info.timeBase, fps)
  if (tick == null) throw new Error(`${name} time base ${info.timeBase ?? 'missing'} is not an integer ${fps} fps grid.`)
  if (packets.length !== frames) throw new Error(`${name} has ${packets.length} packets, expected ${frames}.`)
  if (info.nbFrames != null && info.nbFrames !== frames) throw new Error(`${name} nb_frames is ${info.nbFrames}, expected ${frames}.`)
  const sorted = packets.map((packet) => packet.pts).sort((a, b) => a - b)
  const broken = sorted.findIndex((pts, index) => pts !== index * tick)
  if (broken >= 0) throw new Error(`${name} PTS breaks at ${broken}: ${sorted[broken]} instead of ${broken * tick}.`)
  if (!packets[0]?.key) throw new Error(`${name} does not start with a keyframe.`)
}

function checksum(packets: Packet[]): string {
  return createHash('sha256').update(packets.map((packet) => `${packet.pts}:${packet.dts}:${packet.duration}`).join(',')).digest('hex')
}

async function muxSilence(video: string, output: string, duration: number): Promise<RunStats> {
  const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', video, '-f', 'lavfi', '-t', duration.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-video_track_timescale', String(FPS * 1000), '-movflags', '+faststart', output]
  assertCopy(args)
  commandNotes.push(`audio mux: ${args.join(' ')}`)
  return runFfmpeg(args, 'audio mux')
}

async function renderVfr(directory: string, artwork: string, button: string): Promise<MethodResult> {
  await mkdir(directory, { recursive: true })
  const anim = path.join(directory, 'anim.mp4')
  const tail = path.join(directory, 'tail.mp4')
  const animFrames = ANIM_SECONDS * FPS
  const tailFrames = 53
  const started = performance.now()
  const runs = [
    await encodeSegment({ label: 'vfr animation', artwork, button, frames: animFrames, fps: FPS, width: WIDTH, height: HEIGHT, still: false, output: anim, strategy: { container: 'mp4', bFrames: 2, label: 'vfr' }, legacyVfr: true }),
    await encodeSegment({ label: 'vfr static', artwork, button: null, frames: tailFrames, fps: 1, width: WIDTH, height: HEIGHT, still: true, output: tail, strategy: { container: 'mp4', bFrames: 2, label: 'vfr' }, legacyVfr: true }),
  ]
  const list = path.join(directory, 'segments.txt')
  await writeFile(list, `file '${anim.replaceAll('\\', '/')}'\nfile '${tail.replaceAll('\\', '/')}'\n`)
  const output = path.join(directory, 'vfr.mp4')
  let note = 'Concat copy matches renderScreensaverHybrid (+genpts, no video re-encode).'
  const copyArgs = ['-y', '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1', '-nostats', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-fflags', '+genpts', '-movflags', '+faststart', output]
  let copy = await runFfmpeg(copyArgs, 'vfr concat copy').catch(async (error: unknown) => {
    note = `Segment concat copy failed (${error instanceof Error ? error.message.split('\n')[0] : 'error'}); re-encoded with fps_mode vfr, matching the existing fallback.`
    const fallback = ['-y', '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1', '-nostats', '-f', 'concat', '-safe', '0', '-i', list, ...encoderArgs('libx264', 'standard', false), '-fps_mode', 'vfr', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]
    return runFfmpeg(fallback, 'vfr concat re-encode')
  })
  runs.push(copy)
  const stream = await probeStream(output)
  const packets = await readPackets(output)
  const check = checkCfr(packets, stream, fullTimeline(), copy.stderr, false)
  return {
    id: 'vfr',
    label: 'Existing VFR',
    wallSeconds: (performance.now() - started) / 1000,
    framesEncoded: animFrames + tailFrames,
    outputBytes: (await stat(output)).size,
    peakWorkingSet: maxPeak(runs),
    tempDiskBytes: await directoryBytes(directory),
    uniqueEncodedBytes: (await stat(anim)).size + (await stat(tail)).size,
    outputPath: output,
    stream,
    check,
    notes: [note, 'Static tail is 53 frames at 1 fps. Animation is 420 frames at 60 fps. This is the current hybrid structure.'],
  }
}

async function renderFullCfr(directory: string, artwork: string, button: string): Promise<MethodResult> {
  await mkdir(directory, { recursive: true })
  const output = path.join(directory, 'full-cfr.mp4')
  const frames = 60 * FPS
  const started = performance.now()
  const strategy: Strategy = { container: 'mp4', bFrames: 2, label: 'full' }
  const run = await encodeSegment({ label: 'full cfr', artwork, button, frames, fps: FPS, width: WIDTH, height: HEIGHT, still: false, output, strategy, legacyVfr: false })
  const stream = await probeStream(output)
  const packets = await readPackets(output)
  const check = checkCfr(packets, stream, fullTimeline(), run.stderr, false)
  return {
    id: 'full',
    label: 'Full-video CFR',
    wallSeconds: (performance.now() - started) / 1000,
    framesEncoded: frames,
    outputBytes: (await stat(output)).size,
    peakWorkingSet: run.peakWorkingSet,
    tempDiskBytes: await directoryBytes(directory),
    uniqueEncodedBytes: (await stat(output)).size,
    outputPath: output,
    stream,
    check,
    notes: ['One libx264 encode of all 3600 frames. The subscribe graphic is enabled for the first 6.9 seconds. Keyframes follow the 2 second GOP, not the concat boundaries.'],
  }
}

function maxPeak(runs: RunStats[]): number | null {
  const peaks = runs.map((run) => run.peakWorkingSet).filter((value): value is number => value != null)
  return peaks.length ? Math.max(...peaks) : null
}

async function extractFrame(video: string, frameIndex: number, dest: string, mode: 'accurate' | 'seek'): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true })
  if (mode === 'accurate') {
    await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vf', `select=eq(n\\,${frameIndex})`, '-frames:v', '1', dest], `frame ${frameIndex}`)
    return
  }
  const time = frameIndex / FPS
  const keyTime = Math.floor(time / GOP_SECONDS) * GOP_SECONDS
  const offset = Math.round((time - keyTime) * FPS)
  await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-ss', keyTime.toFixed(3), '-i', video, '-vf', `select=eq(n\\,${offset})`, '-frames:v', '1', dest], `seek frame ${frameIndex}`)
}

async function fileHash(file: string): Promise<string> {
  const data = await readFile(file)
  return createHash('sha256').update(data).digest('hex')
}

async function ssim(left: string, right: string): Promise<number | null> {
  try {
    const run = await runFfmpeg(['-y', '-hide_banner', '-i', left, '-i', right, '-lavfi', 'ssim', '-f', 'null', '-'], 'ssim')
    const match = /All:([0-9.]+)/.exec(run.stderr)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

async function blackFrames(video: string): Promise<number> {
  const run = await runFfmpeg(['-y', '-hide_banner', '-i', video, '-vf', 'blackframe=amount=98:threshold=32', '-an', '-f', 'null', '-'], 'blackframe')
  return run.stderr.split(/\r?\n/).filter((line) => /blackframe/.test(line) && /frame:\d+/.test(line)).length
}

async function ffmpegVersion(): Promise<string> {
  const run = await runFfmpeg(['-version'], 'version')
  return ((run.stdout || run.stderr).split('\n')[0] ?? 'unknown').replace(/\r/g, '').trim()
}

function markdown(report: Report): string {
  const row = (method: MethodResult) => `| ${method.label} | ${method.wallSeconds.toFixed(2)} s | ${method.framesEncoded} | ${formatBytes(method.outputBytes)} | ${method.peakWorkingSet == null ? 'n/a' : formatBytes(method.peakWorkingSet)} | ${formatBytes(method.tempDiskBytes)} | ${method.stream.formatDuration?.toFixed(6) ?? 'n/a'} | ${method.stream.nbFrames ?? method.check.packetCount} | ${method.stream.rate ?? 'n/a'} | ${method.stream.avgRate ?? 'n/a'} | ${method.check.ok ? 'yes' : 'no'} |`
  return `# Optimized CFR proof of concept

Generated ${report.recordedAt}. This is a standalone test. The Screensaver export path is unchanged, and YouTube compatibility is not claimed.

## Setup

- Host: ${report.host}
- CPU: ${report.cpu}
- Memory: ${formatBytes(report.totalMemory)}
- FFmpeg: ${report.ffmpeg}
- Picture: ${WIDTH}x${HEIGHT}, testsrc2 still, sliding SUBSCRIBE graphic for the first 6.9 seconds
- Timeline: 7 s animation + five reused 10 s static segments + one 3 s remainder = 60 s
- Encoder base: existing libx264 standard settings (CRF 20, veryfast, stillimage tune on static segments only)
- Added for concat compatibility: High profile, level 5.2, yuv420p, bt.709, closed GOP, ${GOP_SECONDS} s keyframe interval, timescale ${FPS * 1000}
- Chosen concat strategy: ${report.strategy.label}

## Strategy trials

${report.strategyNotes.map((note) => `- ${note}`).join('\n')}

The optimized concat uses \`-c:v copy\`. It does not fall back to a full re-encode.

## Measurements

| Method | Render time | Frames encoded | File size | Peak FFmpeg working set | Temp disk | Duration | Frames | Nominal rate | Average rate | CFR valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${report.methods.map(row).join('\n')}

Frames encoded counts pictures sent to libx264. The optimized output still contains ${report.outputFrames} frames because the 10 s segment is referenced ${STATIC_REPEATS} times in the concat list and stored once on disk (${formatBytes(report.optimizedUniqueBytes)} of unique segment media versus ${formatBytes(report.optimizedExpandedBytes)} if those repeats were separate files).

${report.methods.map((method) => `### ${method.label}\n\n${method.notes.map((note) => `- ${note}`).join('\n')}\n${method.check.ok ? '- Timestamp grid, DTS steps, packet durations, and boundary keyframes matched.' : `- CFR check failed: ${method.check.reasons.join(' ')}`}`).join('\n\n')}

## Timestamp proof

Optimized time base \`${report.optimizedCheck.timeBase}\`, tick ${report.optimizedCheck.expectedTick}. Packet count ${report.optimizedCheck.packetCount}. First PTS ${report.optimizedCheck.firstPts}, last PTS ${report.optimizedCheck.lastPts}. A 60 fps frame at timescale ${FPS * 1000} is ${report.optimizedCheck.expectedTick} ticks. Matching nominal and average rates is not treated as proof; the integer PTS grid and DTS steps are.

Boundary packet indexes checked for keyframes: ${report.boundaryIndexes.join(', ')}.

## Visual checks

| Check | Result |
| --- | --- |
| Seek extract matches accurate extract at frame 420 | ${report.seekMatchesAccurate ? 'yes' : 'no'} |
| Reused static frame 420 hash equals frame 1020 | ${report.reuseHashMatch ? 'yes' : 'no'} |
| Reused static frame 420 hash equals frame 2820 | ${report.reuseHashMatchLate ? 'yes' : 'no'} |
| SSIM across first static join (frames 1019 and 1020) | ${fmt(report.ssimStaticJoin)} |
| SSIM across remainder join (frames 3419 and 3420) | ${fmt(report.ssimRemainderJoin)} |
| SSIM animation frame 210, optimized vs full CFR | ${fmt(report.ssimAnimation)} |
| SSIM static frame 1800, optimized vs full CFR | ${fmt(report.ssimStaticVsFull)} |
| SSIM optimized static frame vs source artwork | ${fmt(report.ssimArtwork)} |
| Black frames, optimized | ${report.blackOptimized} |
| Black frames, full CFR | ${report.blackFull} |
| Black frames, VFR | ${report.blackVfr} |

Extracted frames are in \`server/tmp/cfr-poc/frames/\`.

## Audio mux

Silent stereo AAC was muxed with \`-c:v copy\` onto the optimized video. Video timestamp checksum ${report.audioPreservedTimestamps ? 'matched the video-only file' : 'changed'}. Video duration ${report.muxedDuration?.toFixed(6) ?? 'n/a'} s, audio duration ${report.audioDuration?.toFixed(6) ?? 'n/a'} s. The upload candidate is the muxed file.

## Four-hour projection

Not measured. Arithmetic only, using this timeline shape (7 s animation, then static): a 14400 s film needs 864000 frames at 60 fps. The static tail is 14393 s = 1439 × 10 s + 3 s, the same remainder this 60 s test encodes. Frames that would be encoded: 420 + 600 + 180 = 1200, against 864000 frames stored in the output.

## YouTube

Upload candidate: \`${report.youtubePath}\`

Do not treat this file as YouTube-compatible until a manual upload shows:

- 4K processing has finished
- playback quality 2160p60 is available
- Stats for Nerds shows \`3840x2160@60\`
- the subscribe graphic moves smoothly
- joins at 7 s, 17 s, 27 s, 37 s, 47 s, and 57 s do not flash or pause

Average rate on this 60 s VFR comparison is about ${report.vfrAverage ?? 'n/a'} fps because the 7 s animation is a large share of a one-minute file. The four-hour export that showed \`3840x2160@6\` has an average near 1 fps. This test answers whether the reused segments are CFR. It does not reproduce that four-hour average.
`
}

function fmt(value: number | null): string {
  return value == null ? 'n/a' : value.toFixed(6)
}

interface Report {
  recordedAt: string
  host: string
  cpu: string
  totalMemory: number
  ffmpeg: string
  strategy: Strategy
  strategyNotes: string[]
  methods: MethodResult[]
  outputFrames: number
  optimizedUniqueBytes: number
  optimizedExpandedBytes: number
  optimizedCheck: CfrCheck
  boundaryIndexes: number[]
  seekMatchesAccurate: boolean
  reuseHashMatch: boolean
  reuseHashMatchLate: boolean
  ssimStaticJoin: number | null
  ssimRemainderJoin: number | null
  ssimAnimation: number | null
  ssimStaticVsFull: number | null
  ssimArtwork: number | null
  blackOptimized: number | null
  blackFull: number | null
  blackVfr: number | null
  audioPreservedTimestamps: boolean
  muxedDuration: number | null
  audioDuration: number | null
  youtubePath: string
  vfrAverage: string | null
}

async function main(): Promise<void> {
  await rm(ROOT, { recursive: true, force: true })
  await mkdir(ROOT, { recursive: true })
  const ffmpeg = await ffmpegVersion()
  log(ffmpeg)
  const investigation = await investigateStrategy()
  log(`Using ${investigation.strategy.label}`)
  if (process.env.CFR_POC_MICRO === '1') {
    console.log(investigation.notes.join('\n'))
    return
  }

  const artwork = path.join(ROOT, 'artwork.png')
  const button = path.join(ROOT, 'button.png')
  await writeArtwork(artwork, WIDTH, HEIGHT)
  await writeButton(button, 960, 180)

  const vfr = await renderVfr(path.join(ROOT, 'vfr'), artwork, button)
  log(`VFR done in ${vfr.wallSeconds.toFixed(1)}s, avg ${vfr.stream.avgRate}, frames ${vfr.check.packetCount}`)
  const optimizedEncoded = await encodeOptimized(fullTimeline(), investigation.strategy, path.join(ROOT, 'optimized'), artwork, button)
  const optimizedPackets = await readPackets(optimizedEncoded.video)
  const optimizedStream = await probeStream(optimizedEncoded.video)
  const optimizedCheck = checkCfr(optimizedPackets, optimizedStream, fullTimeline(), optimizedEncoded.concatStderr)
  const optimized: MethodResult = {
    id: 'optimized',
    label: 'Optimized CFR',
    wallSeconds: optimizedEncoded.stats.reduce((sum, run) => sum + run.wallSeconds, 0),
    framesEncoded: optimizedEncoded.framesEncoded,
    outputBytes: (await stat(optimizedEncoded.video)).size,
    peakWorkingSet: maxPeak(optimizedEncoded.stats),
    tempDiskBytes: optimizedEncoded.tempDiskBytes,
    uniqueEncodedBytes: optimizedEncoded.uniqueEncodedBytes,
    outputPath: optimizedEncoded.video,
    stream: optimizedStream,
    check: optimizedCheck,
    notes: [`Strategy: ${investigation.strategy.label}.`, 'Static segment encoded once and listed five times. Remainder encoded once. Final video is stream copy.'],
  }
  log(`Optimized CFR ${optimizedCheck.ok ? 'passed' : 'FAILED'} in ${optimized.wallSeconds.toFixed(1)}s`)
  const full = await renderFullCfr(path.join(ROOT, 'full'), artwork, button)
  log(`Full CFR ${full.check.ok ? 'passed' : 'FAILED'} in ${full.wallSeconds.toFixed(1)}s`)

  const outDir = path.join(ROOT, 'out')
  await mkdir(outDir, { recursive: true })
  const youtube = path.join(outDir, 'youtube-optimized-cfr-60s.mp4')
  await muxSilence(optimized.outputPath, youtube, 60)
  const muxPackets = await readPackets(youtube)
  const muxStream = await probeStream(youtube)
  const preserved = checksum(optimizedPackets) === checksum(muxPackets)
  const audioStdout = await ffprobe(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'default=nokey=1:noprint_wrappers=1', youtube])
  const audioDuration = Number(audioStdout.trim())

  const frames = path.join(ROOT, 'frames')
  await mkdir(frames, { recursive: true })
  await extractFrame(optimized.outputPath, 420, path.join(frames, 'opt-420-accurate.png'), 'accurate')
  await extractFrame(optimized.outputPath, 420, path.join(frames, 'opt-420-seek.png'), 'seek')
  const seekMatchesAccurate = (await fileHash(path.join(frames, 'opt-420-accurate.png'))) === (await fileHash(path.join(frames, 'opt-420-seek.png')))
  const mode = seekMatchesAccurate ? 'seek' : 'accurate'
  await extractFrame(optimized.outputPath, 210, path.join(frames, 'opt-210.png'), mode === 'seek' ? 'seek' : 'accurate')
  await extractFrame(optimized.outputPath, 1019, path.join(frames, 'opt-1019.png'), mode)
  await extractFrame(optimized.outputPath, 1020, path.join(frames, 'opt-1020.png'), mode)
  await extractFrame(optimized.outputPath, 2820, path.join(frames, 'opt-2820.png'), mode)
  await extractFrame(optimized.outputPath, 3419, path.join(frames, 'opt-3419.png'), mode)
  await extractFrame(optimized.outputPath, 3420, path.join(frames, 'opt-3420.png'), mode)
  await extractFrame(optimized.outputPath, 1800, path.join(frames, 'opt-1800.png'), mode)
  await extractFrame(full.outputPath, 210, path.join(frames, 'full-210.png'), 'accurate')
  await extractFrame(full.outputPath, 1800, path.join(frames, 'full-1800.png'), mode)
  await extractFrame(vfr.outputPath, 210, path.join(frames, 'vfr-210.png'), 'accurate')

  const hash420 = await fileHash(path.join(frames, 'opt-420-accurate.png'))
  const report: Report = {
    recordedAt: new Date().toISOString(),
    host: os.hostname(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    totalMemory: os.totalmem(),
    ffmpeg,
    strategy: investigation.strategy,
    strategyNotes: investigation.notes,
    methods: [vfr, full, optimized],
    outputFrames: counts(fullTimeline()).outputFrames,
    optimizedUniqueBytes: optimized.uniqueEncodedBytes,
    optimizedExpandedBytes: optimized.uniqueEncodedBytes - (await stat(path.join(ROOT, 'optimized', `static-${SEGMENT_SECONDS}s.${investigation.strategy.container === 'mp4' ? 'mp4' : 'ts'}`))).size + (await stat(path.join(ROOT, 'optimized', `static-${SEGMENT_SECONDS}s.${investigation.strategy.container === 'mp4' ? 'mp4' : 'ts'}`))).size * STATIC_REPEATS,
    optimizedCheck,
    boundaryIndexes: counts(fullTimeline()).segmentStarts,
    seekMatchesAccurate,
    reuseHashMatch: hash420 === (await fileHash(path.join(frames, 'opt-1020.png'))),
    reuseHashMatchLate: hash420 === (await fileHash(path.join(frames, 'opt-2820.png'))),
    ssimStaticJoin: await ssim(path.join(frames, 'opt-1019.png'), path.join(frames, 'opt-1020.png')),
    ssimRemainderJoin: await ssim(path.join(frames, 'opt-3419.png'), path.join(frames, 'opt-3420.png')),
    ssimAnimation: await ssim(path.join(frames, 'opt-210.png'), path.join(frames, 'full-210.png')),
    ssimStaticVsFull: await ssim(path.join(frames, 'opt-1800.png'), path.join(frames, 'full-1800.png')),
    ssimArtwork: await ssim(artwork, path.join(frames, 'opt-1800.png')),
    blackOptimized: await blackFrames(optimized.outputPath),
    blackFull: await blackFrames(full.outputPath),
    blackVfr: await blackFrames(vfr.outputPath),
    audioPreservedTimestamps: preserved,
    muxedDuration: muxStream.formatDuration,
    audioDuration: Number.isFinite(audioDuration) ? audioDuration : null,
    youtubePath: youtube,
    vfrAverage: vfr.stream.avgRate,
  }
  await writeFile(path.join(ROOT, 'report.json'), JSON.stringify({ report, muxCheckOk: checkCfr(muxPackets, muxStream, fullTimeline(), '').ok, commands: commandNotes }, null, 2))
  await mkdir(path.dirname(DOCS_REPORT), { recursive: true })
  await writeFile(DOCS_REPORT, markdown(report))
  log(`Report ${DOCS_REPORT}`)
  log(`YouTube candidate ${youtube}`)
  log(`CFR optimized=${optimizedCheck.ok} full=${full.check.ok} mux checksum=${preserved}`)
  if (!optimizedCheck.ok || !preserved) process.exitCode = 1
  console.log(JSON.stringify({ optimized: optimizedCheck.ok, full: full.check.ok, vfrRate: vfr.stream.avgRate, optimizedRate: optimizedStream.avgRate, wall: { vfr: vfr.wallSeconds, full: full.wallSeconds, optimized: optimized.wallSeconds }, framesEncoded: { vfr: vfr.framesEncoded, full: full.framesEncoded, optimized: optimized.framesEncoded } }, null, 2))
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
