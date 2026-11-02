import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SubscribeAnimationSettings } from '../../shared/screensaverSubscribeAnimation'
import type { EncoderId } from './encoders'
import { n, RenderCancelled, spawnFfmpeg, verifyVideoOutput } from './ffmpegUtil'
import { audioFilterLine } from './screensaverGraph'
import type { ScreensaverRenderHooks } from './renderScreensaver'

export interface HybridJob {
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
  subscribeAnimation: SubscribeAnimationSettings
  animationDir: string
  animationOverlayX: number
  animationOverlayY: number
}

interface ChosenEncoder {
  id: EncoderId
  label: string
  hardware: boolean
  args: string[]
}

export async function renderScreensaverHybrid(
  job: HybridJob,
  encoder: ChosenEncoder,
  outputPath: string,
  workDir: string,
  hooks: ScreensaverRenderHooks,
  inheritedWarning: string | null,
): Promise<{ outputPath: string; bytes: number; duration: number; warning: string | null }> {
  if (hooks.cancelled()) throw new RenderCancelled()
  hooks.onStatus('rendering', 'Encoding subscribe animation segments')
  const startSec = job.subscribeAnimation.startSec
  const animSec = job.subscribeAnimation.durationSec
  const tailSec = job.duration - startSec - animSec
  if (tailSec < -0.01) throw new Error('Subscribe animation does not fit in the export duration.')

  const segA = path.join(workDir, 'seg-a.mp4')
  const segB = path.join(workDir, 'seg-b.mp4')
  const segC = path.join(workDir, 'seg-c.mp4')
  const concatList = path.join(workDir, 'segments.txt')
  const videoOnly = path.join(workDir, 'video-only.mp4')
  let warning = inheritedWarning

  try {
    if (startSec >= 0.05) {
      await encodeStaticSegment(job, encoder, segA, startSec, hooks, 0.33)
    }
    await encodeAnimationSegment(job, encoder, segB, animSec, hooks, 0.66)
    if (tailSec >= 0.05) {
      await encodeStaticSegment(job, encoder, segC, tailSec, hooks, 0.9)
    }
    if (hooks.cancelled()) throw new RenderCancelled()

    const entries: string[] = []
    if (startSec >= 0.05) entries.push(`file '${segA.replace(/\\/g, '/')}'`)
    entries.push(`file '${segB.replace(/\\/g, '/')}'`)
    if (tailSec >= 0.05) entries.push(`file '${segC.replace(/\\/g, '/')}'`)
    await writeFile(concatList, entries.join('\n'))
    try {
      await concatCopy(concatList, videoOnly, job.duration, hooks)
    } catch (error) {
      if (hooks.cancelled() || error instanceof RenderCancelled) throw error
      warning = warning
        ? `${warning} Segment concat copy failed; re-encoded with VFR.`
        : 'Segment concat copy failed; re-encoded with VFR.'
      await concatReencode(job, encoder, concatList, videoOnly, hooks)
    }

    await muxAudio(job, videoOnly, outputPath, workDir, hooks)
    if (hooks.cancelled()) throw new RenderCancelled()
    hooks.onStatus('verifying', 'Validating output')
    const expectAudio = wantsAudio(job)
    return { ...(await verifyVideoOutput(outputPath, job.width, job.height, job.duration, expectAudio)), warning }
  } finally {
    await rm(segA, { force: true }).catch(() => undefined)
    await rm(segB, { force: true }).catch(() => undefined)
    await rm(segC, { force: true }).catch(() => undefined)
    await rm(concatList, { force: true }).catch(() => undefined)
    await rm(videoOnly, { force: true }).catch(() => undefined)
  }
}

async function encodeStaticSegment(
  job: HybridJob,
  encoder: ChosenEncoder,
  output: string,
  durationSec: number,
  hooks: ScreensaverRenderHooks,
  progressCap: number,
): Promise<void> {
  const frameCount = Math.max(1, Math.round(durationSec))
  const args = [
    '-y',
    '-hide_banner',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loop',
    '1',
    '-framerate',
    '1',
    '-i',
    job.compositionPath,
    '-vf',
    `fps=1`,
    '-frames:v',
    String(frameCount),
    '-an',
    ...encoder.args,
    '-r',
    '1',
    '-movflags',
    '+faststart',
    output,
  ]
  await spawnFfmpeg(args, durationSec, wrapProgress(hooks, progressCap))
}

async function encodeAnimationSegment(
  job: HybridJob,
  encoder: ChosenEncoder,
  output: string,
  durationSec: number,
  hooks: ScreensaverRenderHooks,
  progressCap: number,
): Promise<void> {
  const filterPath = path.join(path.dirname(output), 'seg-b-filter.txt')
  const ox = job.animationOverlayX
  const oy = job.animationOverlayY
  const lines = [
    `[0:v]fps=30,trim=0:${n(durationSec)},setpts=PTS-STARTPTS[bg]`,
    `[1:v]format=rgba,fps=30[ov]`,
    `[bg][ov]overlay=${ox}:${oy}:format=auto[vout]`,
  ]
  await writeFile(filterPath, lines.join(';\n'))
  const args = [
    '-y',
    '-hide_banner',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    job.compositionPath,
    '-framerate',
    '30',
    '-start_number',
    '1',
    '-i',
    path.join(job.animationDir, '%04d.png'),
    '-filter_complex_script',
    filterPath,
    '-map',
    '[vout]',
    '-an',
    ...encoder.args,
    '-r',
    '30',
    '-t',
    n(durationSec + 0.02),
    '-movflags',
    '+faststart',
    output,
  ]
  await spawnFfmpeg(args, durationSec, wrapProgress(hooks, progressCap))
}

async function concatCopy(listPath: string, output: string, expectedDuration: number, hooks: ScreensaverRenderHooks): Promise<void> {
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
    '-c',
    'copy',
    '-fflags',
    '+genpts',
    '-movflags',
    '+faststart',
    output,
  ]
  await spawnFfmpeg(args, expectedDuration, hooks)
}

async function concatReencode(job: HybridJob, encoder: ChosenEncoder, listPath: string, output: string, hooks: ScreensaverRenderHooks): Promise<void> {
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
    ...encoder.args,
    '-fps_mode',
    'vfr',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output,
  ]
  await spawnFfmpeg(args, job.duration, hooks)
}

async function muxAudio(job: HybridJob, videoPath: string, outputPath: string, workDir: string, hooks: ScreensaverRenderHooks): Promise<void> {
  const args = ['-y', '-hide_banner', '-progress', 'pipe:1', '-nostats', '-i', videoPath]
  if (!wantsAudio(job)) {
    args.push('-map', '0:v:0', '-c:v', 'copy', '-an', '-t', n(job.duration + 0.05), '-movflags', '+faststart', outputPath)
    await spawnFfmpeg(args, job.duration, hooks)
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
        duration: job.duration,
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
        duration: job.duration,
        loopSamples: false,
      }),
    )
  }

  const filterPath = path.join(workDir, 'hybrid-audio.txt')
  await writeFile(filterPath, lines.join(';\n'))
  args.push('-filter_complex_script', filterPath, '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', n(job.duration + 0.05), '-movflags', '+faststart', outputPath)
  await spawnFfmpeg(args, job.duration, hooks)
}

function wantsAudio(job: HybridJob): boolean {
  if (job.audioVolume <= 0.001) return false
  if (job.audioMode === 'upload') return Boolean(job.musicPath)
  if (job.audioMode === 'source') return job.sourceHasAudio && job.mediaKind === 'video'
  return false
}

function wrapProgress(hooks: ScreensaverRenderHooks, cap: number): ScreensaverRenderHooks {
  return {
    ...hooks,
    onProgress: (progress, message) => hooks.onProgress(Math.min(cap, progress * cap), message),
  }
}
