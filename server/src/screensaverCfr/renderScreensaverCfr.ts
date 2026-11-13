import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  type ScreensaverCfrQuality,
} from '../../../shared/screensaver'
import {
  SUBSCRIBE_ANIMATION_FPS,
  type SubscribeAnimationSettings,
} from '../../../shared/screensaverSubscribeAnimation'
import type { EncoderId } from '../encoders'
import { n, RenderCancelled, spawnFfmpeg, verifyVideoOutput } from '../ffmpegUtil'
import { audioFilterLine } from '../screensaverGraph'
import type { ScreensaverRenderHooks } from '../renderScreensaver'
import {
  cfrLibx264Args,
  resolveCfrEncodeSettings,
  type CfrEncodeSettings,
} from './encodingConfig'
import {
  animationFingerprint,
  compositionContentHash,
  createSegmentCache,
  dynamicSegmentCacheKey,
  staticSegmentCacheKey,
  type SegmentCache,
} from './segmentCache'
import {
  buildCfrTimeline,
  planStaticSegments,
  selectPreferredSegmentSeconds,
  staticRuns,
  type CfrTimeline,
} from './timeline'
import { validateCfrPackets } from './validate'

export interface CfrJob {
  id: string
  width: number
  height: number
  fps: number
  duration: number
  compositionPath: string
  musicPath: string | null
  mediaPath: string
  mediaKind: 'image' | 'video'
  audioMode: 'none' | 'source' | 'upload'
  audioVolume: number
  audioFadeIn: number
  audioFadeOut: number
  loopAudio: boolean
  sourceHasAudio: boolean
  subscribeAnimation: SubscribeAnimationSettings | null
  animationDir: string | null
  animationOverlayX: number
  animationOverlayY: number
  cfrQuality: ScreensaverCfrQuality
}

interface ChosenEncoder {
  id: EncoderId
  label: string
  hardware: boolean
  args: string[]
}

interface ProgressWeights {
  prepare: number
  encode: number
  assemble: number
  audio: number
  validate: number
}

const WEIGHTS: ProgressWeights = {
  prepare: 0.05,
  encode: 0.55,
  assemble: 0.15,
  audio: 0.1,
  validate: 0.15,
}

export async function renderScreensaverCfr(
  job: CfrJob,
  _encoder: ChosenEncoder,
  outputPath: string,
  workDir: string,
  hooks: ScreensaverRenderHooks,
  inheritedWarning: string | null,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('preparing', 'Preparing timeline')
  report(hooks, 0, 'Preparing timeline')

  const settings = resolveCfrEncodeSettings(job.cfrQuality, job.fps, job.width, job.height)
  const compositionHash = await compositionContentHash(job.compositionPath)
  const timeline = buildCfrTimeline({
    fps: job.fps,
    durationSec: job.duration,
    compositionKey: compositionHash,
    subscribeAnimation: job.subscribeAnimation,
  })

  const cache = await createSegmentCache(workDir)
  const segmentsDir = path.join(workDir, 'cfr-segments')
  await mkdir(segmentsDir, { recursive: true })

  let warning = inheritedWarning
  const concatEntries: string[] = []
  const boundaryIndexes: number[] = [0]
  let cursor = 0
  let framesEncoded = 0
  let encodeDone = 0
  const encodeTotal = estimateEncodeUnits(timeline, job.fps)

  try {
    report(hooks, WEIGHTS.prepare, 'Rendering artwork')

    for (const region of timeline.regions) {
      if (hooks.cancelled()) throw new RenderCancelled()
      if (region.kind === 'static') {
        const preferredSec = selectPreferredSegmentSeconds(region.frameCount, job.fps, 1)
        const plan = planStaticSegments(region.frameCount, job.fps, preferredSec)
        for (const frameCount of plan.uniqueFrameCounts) {
          await ensureStaticSegment({
            job,
            settings,
            cache,
            segmentsDir,
            compositionHash,
            frameCount,
            hooks,
            onEncoded: () => {
              framesEncoded += frameCount
              encodeDone += 1
              const ratio = WEIGHTS.prepare + WEIGHTS.encode * Math.min(1, encodeDone / Math.max(1, encodeTotal))
              report(hooks, ratio, 'Rendering static segments')
            },
          })
        }
        for (const frameCount of plan.references) {
          const key = staticSegmentCacheKey({ compositionHash, settings, frameCount, still: true })
          const file = await cache.get(key)
          if (!file) throw new Error(`Missing cached static segment (${frameCount} frames).`)
          concatEntries.push(file)
          cursor += frameCount
          boundaryIndexes.push(cursor)
        }
      } else {
        if (!job.animationDir || !job.subscribeAnimation) {
          throw new Error('Subscribe animation frames are missing.')
        }
        const file = await ensureDynamicSegment({
          job,
          settings,
          cache,
          segmentsDir,
          compositionHash,
          frameCount: region.frameCount,
          hooks,
          onEncoded: () => {
            framesEncoded += region.frameCount
            encodeDone += 1
            const ratio = WEIGHTS.prepare + WEIGHTS.encode * Math.min(1, encodeDone / Math.max(1, encodeTotal))
            report(hooks, ratio, 'Rendering animated segments')
          },
        })
        concatEntries.push(file)
        cursor += region.frameCount
        boundaryIndexes.push(cursor)
      }
    }

    if (cursor !== timeline.totalFrames) {
      throw new Error(`Assembled ${cursor} frames, expected ${timeline.totalFrames}.`)
    }
    // Last boundary is end-of-file, not a segment start.
    boundaryIndexes.pop()

    if (hooks.cancelled()) throw new RenderCancelled()
    hooks.onStatus('rendering', 'Assembling video')
    report(hooks, WEIGHTS.prepare + WEIGHTS.encode, 'Assembling video')

    const videoOnly = path.join(workDir, 'cfr-video.mp4')
    const listPath = path.join(workDir, 'cfr-segments.ffconcat')
    await writeConcatManifest(listPath, concatEntries)
    await concatCopy(listPath, videoOnly, settings, timeline.durationSeconds, hooks, WEIGHTS.prepare + WEIGHTS.encode, WEIGHTS.assemble)

    if (hooks.cancelled()) throw new RenderCancelled()
    hooks.onStatus('rendering', 'Processing audio')
    report(hooks, WEIGHTS.prepare + WEIGHTS.encode + WEIGHTS.assemble, 'Processing audio')
    await muxAudio(job, videoOnly, outputPath, workDir, timeline.durationSeconds, hooks)

    if (hooks.cancelled()) throw new RenderCancelled()
    hooks.onStatus('verifying', 'Validating output')
    report(hooks, 1 - WEIGHTS.validate, 'Validating output')
    const expectAudio = wantsAudio(job)
    const validation = await validateCfrPackets(outputPath, {
      fps: job.fps,
      expectedFrames: timeline.totalFrames,
      expectedDurationSec: timeline.durationSeconds,
      width: job.width,
      height: job.height,
      boundaryIndexes,
      expectAudio,
      onProgress: (ratio) => report(hooks, 1 - WEIGHTS.validate + WEIGHTS.validate * ratio, 'Validating output'),
    })
    if (!validation.ok) {
      throw new Error(`Optimized CFR validation failed: ${validation.reasons.join(' ')}`)
    }

    const verified = await verifyVideoOutput(outputPath, job.width, job.height, timeline.durationSeconds, expectAudio)
    report(hooks, 1, 'Completed')
    if (framesEncoded > 0) {
      warning = joinWarning(
        warning,
        `Optimized CFR encoded ${framesEncoded} unique frames for ${timeline.totalFrames} output frames.`,
      )
    }
    return { ...verified, warning }
  } finally {
    await rm(path.join(workDir, 'cfr-video.mp4'), { force: true }).catch(() => undefined)
    await rm(path.join(workDir, 'cfr-segments.ffconcat'), { force: true }).catch(() => undefined)
  }
}

function estimateEncodeUnits(timeline: CfrTimeline, fps: number): number {
  let units = 0
  for (const run of staticRuns(timeline)) {
    const preferredSec = selectPreferredSegmentSeconds(run.frameCount, fps, 1)
    units += planStaticSegments(run.frameCount, fps, preferredSec).uniqueFrameCounts.length
  }
  units += timeline.regions.filter((region) => region.kind === 'dynamic').length
  return Math.max(1, units)
}

async function ensureStaticSegment(options: {
  job: CfrJob
  settings: CfrEncodeSettings
  cache: SegmentCache
  segmentsDir: string
  compositionHash: string
  frameCount: number
  hooks: ScreensaverRenderHooks
  onEncoded: () => void
}): Promise<string> {
  const key = staticSegmentCacheKey({
    compositionHash: options.compositionHash,
    settings: options.settings,
    frameCount: options.frameCount,
    still: true,
  })
  const cached = await options.cache.get(key)
  if (cached) {
    options.onEncoded()
    return cached
  }
  if (options.hooks.cancelled()) throw new RenderCancelled()
  const output = path.join(options.segmentsDir, `static-${options.frameCount}.mp4`)
  const args = [
    '-y',
    '-hide_banner',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loop',
    '1',
    '-framerate',
    String(options.settings.fps),
    '-i',
    options.job.compositionPath,
    '-vf',
    `fps=${options.settings.fps},setsar=1`,
    '-frames:v',
    String(options.frameCount),
    '-an',
    ...cfrLibx264Args(options.settings, true),
    '-movflags',
    '+faststart',
    output,
  ]
  const expectedSec = options.frameCount / options.settings.fps
  await spawnFfmpeg(args, expectedSec, options.hooks)
  const stored = await options.cache.put(key, output)
  options.onEncoded()
  return stored
}

async function ensureDynamicSegment(options: {
  job: CfrJob
  settings: CfrEncodeSettings
  cache: SegmentCache
  segmentsDir: string
  compositionHash: string
  frameCount: number
  hooks: ScreensaverRenderHooks
  onEncoded: () => void
}): Promise<string> {
  // PNGs are always authored at SUBSCRIBE_ANIMATION_FPS; output may be another CFR rate.
  const pngCount = Math.max(
    1,
    Math.round((options.frameCount / options.settings.fps) * SUBSCRIBE_ANIMATION_FPS),
  )
  const animFingerprint = await animationFingerprint(options.job.animationDir!, pngCount)
  const key = dynamicSegmentCacheKey({
    compositionHash: options.compositionHash,
    animationFingerprint: animFingerprint,
    settings: options.settings,
    frameCount: options.frameCount,
    overlayX: options.job.animationOverlayX,
    overlayY: options.job.animationOverlayY,
  })
  const cached = await options.cache.get(key)
  if (cached) {
    options.onEncoded()
    return cached
  }
  if (options.hooks.cancelled()) throw new RenderCancelled()

  const filterPath = path.join(options.segmentsDir, `anim-${options.frameCount}-filter.txt`)
  const ox = options.job.animationOverlayX
  const oy = options.job.animationOverlayY
  const outFps = String(options.settings.fps)
  const srcFps = String(SUBSCRIBE_ANIMATION_FPS)
  const durationSec = options.frameCount / options.settings.fps
  const lines = [
    `[0:v]fps=${outFps},trim=0:${n(durationSec)},setpts=PTS-STARTPTS,setsar=1[bg]`,
    `[1:v]format=rgba,fps=${outFps}[ov]`,
    `[bg][ov]overlay=${ox}:${oy}:format=auto[vout]`,
  ]
  await writeFile(filterPath, lines.join(';\n'))
  const output = path.join(options.segmentsDir, `anim-${options.frameCount}.mp4`)
  const args = [
    '-y',
    '-hide_banner',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loop',
    '1',
    '-framerate',
    outFps,
    '-i',
    options.job.compositionPath,
    '-framerate',
    srcFps,
    '-start_number',
    '1',
    '-i',
    path.join(options.job.animationDir!, '%04d.png'),
    '-filter_complex_script',
    filterPath,
    '-map',
    '[vout]',
    '-an',
    '-frames:v',
    String(options.frameCount),
    ...cfrLibx264Args(options.settings, false),
    '-movflags',
    '+faststart',
    output,
  ]
  await spawnFfmpeg(args, durationSec, options.hooks)
  const stored = await options.cache.put(key, output)
  options.onEncoded()
  return stored
}

async function writeConcatManifest(listPath: string, files: string[]): Promise<void> {
  const lines = ['ffconcat version 1.0']
  for (const file of files) {
    lines.push(`file '${escapeConcatPath(file)}'`)
  }
  await writeFile(listPath, `${lines.join('\n')}\n`)
}

function escapeConcatPath(file: string): string {
  return file.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

async function concatCopy(
  listPath: string,
  output: string,
  settings: CfrEncodeSettings,
  expectedDuration: number,
  hooks: ScreensaverRenderHooks,
  progressBase: number,
  progressSpan: number,
): Promise<void> {
  const args = [
    '-y',
    '-hide_banner',
    '-progress',
    'pipe:1',
    '-nostats',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
    '-video_track_timescale',
    String(settings.timescale),
    '-movflags',
    '+faststart',
    output,
  ]
  if (!args.includes('copy') || args.some((arg) => arg.includes('libx264') || arg.startsWith('h264_'))) {
    throw new Error('CFR assembly must use stream copy.')
  }
  await spawnFfmpeg(args, expectedDuration, {
    ...hooks,
    onProgress: (progress, message) => hooks.onProgress(progressBase + progress * progressSpan, message ?? 'Assembling video'),
  })
}

async function muxAudio(
  job: CfrJob,
  videoPath: string,
  outputPath: string,
  workDir: string,
  durationSec: number,
  hooks: ScreensaverRenderHooks,
): Promise<void> {
  const args = ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats', '-i', videoPath]
  if (!wantsAudio(job)) {
    args.push(
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-an',
      '-t',
      n(durationSec + 0.02),
      '-movflags',
      '+faststart',
      outputPath,
    )
    await spawnFfmpeg(args, durationSec, hooks)
    return
  }

  const lines: string[] = []
  if (job.audioMode === 'upload' && job.musicPath) {
    if (job.loopAudio) args.push('-stream_loop', '-1')
    args.push('-i', job.musicPath)
    lines.push(
      audioFilterLine({
        inputLabel: '1:a',
        volume: job.audioVolume,
        fadeIn: job.audioFadeIn,
        fadeOut: job.audioFadeOut,
        duration: durationSec,
        loopSamples: false,
      }),
    )
  } else if (job.audioMode === 'source' && job.sourceHasAudio) {
    args.push('-stream_loop', '-1', '-i', job.mediaPath)
    lines.push(
      audioFilterLine({
        inputLabel: '1:a',
        volume: job.audioVolume,
        fadeIn: job.audioFadeIn,
        fadeOut: job.audioFadeOut,
        duration: durationSec,
        loopSamples: false,
      }),
    )
  }

  const filterPath = path.join(workDir, 'cfr-audio.txt')
  await writeFile(filterPath, lines.join(';\n'))
  args.push(
    '-filter_complex_script',
    filterPath,
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-t',
    n(durationSec + 0.02),
    '-movflags',
    '+faststart',
    outputPath,
  )
  await spawnFfmpeg(args, durationSec, hooks)
}

function wantsAudio(job: CfrJob): boolean {
  if (job.audioVolume <= 0.001) return false
  if (job.audioMode === 'upload') return Boolean(job.musicPath)
  if (job.audioMode === 'source') return job.sourceHasAudio && job.mediaKind === 'video'
  return false
}

function report(hooks: ScreensaverRenderHooks, progress: number, message: string): void {
  hooks.onProgress(Math.max(0, Math.min(0.99, progress)), message)
}

function joinWarning(current: string | null, next: string): string {
  return current ? `${current} ${next}` : next
}
