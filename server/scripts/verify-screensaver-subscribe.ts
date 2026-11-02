import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { defaultSubscribeAnimation } from '../../shared/screensaverSubscribeAnimation'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import {
  assertMonotonicTimestamps,
  readVideoFrameTimestamps,
} from '../src/ffprobeFrames'
import { renderScreensaver, type ScreensaverRenderRequest } from '../src/renderScreensaver'
import { ensureStorage, outputsDir } from '../src/storage'

const execFileAsync = promisify(execFile)

async function main(): Promise<void> {
  const enabled = process.env.VVR_SCREENSAVER_TEST === '1' || process.env.npm_lifecycle_event === 'test:screensaver-subscribe'
  if (!enabled) {
    console.log('Run via npm run test:screensaver-subscribe or set VVR_SCREENSAVER_TEST=1.')
    return
  }

  const tmp = path.join(outputsDir, '..', 'verify-subscribe')
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  await ensureStorage()

  const composed = path.join(tmp, 'composed.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=1920x1080:rate=1:duration=1',
    '-frames:v',
    '1',
    composed,
  ])

  const baselineId = '00000000-0000-4000-8000-000000000010'
  await renderScreensaver(baseRequest(baselineId, composed, null), quietHooks())
  const baselinePath = path.join(outputsDir, `${baselineId}.mp4`)
  const baselineProbe = await probeSummary(baselinePath)
  if (baselineProbe.fps < 0.5 || baselineProbe.fps > 1.5) throw new Error(`Baseline expected ~1 fps, got ${baselineProbe.fps}`)
  await rm(baselinePath, { force: true })

  const animDir = path.join(tmp, 'anim')
  await mkdir(animDir, { recursive: true })
  const tile = path.join(tmp, 'tile.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red@0.0:s=64x32',
    '-frames:v',
    '1',
    tile,
  ])
  for (let index = 1; index <= 210; index += 1) {
    await writeFile(path.join(animDir, `${String(index).padStart(4, '0')}.png`), await readFile(tile))
  }

  const settings = defaultSubscribeAnimation()
  settings.enabled = true
  settings.startSec = 10
  settings.durationSec = 4

  const hybridId = '00000000-0000-4000-8000-000000000011'
  await renderScreensaver(
    {
      ...baseRequest(hybridId, composed, null),
      duration: 30,
      subscribeAnimation: settings,
      animationDir: animDir,
      animationOverlayX: 32,
      animationOverlayY: 900,
    },
    quietHooks(),
  )
  const hybridPath = path.join(outputsDir, `${hybridId}.mp4`)
  const hybridSummary = await probeSummary(hybridPath)
  if (hybridSummary.width !== 1920 || hybridSummary.height !== 1080) throw new Error('Hybrid resolution mismatch.')
  if (hybridSummary.duration < 28 || hybridSummary.duration > 32) throw new Error(`Hybrid duration ${hybridSummary.duration}`)

  const frames = await readVideoFrameTimestamps(hybridPath)
  assertMonotonicTimestamps(frames)
  if (frames.length < 120 || frames.length > 220) {
    throw new Error(`Expected hybrid total frame count roughly 120–220, got ${frames.length}`)
  }
  const fullFpsEstimate = hybridSummary.duration * 30
  if (frames.length > fullFpsEstimate * 0.45) {
    throw new Error('Hybrid output has too many frames compared with full 30 fps encoding.')
  }

  console.log('Subscribe hybrid verify OK:', { duration: hybridSummary.duration, frameCount: frames.length })
  await rm(hybridPath, { force: true })
  await rm(tmp, { recursive: true, force: true })
}

function baseRequest(id: string, composed: string, animationDir: string | null): ScreensaverRenderRequest & { id: string } {
  return {
    id,
    mediaPath: composed,
    mediaKind: 'image',
    mode: 'static',
    width: 1920,
    height: 1080,
    fps: 1,
    duration: 30,
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
    compositionPath: composed,
    encoder: 'cpu',
    profile: 'static-fast',
    subscribeAnimation: animationDir ? defaultSubscribeAnimation() : null,
    animationDir,
    animationOverlayX: 32,
    animationOverlayY: 900,
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

async function probeSummary(file: string): Promise<{ width: number; height: number; duration: number; fps: number }> {
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
  }
}

void main().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
