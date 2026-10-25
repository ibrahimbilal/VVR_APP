import { execFile } from 'node:child_process'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { frameMetrics } from '../../shared/frame'
import { sequenceDuration } from '../../shared/timeline'
import { ffmpegBinary } from '../src/binaries'
import { renderProject, type RenderClip, type RenderRequest } from '../src/render'
import { ensureStorage, outputsDir, tmpDir } from '../src/storage'
import { cpuPercent, memoryMb, probeOutput, round, sampleProcess, systemInfo } from './benchCommon'

const execFileAsync = promisify(execFile)

const CLIP_COUNT = 5
const CLIP_SECONDS = 2
const WIDTH = 1080
const HEIGHT = 1920
const FPS = 30
const BANNER_HEIGHT = 240

interface BenchRow {
  name: string
  inputType: string
  outputResolution: string
  encoder: string
  frameRate: number
  renderingSeconds: number | null
  encodingSpeed: number | null
  realtimeFactor: number | null
  outputBytes: number | null
  cpuPercent: number | 'not measured'
  memoryMb: number | 'not measured'
  valid: boolean
  detail: string
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args[0] === '--threads=sweep') {
    await threadSweep()
    return
  }
  const label = args[0] === 'after' ? 'after' : 'baseline'
  await ensureStorage()
  const work = path.join(tmpDir, 'bench-ranking')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })

  const fixtures = await buildFixtures(work)
  const metrics = frameMetrics(WIDTH, HEIGHT, BANNER_HEIGHT)
  const trimEnd = CLIP_SECONDS
  const clips: RenderClip[] = fixtures.clipPaths.map((clipPath, index) => ({
    id: `clip-${index}`,
    path: clipPath,
    trimStart: 0,
    trimEnd,
    hasAudio: index % 2 === 0,
  }))

  const cases: { name: string; inputType: string; patch: Partial<RenderRequest> }[] = [
    { name: 'ranking-1080p-cut', inputType: '5 clips, crop, hard cut', patch: { transition: 'cut', scaleMode: 'crop' } },
    { name: 'ranking-1080p-fade', inputType: '5 clips, crop, crossfade', patch: { transition: 'fade', fadeDuration: 0.35, scaleMode: 'crop' } },
    { name: 'ranking-1080p-audio', inputType: '5 clips, audio + music', patch: { transition: 'cut', scaleMode: 'crop', keepAudio: true, normalize: true, musicPath: fixtures.musicPath } },
    { name: 'ranking-1080p-blur', inputType: '5 clips, blur scale', patch: { transition: 'cut', scaleMode: 'blur' } },
  ]

  const rows: BenchRow[] = []
  for (const item of cases) {
    rows.push(await runCase(item.name, item.inputType, baseRequest(clips, fixtures.overlayPaths, metrics, item.patch)))
    console.log(JSON.stringify(rows[rows.length - 1]))
  }

  const output = {
    label,
    recordedAt: new Date().toISOString(),
    system: await systemInfo(),
    clipCount: CLIP_COUNT,
    clipSeconds: CLIP_SECONDS,
    rows,
  }
  const dest = path.join(tmpDir, `bench-ranking-${label}.json`)
  await writeFile(dest, JSON.stringify(output, null, 2))
  console.log(`Wrote ${dest}`)
  await rm(work, { recursive: true, force: true })
}

async function threadSweep(): Promise<void> {
  const configs = [
    { VVR_FFMPEG_THREADS: '1', VVR_FFMPEG_FILTER_THREADS: '1', VVR_X264_THREADS: '1' },
    { VVR_FFMPEG_THREADS: '4', VVR_FFMPEG_FILTER_THREADS: '2', VVR_X264_THREADS: '2' },
    { VVR_FFMPEG_THREADS: '4', VVR_FFMPEG_FILTER_THREADS: '4', VVR_X264_THREADS: '4' },
  ]
  await ensureStorage()
  const work = path.join(tmpDir, 'bench-ranking-sweep')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  const fixtures = await buildFixtures(work)
  const metrics = frameMetrics(WIDTH, HEIGHT, BANNER_HEIGHT)
  const clips: RenderClip[] = fixtures.clipPaths.map((clipPath, index) => ({
    id: `clip-${index}`,
    path: clipPath,
    trimStart: 0,
    trimEnd: CLIP_SECONDS,
    hasAudio: false,
  }))
  const request = baseRequest(clips, fixtures.overlayPaths, metrics, { transition: 'cut', scaleMode: 'crop' })
  for (const envPatch of configs) {
    for (const [key, value] of Object.entries(envPatch)) {
      process.env[key] = value
    }
    const row = await runCase(`sweep-${Object.values(envPatch).join('-')}`, 'thread sweep', request)
    console.log(JSON.stringify({ env: envPatch, ...row }))
  }
  await rm(work, { recursive: true, force: true })
}

function baseRequest(
  clips: RenderClip[],
  overlays: string[],
  metrics: ReturnType<typeof frameMetrics>,
  patch: Partial<RenderRequest>,
): RenderRequest {
  return {
    clips,
    overlays,
    musicPath: null,
    width: metrics.width,
    height: metrics.height,
    fps: FPS,
    bannerHeight: metrics.bannerHeight,
    bannerColor: '#000000',
    scaleMode: 'crop',
    backgroundColor: '#101010',
    transition: 'cut',
    fadeDuration: 0.35,
    keepAudio: false,
    normalize: false,
    originalVolume: 1,
    musicVolume: 0.35,
    encoder: 'cpu',
    ...patch,
  }
}

async function buildFixtures(work: string): Promise<{ clipPaths: string[]; overlayPaths: string[]; musicPath: string }> {
  const clipPaths: string[] = []
  for (let index = 0; index < CLIP_COUNT; index += 1) {
    const clipPath = path.join(work, `clip-${index}.mp4`)
    await execFileAsync(ffmpegBinary(), [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=720x1280:rate=${FPS}:duration=${CLIP_SECONDS}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${440 + index * 40}:sample_rate=48000:duration=${CLIP_SECONDS}`,
      '-shortest',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      clipPath,
    ])
    clipPaths.push(clipPath)
  }

  const metrics = frameMetrics(WIDTH, HEIGHT, BANNER_HEIGHT)
  const overlayPaths: string[] = []
  for (let index = 0; index < CLIP_COUNT; index += 1) {
    const overlayPath = path.join(work, `overlay-${index}.png`)
    await execFileAsync(ffmpegBinary(), [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x${(index * 20).toString(16).padStart(2, '0')}8080:s=${metrics.width}x${metrics.height}:duration=0.04`,
      '-frames:v',
      '1',
      overlayPath,
    ])
    overlayPaths.push(overlayPath)
  }

  const musicPath = path.join(work, 'music.mp3')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=220:sample_rate=48000:duration=${CLIP_SECONDS * CLIP_COUNT}`,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '5',
    musicPath,
  ])

  return { clipPaths, overlayPaths, musicPath }
}

async function runCase(name: string, inputType: string, request: RenderRequest): Promise<BenchRow> {
  const id = `bench-${name}-${Date.now()}`
  const outputPath = path.join(outputsDir, `${id}.mp4`)
  let pid: number | null = null
  let lastSpeed: number | null = null
  let encoderName = 'libx264'
  const samples: { cpu: number; rss: number; at: number }[] = []
  let timer: NodeJS.Timeout | null = null
  const durations = request.clips.map((clip) => clip.trimEnd - clip.trimStart)
  const fade = request.transition === 'fade' ? Math.min(request.fadeDuration, 1) : 0
  const expected = sequenceDuration(durations, fade)
  const started = performance.now()
  try {
    await renderProject(
      { ...request, id },
      {
        cancelled: () => false,
        onProgress: () => undefined,
        onStats: (stats) => {
          if (stats.speed != null) lastSpeed = stats.speed
        },
        onEncode: (info) => {
          encoderName = info.encoder
        },
        onSpawn: (childPid) => {
          pid = childPid
          if (timer) return
          timer = setInterval(() => {
            void sampleProcess(childPid).then((sample) => {
              if (sample) samples.push({ ...sample, at: performance.now() })
            })
          }, 400)
        },
        onStatus: () => undefined,
        registerKill: () => undefined,
      },
    )
    const wall = (performance.now() - started) / 1000
    const info = await stat(outputPath)
    const probe = await probeOutput(outputPath)
    const valid =
      probe.width === request.width &&
      probe.height === request.height &&
      probe.codec === 'h264' &&
      probe.duration >= expected - 1.5 &&
      probe.duration <= expected + 2
    return {
      name,
      inputType,
      outputResolution: `${request.width}x${request.height}`,
      encoder: encoderName,
      frameRate: request.fps,
      renderingSeconds: round(wall),
      encodingSpeed: lastSpeed,
      realtimeFactor: round(probe.duration / wall),
      outputBytes: info.size,
      cpuPercent: cpuPercent(samples),
      memoryMb: memoryMb(samples),
      valid,
      detail: valid ? 'ffprobe ok' : `ffprobe ${probe.codec} ${probe.width}x${probe.height} ${probe.duration}s`,
    }
  } catch (error) {
    return {
      name,
      inputType,
      outputResolution: `${request.width}x${request.height}`,
      encoder: encoderName,
      frameRate: request.fps,
      renderingSeconds: round((performance.now() - started) / 1000),
      encodingSpeed: lastSpeed,
      realtimeFactor: null,
      outputBytes: null,
      cpuPercent: cpuPercent(samples),
      memoryMb: memoryMb(samples),
      valid: false,
      detail: error instanceof Error ? error.message : 'failed',
    }
  } finally {
    if (timer) clearInterval(timer)
    await rm(outputPath, { force: true }).catch(() => undefined)
    await rm(path.join(tmpDir, 'jobs', id), { recursive: true, force: true }).catch(() => undefined)
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
