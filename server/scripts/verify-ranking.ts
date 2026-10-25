import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { frameMetrics } from '../../shared/frame'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { renderProject, type RenderClip } from '../src/render'
import { ensureStorage, outputsDir } from '../src/storage'

const execFileAsync = promisify(execFile)

async function main(): Promise<void> {
  const enabled = process.env.VVR_RANKING_TEST === '1' || process.env.npm_lifecycle_event === 'test:ranking'
  if (!enabled) {
    console.log('Run via npm run test:ranking or set VVR_RANKING_TEST=1.')
    return
  }
  const work = path.join(outputsDir, '..', 'verify-ranking')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  await ensureStorage()

  const clipA = path.join(work, 'a.mp4')
  const clipB = path.join(work, 'b.mp4')
  for (const [file, freq] of [
    [clipA, 440],
    [clipB, 520],
  ] as const) {
    await execFileAsync(ffmpegBinary(), [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=720x1280:rate=30:duration=1.2',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${freq}:sample_rate=48000:duration=1.2`,
      '-shortest',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      file,
    ])
  }

  const metrics = frameMetrics(1080, 1920, 240)
  const overlays: string[] = []
  for (let index = 0; index < 2; index += 1) {
    const overlayPath = path.join(work, `overlay-${index}.png`)
    await execFileAsync(ffmpegBinary(), [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x00000000:s=${metrics.width}x${metrics.height}:duration=0.04`,
      '-frames:v',
      '1',
      overlayPath,
    ])
    overlays.push(overlayPath)
  }

  const clips: RenderClip[] = [
    { id: 'a', path: clipA, trimStart: 0, trimEnd: 1, hasAudio: true },
    { id: 'b', path: clipB, trimStart: 0, trimEnd: 1, hasAudio: true },
  ]

  await runCase('cut', clips, overlays, { transition: 'cut' })
  await runCase('fade', clips, overlays, { transition: 'fade', fadeDuration: 0.35 })

  await rm(work, { recursive: true, force: true })
  console.log('Ranking verify OK')
}

async function runCase(
  label: string,
  clips: RenderClip[],
  overlays: string[],
  patch: { transition: 'cut' | 'fade'; fadeDuration?: number },
): Promise<void> {
  const jobId = `00000000-0000-4000-8000-${label === 'cut' ? '000000000002' : '000000000003'}`
  const metrics = frameMetrics(1080, 1920, 240)
  await renderProject(
    {
      id: jobId,
      clips,
      overlays,
      musicPath: null,
      width: metrics.width,
      height: metrics.height,
      fps: 30,
      bannerHeight: metrics.bannerHeight,
      bannerColor: '#000000',
      scaleMode: 'crop',
      backgroundColor: '#000000',
      transition: patch.transition,
      fadeDuration: patch.fadeDuration ?? 0.35,
      keepAudio: true,
      normalize: false,
      originalVolume: 1,
      musicVolume: 0,
      encoder: 'cpu',
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
  const data = JSON.parse(probe.stdout) as {
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[]
    format?: { duration?: string }
  }
  const video = data.streams?.find((stream) => stream.codec_type === 'video')
  const audio = data.streams?.find((stream) => stream.codec_type === 'audio')
  if (!video || video.width !== 1080 || video.height !== 1920) {
    throw new Error(`${label}: dimensions mismatch`)
  }
  if (video.codec_name !== 'h264') throw new Error(`${label}: expected h264`)
  if (!audio) throw new Error(`${label}: missing audio`)
  const duration = Number(data.format?.duration ?? 0)
  const expected = patch.transition === 'fade' ? 1.65 : 2
  if (duration < expected - 0.5 || duration > expected + 0.75) {
    throw new Error(`${label}: unexpected duration ${duration}`)
  }
  await rm(outputPath, { force: true }).catch(() => undefined)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
