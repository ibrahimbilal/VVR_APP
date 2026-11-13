/**
 * Integration checks for Optimized CFR + VFR duration regression.
 * Run: npm run test:screensaver-cfr
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { defaultSubscribeAnimation, subscribeAnimationFrameCount } from '../../shared/screensaverSubscribeAnimation'
import { ffmpegBinary, ffprobeBinary } from '../src/binaries'
import { renderScreensaver, type ScreensaverRenderRequest } from '../src/renderScreensaver'
import { ensureStorage, outputsDir } from '../src/storage'
import { validateCfrPackets } from '../src/screensaverCfr/validate'

const execFileAsync = promisify(execFile)

async function main(): Promise<void> {
  process.env.VVR_SCREENSAVER_TEST = '1'
  const tmp = path.join(outputsDir, '..', 'verify-cfr')
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
    'testsrc2=size=1280x720:rate=1:duration=1',
    '-frames:v',
    '1',
    composed,
  ])

  await runCfrCase({
    label: 'static-only',
    composed,
    tmp,
    id: '00000000-0000-4000-8000-000000000020',
    duration: 12,
    fps: 30,
    anim: null,
  })

  await runCfrCase({
    label: 'anim-middle',
    composed,
    tmp,
    id: '00000000-0000-4000-8000-000000000021',
    duration: 20,
    fps: 60,
    anim: { startSec: 5, durationSec: 4 },
  })

  await runCfrCase({
    label: 'anim-start',
    composed,
    tmp,
    id: '00000000-0000-4000-8000-000000000022',
    duration: 15,
    fps: 24,
    anim: { startSec: 0, durationSec: 4 },
  })

  await runCfrCase({
    label: 'anim-end',
    composed,
    tmp,
    id: '00000000-0000-4000-8000-000000000023',
    duration: 15,
    fps: 25,
    anim: { startSec: 11, durationSec: 4 },
  })

  await runVfrDurationRegression(composed, tmp)

  console.log('verify-screensaver-cfr: all checks passed')
}

async function runCfrCase(options: {
  label: string
  composed: string
  tmp: string
  id: string
  duration: number
  fps: number
  anim: { startSec: number; durationSec: number } | null
}): Promise<void> {
  let animationDir: string | null = null
  let subscribe = null as ReturnType<typeof defaultSubscribeAnimation> | null
  if (options.anim) {
    subscribe = defaultSubscribeAnimation()
    subscribe.enabled = true
    subscribe.startSec = options.anim.startSec
    subscribe.durationSec = options.anim.durationSec
    animationDir = path.join(options.tmp, `anim-${options.label}`)
    await mkdir(animationDir, { recursive: true })
    const tile = path.join(options.tmp, `tile-${options.label}.png`)
    await execFileAsync(ffmpegBinary(), [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red@0.5:s=96x48',
      '-frames:v',
      '1',
      tile,
    ])
    const count = subscribeAnimationFrameCount(subscribe.durationSec)
    const bytes = await readFile(tile)
    for (let index = 1; index <= count; index += 1) {
      await writeFile(path.join(animationDir, `${String(index).padStart(4, '0')}.png`), bytes)
    }
  }

  await renderScreensaver(
    {
      ...baseRequest(options.id, options.composed),
      duration: options.duration,
      fps: options.fps,
      width: 1280,
      height: 720,
      renderingMode: 'optimized-cfr',
      cfrQuality: 'balanced',
      subscribeAnimation: subscribe,
      animationDir,
      animationOverlayX: 40,
      animationOverlayY: 600,
    },
    quietHooks(),
  )

  const output = path.join(outputsDir, `${options.id}.mp4`)
  const expectedFrames = Math.round(options.duration * options.fps)
  const validation = await validateCfrPackets(output, {
    fps: options.fps,
    expectedFrames,
    expectedDurationSec: expectedFrames / options.fps,
    width: 1280,
    height: 720,
    expectAudio: false,
  })
  if (!validation.ok) {
    throw new Error(`${options.label}: ${validation.reasons.join(' ')}`)
  }
  console.log(`  CFR ${options.label}: ok (${expectedFrames} frames @ ${options.fps} fps)`)
  await rm(output, { force: true })
}

async function runVfrDurationRegression(composed: string, tmp: string): Promise<void> {
  const animDir = path.join(tmp, 'anim-vfr')
  await mkdir(animDir, { recursive: true })
  const tile = path.join(tmp, 'tile-vfr.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue@0.4:s=64x32',
    '-frames:v',
    '1',
    tile,
  ])
  const settings = defaultSubscribeAnimation()
  settings.enabled = true
  settings.startSec = 0
  settings.durationSec = 4
  const count = subscribeAnimationFrameCount(settings.durationSec)
  const bytes = await readFile(tile)
  for (let index = 1; index <= count; index += 1) {
    await writeFile(path.join(animDir, `${String(index).padStart(4, '0')}.png`), bytes)
  }

  const id = '00000000-0000-4000-8000-000000000024'
  const duration = 20
  await renderScreensaver(
    {
      ...baseRequest(id, composed),
      duration,
      fps: 1,
      width: 1280,
      height: 720,
      renderingMode: 'fast-vfr',
      subscribeAnimation: settings,
      animationDir: animDir,
      animationOverlayX: 20,
      animationOverlayY: 640,
    },
    quietHooks(),
  )
  const output = path.join(outputsDir, `${id}.mp4`)
  const probed = await probeDuration(output)
  if (Math.abs(probed - duration) > 0.75) {
    throw new Error(`VFR duration regression: expected ~${duration}s, got ${probed.toFixed(3)}s`)
  }
  console.log(`  VFR duration: ok (${probed.toFixed(3)}s, target ${duration}s)`)
  await rm(output, { force: true })
}

function baseRequest(id: string, composed: string): ScreensaverRenderRequest & { id: string } {
  return {
    id,
    mediaPath: composed,
    mediaKind: 'image',
    mode: 'static',
    width: 1280,
    height: 720,
    fps: 30,
    duration: 12,
    fit: 'contain',
    loopType: 'hard',
    crossfadeSeconds: 1,
    audioMode: 'none',
    audioVolume: 0.7,
    audioFadeIn: 0,
    audioFadeOut: 0,
    loopAudio: true,
    backgroundColor: '#000000',
    musicPath: null,
    sourceDuration: 0,
    sourceHasAudio: false,
    profile: 'balanced',
    encoder: 'cpu',
    compositionPath: composed,
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

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobeBinary(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nk=1:nw=1',
    file,
  ])
  return Number(stdout.trim())
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
