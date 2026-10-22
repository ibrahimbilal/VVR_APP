import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { applyColorAdjustments, defaultAdjustments } from '../../shared/screensaverAdjust'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { renderScreensaver, type ScreensaverRenderRequest } from '../src/renderScreensaver'
import { ensureStorage, outputsDir } from '../src/storage'

const execFileAsync = promisify(execFile)

async function main(): Promise<void> {
  const enabled = process.env.VVR_SCREENSAVER_TEST === '1' || process.env.npm_lifecycle_event === 'test:screensaver'
  if (!enabled) {
    console.log('Run via npm run test:screensaver or set VVR_SCREENSAVER_TEST=1.')
    return
  }
  const tmp = path.join(outputsDir, '..', 'verify-screensaver')
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  const imagePath = path.join(tmp, 'test.png')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await writeFile(imagePath, png)
  await ensureStorage()

  const jobId = '00000000-0000-4000-8000-000000000001'
  await renderScreensaver(
    {
      id: jobId,
      mediaPath: imagePath,
      mediaKind: 'image',
      mode: 'static',
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 5,
      fit: 'contain',
      loopType: 'hard',
      crossfadeSeconds: 1,
      audioMode: 'none',
      audioVolume: 0,
      audioFadeIn: 0,
      audioFadeOut: 0,
      loopAudio: false,
      backgroundColor: '#000000',
      musicPath: null,
      sourceDuration: 0,
      sourceHasAudio: false,
    },
    {
      cancelled: () => false,
      onProgress: () => undefined,
      onStatus: () => undefined,
      registerKill: () => undefined,
    },
  )

  const outputPath = path.join(outputsDir, `${jobId}.mp4`)
  const probe = await execFileAsync(ffprobeBinary(), [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    outputPath,
  ])
  const data = JSON.parse(probe.stdout) as { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } }
  const video = data.streams?.find((s) => s.codec_type === 'video')
  const duration = Number(data.format?.duration ?? 0)
  if (!video || video.width !== 1920 || video.height !== 1080) {
    throw new Error('Output dimensions mismatch.')
  }
  if (duration < 4 || duration > 7) {
    throw new Error(`Unexpected duration: ${duration}`)
  }
  console.log('Screensaver verify OK:', { duration, width: video.width, height: video.height })
  await rm(outputPath, { force: true })

  const composed = path.join(tmp, 'composed.png')
  await execFileAsync(ffmpegBinary(), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=1:duration=1', '-frames:v', '1', composed])
  const fastId = '00000000-0000-4000-8000-000000000002'
  const tone = path.join(tmp, 'tone.wav')
  await execFileAsync(ffmpegBinary(), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', tone])
  await renderScreensaver(stillJob(fastId, composed, tone), quietHooks())
  const fastPath = path.join(outputsDir, `${fastId}.mp4`)
  const fastProbe = await probeFile(fastPath)
  if (fastProbe.fps < 0.5 || fastProbe.fps > 1.5) throw new Error(`Expected about 1 fps, got ${fastProbe.fps}`)
  if (!fastProbe.hasAudio) throw new Error('Audio track missing.')
  if (fastProbe.duration < 4 || fastProbe.duration > 7) throw new Error(`Unexpected fast duration ${fastProbe.duration}`)
  const framePath = path.join(tmp, 'frame.png')
  await execFileAsync(ffmpegBinary(), ['-y', '-hide_banner', '-loglevel', 'error', '-i', fastPath, '-frames:v', '1', framePath])
  const ssim = await ssimScore(composed, framePath)
  if (ssim < 0.9) throw new Error(`SSIM ${ssim} is below 0.9`)
  console.log('Static 1 fps verify OK:', { duration: fastProbe.duration, fps: fastProbe.fps, ssim })
  await rm(fastPath, { force: true })

  const pixels = new Uint8ClampedArray([20, 20, 20, 255, 180, 40, 40, 255])
  const brighter = new Uint8ClampedArray(pixels)
  const adjustments = defaultAdjustments()
  adjustments.brightness = 40
  applyColorAdjustments(brighter, adjustments)
  if (brighter[0] <= pixels[0]) throw new Error('Brightness did not raise the pixel.')
  const gray = new Uint8ClampedArray(pixels)
  const grayAdjust = defaultAdjustments()
  grayAdjust.grayscale = 100
  applyColorAdjustments(gray, grayAdjust)
  if (Math.abs(gray[4] - gray[5]) > 2) throw new Error('Grayscale left color in the pixel.')
  console.log('Adjustment pixel check OK')

  await rm(tmp, { recursive: true, force: true })
}

function stillJob(id: string, composed: string, tone: string): ScreensaverRenderRequest & { id: string } {
  return {
    id,
    mediaPath: composed,
    mediaKind: 'image',
    mode: 'static',
    width: 1920,
    height: 1080,
    fps: 1,
    duration: 5,
    fit: 'contain',
    loopType: 'hard',
    crossfadeSeconds: 1,
    audioMode: 'upload',
    audioVolume: 0.8,
    audioFadeIn: 0.2,
    audioFadeOut: 0.2,
    loopAudio: true,
    backgroundColor: '#000000',
    musicPath: tone,
    sourceDuration: 0,
    sourceHasAudio: false,
    compositionPath: composed,
    encoder: 'cpu',
    profile: 'static-fast',
  }
}

function quietHooks() {
  return {
    cancelled: () => false,
    onProgress: () => undefined,
    onStatus: () => undefined,
    registerKill: () => undefined,
  }
}

async function probeFile(file: string): Promise<{ width: number; height: number; duration: number; fps: number; hasAudio: boolean }> {
  const probe = await execFileAsync(ffprobeBinary(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])
  const data = JSON.parse(probe.stdout) as {
    streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string }[]
    format?: { duration?: string }
  }
  const video = data.streams?.find((stream) => stream.codec_type === 'video')
  const rate = video?.avg_frame_rate?.split('/') ?? ['0', '1']
  const fps = Number(rate[0]) / Math.max(1, Number(rate[1]))
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    duration: Number(data.format?.duration ?? 0),
    fps,
    hasAudio: Boolean(data.streams?.some((stream) => stream.codec_type === 'audio')),
  }
}

async function ssimScore(reference: string, frame: string): Promise<number> {
  const result = await execFileAsync(ffmpegBinary(), ['-i', reference, '-i', frame, '-lavfi', 'ssim', '-f', 'null', '-']).catch((error: { stderr?: string; message?: string }) => {
    throw new Error(error.stderr || error.message || 'SSIM failed')
  })
  const text = `${result.stderr}\n${result.stdout}`
  const match = /All:([0-9.]+)/.exec(text)
  if (!match) throw new Error(`SSIM score missing: ${text.slice(-500)}`)
  return Number(match[1])
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
