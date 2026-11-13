/**
 * Build production YouTube validation files using the integrated CFR engine.
 * Outputs under server/tmp/cfr-production/
 */
/// <reference types="node" />
import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { defaultSubscribeAnimation, subscribeAnimationFrameCount } from '../../shared/screensaverSubscribeAnimation'
import { ffmpegBinary } from '../src/binaries'
import { renderScreensaver } from '../src/renderScreensaver'
import { ensureStorage, outputsDir, tmpDir } from '../src/storage'

const execFileAsync = promisify(execFile)
const OUT = path.join(tmpDir, 'cfr-production')

async function main(): Promise<void> {
  process.env.RIBO_SCREENSAVER_TEST = '1'
  await ensureStorage()
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const composed = path.join(OUT, 'artwork-4k.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=3840x2160:rate=1:duration=1',
    '-frames:v',
    '1',
    composed,
  ])

  const animDir = path.join(OUT, 'anim')
  await mkdir(animDir, { recursive: true })
  const tile = path.join(OUT, 'overlay.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red@0.85:s=420x120',
    '-frames:v',
    '1',
    tile,
  ])
  const settings = defaultSubscribeAnimation()
  settings.enabled = true
  settings.startSec = 3
  settings.durationSec = 7
  const count = subscribeAnimationFrameCount(settings.durationSec)
  const bytes = await readFile(tile)
  for (let index = 1; index <= count; index += 1) {
    await writeFile(path.join(animDir, `${String(index).padStart(4, '0')}.png`), bytes)
  }

  const shortId = '00000000-0000-4000-8000-000000000040'
  console.log('Encoding 60s 4K60 Optimized CFR…')
  await renderScreensaver(
    {
      id: shortId,
      mediaPath: composed,
      mediaKind: 'image',
      mode: 'static',
      width: 3840,
      height: 2160,
      fps: 60,
      duration: 60,
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
      renderingMode: 'optimized-cfr',
      cfrQuality: 'balanced',
      compositionPath: composed,
      subscribeAnimation: settings,
      animationDir: animDir,
      animationOverlayX: Math.round((3840 - 420) / 2),
      animationOverlayY: 2160 - 120 - 48,
    },
    {
      cancelled: () => false,
      onProgress: (p, m) => {
        if (Math.round(p * 100) % 10 === 0) console.log(`  ${Math.round(p * 100)}% ${m ?? ''}`)
      },
      onStatus: (s, m) => console.log(`  [${s}] ${m}`),
      registerKill: () => undefined,
    },
  )

  const shortOut = path.join(OUT, 'youtube-production-cfr-4k60-60s.mp4')
  await copyFile(path.join(outputsDir, `${shortId}.mp4`), shortOut)
  console.log(`Wrote ${shortOut}`)

  const composed1080 = path.join(OUT, 'artwork-1080.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    composed,
    '-vf',
    'scale=1920:1080',
    '-frames:v',
    '1',
    composed1080,
  ])

  const longId = '00000000-0000-4000-8000-000000000041'
  const longDuration = Number(process.env.RIBO_CFR_LONG_SECONDS ?? 600)
  console.log(`Encoding ${longDuration}s 1080p60 Optimized CFR (long sample)…`)
  await renderScreensaver(
    {
      id: longId,
      mediaPath: composed1080,
      mediaKind: 'image',
      mode: 'static',
      width: 1920,
      height: 1080,
      fps: 60,
      duration: longDuration,
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
      renderingMode: 'optimized-cfr',
      cfrQuality: 'balanced',
      compositionPath: composed1080,
      subscribeAnimation: settings,
      animationDir: animDir,
      animationOverlayX: Math.round((1920 - 420) / 2),
      animationOverlayY: 1080 - 120 - 32,
    },
    {
      cancelled: () => false,
      onProgress: (p, m) => {
        if (Math.round(p * 20) !== Math.round((p - 0.01) * 20)) console.log(`  ${Math.round(p * 100)}% ${m ?? ''}`)
      },
      onStatus: (s, m) => console.log(`  [${s}] ${m}`),
      registerKill: () => undefined,
    },
  )
  const longOut = path.join(OUT, `youtube-production-cfr-1080p60-${longDuration}s.mp4`)
  await copyFile(path.join(outputsDir, `${longId}.mp4`), longOut)
  console.log(`Wrote ${longOut}`)
  console.log('Upload the 4K60 60s file for YouTube Stats for Nerds validation.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
