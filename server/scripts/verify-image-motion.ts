import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { defaultMotionSettings, defaultTransitionAfter } from '../../shared/imageMotion'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { renderImageMotion } from '../src/renderImageMotion'
import { addClip, ensureStorage, incomingDir, outputsDir } from '../src/storage'

const execFileAsync = promisify(execFile)
const work = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tmp-verify-image-motion')
const sample = path.join(work, 'landscape.png')

async function main(): Promise<void> {
  const life = process.env.npm_lifecycle_event ?? ''
  const enabled = process.env.RIBO_IMAGE_MOTION_TEST === '1' || life === 'test:image-motion'
  if (!enabled) {
    console.log('Shared unit tests passed. Set RIBO_IMAGE_MOTION_TEST=1 for FFmpeg verify.')
    return
  }
  await ensureStorage()
  await mkdir(work, { recursive: true })
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=#224466:s=1920x1080',
    '-frames:v',
    '1',
    sample,
  ])
  const probe = {
    duration: 0,
    width: 1920,
    height: 1080,
    hasAudio: false,
    hasVideo: true,
    codec: 'png' as string | null,
    size: 4096,
  }
  const incomingA = path.join(incomingDir, 'imotion-a.png')
  const incomingB = path.join(incomingDir, 'imotion-b.png')
  await copyFile(sample, incomingA)
  await copyFile(sample, incomingB)
  const a = await addClip(incomingA, 'a.png', probe, 'image-motion')
  const b = await addClip(incomingB, 'b.png', probe, 'image-motion')
  const id = 'verify-image-motion'
  const motion = defaultMotionSettings('full')
  motion.duration = 2
  const transitionFade = defaultTransitionAfter()
  transitionFade.type = 'fade'
  transitionFade.fadeDuration = 0.35
  await renderImageMotion(
    {
      id,
      segments: [
        { id: a.id, path: a.path, width: 1920, height: 1080, motion: { ...motion }, transitionAfter: transitionFade },
        {
          id: b.id,
          path: b.path,
          width: 1920,
          height: 1080,
          motion: { ...motion, direction: 'ltr' },
          transitionAfter: defaultTransitionAfter(),
        },
      ],
      width: 1080,
      height: 1920,
      fps: 30,
      musicPath: null,
      musicVolume: 0,
      musicFadeIn: 0,
      musicFadeOut: 0,
      musicOffset: 0,
      loopMusic: true,
      encoder: 'cpu',
    },
    {
      cancelled: () => false,
      onProgress: () => undefined,
      onStatus: () => undefined,
      registerKill: () => undefined,
    },
  )
  const outputPath = path.join(outputsDir, `${id}.mp4`)
  const probeOut = await execFileAsync(ffprobeBinary(), [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    outputPath,
  ])
  const data = JSON.parse(probeOut.stdout) as {
    streams?: { codec_type?: string; width?: number; height?: number }[]
    format?: { duration?: string }
  }
  const video = data.streams?.find((stream) => stream.codec_type === 'video')
  if (!video || video.width !== 1080 || video.height !== 1920) throw new Error('dimensions mismatch')
  const duration = Number(data.format?.duration ?? 0)
  if (duration < 3.5 || duration > 4.2) throw new Error(`unexpected duration ${duration}`)
  await rm(outputPath, { force: true })
  await rm(work, { recursive: true, force: true })
  console.log('verify-image-motion: ok')
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
