import { execFile } from 'node:child_process'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { renderScreensaver, type ScreensaverRenderRequest } from '../src/renderScreensaver'
import { ensureStorage, outputsDir, tmpDir } from '../src/storage'

const execFileAsync = promisify(execFile)
const DURATION = 8

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
  const label = process.argv[2] === 'after' ? 'after' : 'baseline'
  await ensureStorage()
  const work = path.join(tmpDir, 'bench-screensaver')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })

  const imagePath = path.join(work, 'still.png')
  const videoPath = path.join(work, 'loop.mp4')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=960x540:rate=1:duration=1',
    '-frames:v',
    '1',
    imagePath,
  ])
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=1280x720:rate=30:duration=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=2',
    '-shortest',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    videoPath,
  ])

  const cases = label === 'after' ? await afterCases(work, imagePath, videoPath) : beforeCases(imagePath, videoPath)

  const rows: BenchRow[] = []
  for (const item of cases) {
    rows.push(await runCase(item.name, item.inputType, item.request))
    console.log(JSON.stringify(rows[rows.length - 1]))
  }

  const output = {
    label,
    recordedAt: new Date().toISOString(),
    durationSeconds: DURATION,
    note: 'Short representative renders. encodingSpeed is the last FFmpeg speed= value. realtimeFactor is output duration divided by wall time. Decorative frames are not in the baseline because that pipeline does not exist yet.',
    rows,
  }
  const dest = path.join(tmpDir, `bench-${label}.json`)
  await writeFile(dest, JSON.stringify(output, null, 2))
  console.log(`Wrote ${dest}`)
  await rm(work, { recursive: true, force: true })
}

function beforeCases(imagePath: string, videoPath: string) {
  return [
    { name: 'static-1080p', inputType: 'static image', request: base('image', imagePath, 1920, 1080, 'contain') },
    { name: 'static-4k', inputType: 'static image', request: base('image', imagePath, 3840, 2160, 'contain') },
    { name: 'loop-1080p', inputType: 'looping video', request: base('video', videoPath, 1920, 1080, 'contain') },
    { name: 'loop-blur-1080p', inputType: 'looping video with blur', request: base('video', videoPath, 1920, 1080, 'blur') },
  ]
}

async function afterCases(work: string, imagePath: string, videoPath: string) {
  const fullHd = path.join(work, 'fullhd.png')
  const uhd = path.join(work, 'uhd.png')
  const matched = path.join(work, 'matched.mp4')
  await execFileAsync(ffmpegBinary(), ['-y', '-hide_banner', '-loglevel', 'error', '-i', imagePath, '-vf', 'scale=1920:1080', fullHd])
  await execFileAsync(ffmpegBinary(), ['-y', '-hide_banner', '-loglevel', 'error', '-i', imagePath, '-vf', 'scale=3840:2160', uhd])
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=1920x1080:rate=30:duration=2',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-an',
    matched,
  ])
  const still = (name: string, inputType: string, file: string, width: number, height: number, fps: number, encoder: 'cpu' | 'auto' = 'cpu') => ({
    name,
    inputType,
    request: {
      ...base('image', file, width, height, 'contain'),
      fps,
      compositionPath: file,
      profile: 'static-fast' as const,
      encoder,
      sourceWidth: width,
      sourceHeight: height,
    },
  })
  return [
    still('static-1080p-1fps', 'static image, precomposed, 1 fps', fullHd, 1920, 1080, 1),
    still('static-1080p-30fps', 'static image, precomposed, 30 fps', fullHd, 1920, 1080, 30),
    still('static-4k-1fps', 'static image, precomposed, 1 fps', uhd, 3840, 2160, 1),
    still('static-1080p-1fps-auto', 'static image, precomposed, auto encoder', fullHd, 1920, 1080, 1, 'auto'),
    {
      name: 'loop-1080p',
      inputType: 'looping video',
      request: { ...base('video', videoPath, 1920, 1080, 'contain'), encoder: 'cpu' as const, profile: 'animated' as const, sourceWidth: 1280, sourceHeight: 720, sourceCodec: 'h264', sourcePixFmt: 'yuv420p' },
    },
    {
      name: 'loop-blur-1080p',
      inputType: 'looping video with blur',
      request: { ...base('video', videoPath, 1920, 1080, 'blur'), encoder: 'cpu' as const, profile: 'animated' as const, sourceWidth: 1280, sourceHeight: 720, sourceCodec: 'h264', sourcePixFmt: 'yuv420p' },
    },
    {
      name: 'loop-copy-1080p',
      inputType: 'looping video, stream copy',
      request: {
        ...base('video', matched, 1920, 1080, 'contain'),
        encoder: 'cpu' as const,
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceCodec: 'h264',
        sourcePixFmt: 'yuv420p',
      },
    },
  ]
}

function base(
  kind: 'image' | 'video',
  mediaPath: string,
  width: number,
  height: number,
  fit: 'contain' | 'cover' | 'blur',
): ScreensaverRenderRequest {
  return {
    mediaPath,
    mediaKind: kind,
    mode: kind === 'image' ? 'static' : 'loop',
    width,
    height,
    fps: 30,
    duration: DURATION,
    fit,
    loopType: 'hard',
    crossfadeSeconds: 1,
    audioMode: 'none',
    audioVolume: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    loopAudio: false,
    backgroundColor: '#000000',
    musicPath: null,
    sourceDuration: kind === 'video' ? 2 : 0,
    sourceHasAudio: kind === 'video',
  }
}

async function runCase(name: string, inputType: string, request: ScreensaverRenderRequest): Promise<BenchRow> {
  const id = `bench-${name}-${Date.now()}`
  const outputPath = path.join(outputsDir, `${id}.mp4`)
  let pid: number | null = null
  let lastSpeed: number | null = null
  let encoderName = 'libx264'
  const samples: { cpu: number; rss: number; at: number }[] = []
  let timer: NodeJS.Timeout | null = null
  const started = performance.now()
  try {
    await renderScreensaver(
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
    const valid = probe.width === request.width && probe.height === request.height && probe.codec === 'h264' && probe.duration >= DURATION - 1.5 && probe.duration <= DURATION + 1.5
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
    if (pid) {
      /* process already exited */
    }
    await rm(outputPath, { force: true }).catch(() => undefined)
    await rm(path.join(tmpDir, 'jobs', id), { recursive: true, force: true }).catch(() => undefined)
  }
}

function cpuPercent(samples: { cpu: number; rss: number; at: number }[]): number | 'not measured' {
  if (samples.length < 2) return 'not measured'
  const first = samples[0]
  const last = samples[samples.length - 1]
  const cpuDelta = last.cpu - first.cpu
  const wallDelta = (last.at - first.at) / 1000
  if (wallDelta <= 0 || !Number.isFinite(cpuDelta)) return 'not measured'
  return round((cpuDelta / wallDelta) * 100)
}

function memoryMb(samples: { rss: number }[]): number | 'not measured' {
  if (samples.length === 0) return 'not measured'
  const peak = Math.max(...samples.map((sample) => sample.rss))
  if (!Number.isFinite(peak) || peak <= 0) return 'not measured'
  return round(peak / (1024 * 1024))
}

function sampleProcess(pid: number): Promise<{ cpu: number; rss: number } | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress`],
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

async function probeOutput(file: string): Promise<{ width: number; height: number; codec: string | null; duration: number }> {
  const probe = await execFileAsync(ffprobeBinary(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])
  const data = JSON.parse(probe.stdout) as {
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[]
    format?: { duration?: string }
  }
  const video = data.streams?.find((stream) => stream.codec_type === 'video')
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    codec: video?.codec_name ?? null,
    duration: Number(data.format?.duration ?? 0),
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
