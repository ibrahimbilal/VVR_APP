import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { defaultSubscribeAnimation } from '../../shared/screensaverSubscribeAnimation'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { countFramesInRange, readVideoFrameTimestamps } from '../src/ffprobeFrames'
import { renderScreensaver, type ScreensaverRenderRequest } from '../src/renderScreensaver'
import { ensureStorage, outputsDir, tmpDir } from '../src/storage'

const execFileAsync = promisify(execFile)
const DURATION = 60

interface BenchRow {
  case: string
  wallSeconds: number
  outputBytes: number
  frameCount: number
  animWindowFrames: number
  duration: number
}

async function main(): Promise<void> {
  await ensureStorage()
  const work = path.join(tmpDir, 'bench-subscribe')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })

  const composed = path.join(work, 'composed.png')
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

  const animDir = path.join(work, 'anim')
  await mkdir(animDir, { recursive: true })
  const tile = path.join(work, 'tile.png')
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
    await copyFile(tile, path.join(animDir, `${String(index).padStart(4, '0')}.png`))
  }

  const settings = defaultSubscribeAnimation()
  settings.enabled = true
  settings.startSec = 20

  const rows: BenchRow[] = []
  rows.push(await runCase('A-baseline-1fps', base(composed, 1, null, null)))
  rows.push(
    await runCase('B-hybrid-subscribe', {
      ...base(composed, 1, settings, animDir),
      subscribeAnimation: settings,
      animationDir: animDir,
      animationOverlayX: 32,
      animationOverlayY: 900,
    }),
  )
  rows.push(await runCase('C-full-30fps', base(composed, 30, null, null)))

  const report = {
    recordedAt: new Date().toISOString(),
    host: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    durationSeconds: DURATION,
    resolution: '1920x1080',
    ffmpeg: await ffmpegVersion(),
    rows,
  }

  const dest = path.join(tmpDir, 'bench-screensaver-subscribe.json')
  await writeFile(dest, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`Wrote ${dest}`)
  await rm(work, { recursive: true, force: true })
}

function base(
  composed: string,
  fps: number,
  subscribeAnimation: ReturnType<typeof defaultSubscribeAnimation> | null,
  animationDir: string | null,
): ScreensaverRenderRequest & { id: string } {
  return {
    id: randomUUID(),
    mediaPath: composed,
    mediaKind: 'image',
    mode: 'static',
    width: 1920,
    height: 1080,
    fps,
    duration: DURATION,
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
    profile: 'static-fast',
    encoder: 'cpu',
    subscribeAnimation,
    animationDir,
    animationOverlayX: 32,
    animationOverlayY: 900,
  }
}

async function runCase(label: string, request: ScreensaverRenderRequest & { id: string }): Promise<BenchRow> {
  const started = performance.now()
  await renderScreensaver(request, {
    cancelled: () => false,
    onProgress: () => undefined,
    onStatus: () => undefined,
    registerKill: () => undefined,
  })
  const wallSeconds = (performance.now() - started) / 1000
  const outputPath = path.join(outputsDir, `${request.id}.mp4`)
  const info = await stat(outputPath)
  const frames = await readVideoFrameTimestamps(outputPath, 4000)
  const animWindowFrames = countFramesInRange(frames, 20, 24)
  const probe = await execFileAsync(ffprobeBinary(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', outputPath])
  await rm(outputPath, { force: true })
  return {
    case: label,
    wallSeconds: Number(wallSeconds.toFixed(2)),
    outputBytes: info.size,
    frameCount: frames.length,
    animWindowFrames,
    duration: Number(probe.stdout.trim()),
  }
}

async function ffmpegVersion(): Promise<string> {
  const result = await execFileAsync(ffmpegBinary(), ['-version'])
  return result.stdout.split('\n')[0] ?? 'unknown'
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
