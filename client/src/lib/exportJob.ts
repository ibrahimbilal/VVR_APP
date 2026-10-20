import { frameMetrics } from '@shared/frame'
import { cancelJob, getJob, startExport, type JobStatus } from './api'
import { drawOverlay, ensureFonts } from './drawOverlay'
import { overlayRanks } from './format'
import type { Clip, ExportState, ProjectStyle, TitleSpan } from '../types'

export interface ExportUpdate {
  phase?: ExportState['phase']
  progress?: number
  message?: string
  error?: string | null
  warning?: string | null
  downloadUrl?: string | null
  bytes?: number | null
  jobId?: string | null
}

interface ExportInput {
  filename: string
  clips: Clip[]
  style: ProjectStyle
  spans: TitleSpan[]
  musicFile: File | null
  signal: AbortSignal
  onUpdate: (patch: ExportUpdate) => void
}

export async function runExport(input: ExportInput): Promise<void> {
  const metrics = frameMetrics(input.style.video.width, input.style.video.height, input.style.banner.height)
  input.onUpdate({ phase: 'overlays', progress: 0.02, message: 'Drawing the title and rankings.', error: null, warning: null, downloadUrl: null })
  await ensureFonts()
  if (input.signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
  const canvas = document.createElement('canvas')
  canvas.width = metrics.width
  canvas.height = metrics.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot draw the title overlay.')

  const overlays: Blob[] = []
  for (let index = 0; index < input.clips.length; index += 1) {
    const clip = input.clips[index]
    if (!clip) continue
    drawOverlay(context, {
      width: metrics.width,
      height: metrics.height,
      bannerHeight: metrics.bannerHeight,
      banner: input.style.banner,
      spans: input.spans,
      ranking: input.style.ranking,
      caption: input.style.caption,
      ranks: overlayRanks(
        input.clips,
        index,
        input.style.ranking.format,
        input.style.ranking.color,
        input.style.caption.enabled,
        input.style.ranking.display,
        input.style.caption.color,
        input.style.ranking.pageStyle,
      ),
    })
    overlays.push(await canvasToPng(canvas))
    input.onUpdate({ progress: 0.02 + ((index + 1) / input.clips.length) * 0.06 })
    if (input.signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
  }

  const body = new FormData()
  body.append(
    'project',
    JSON.stringify({
      filename: input.filename,
      clips: input.clips.map((clip) => ({
        id: clip.serverId,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
      })),
      video: {
        width: metrics.width,
        height: metrics.height,
        fps: input.style.video.fps,
        bannerHeight: metrics.bannerHeight,
        bannerColor: input.style.banner.background,
        scaleMode: input.style.video.scaleMode,
        backgroundColor: input.style.video.backgroundColor,
        transition: input.style.video.transition,
        fadeDuration: input.style.video.fadeDuration,
        keepAudio: input.style.video.keepAudio,
        normalize: input.style.video.normalize,
        originalVolume: input.style.video.originalVolume,
        musicVolume: input.style.video.musicVolume,
      },
    }),
  )
  overlays.forEach((overlay, index) => body.append('overlays', overlay, `overlay-${index}.png`))
  if (input.musicFile && input.style.video.musicVolume > 0) body.append('music', input.musicFile, input.musicFile.name)

  input.onUpdate({ phase: 'uploading', progress: 0.09, message: 'Sending overlays to the renderer.' })
  const started = await startExport(body, (fraction) => {
    input.onUpdate({ progress: 0.09 + fraction * 0.07 })
  }, input.signal)
  if (input.signal.aborted) {
    await cancelJob(started.jobId)
    throw new DOMException('The export was cancelled.', 'AbortError')
  }

  const onAbort = () => {
    void cancelJob(started.jobId)
  }
  input.signal.addEventListener('abort', onAbort)
  try {
    let latest: JobStatus | null = null
    while (!input.signal.aborted) {
      latest = await getJob(started.jobId)
      input.onUpdate(updateFromJob(latest))
      if (latest.status === 'done' || latest.status === 'error' || latest.status === 'cancelled') break
      await wait(700, input.signal)
    }
    if (input.signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
    if (!latest || latest.status === 'cancelled') {
      input.onUpdate({ phase: 'cancelled', message: 'Export cancelled.', error: null })
      return
    }
    if (latest.status === 'error') throw new Error(latest.error || 'Rendering failed.')
    input.onUpdate({
      phase: 'done',
      progress: 1,
      message: 'Export verified.',
      downloadUrl: `/api/jobs/${latest.id}/download`,
      bytes: latest.outputBytes,
      warning: latest.warning,
      jobId: latest.id,
      error: null,
    })
  } finally {
    input.signal.removeEventListener('abort', onAbort)
  }
}

function updateFromJob(job: JobStatus): ExportUpdate {
  let progress = 0.16
  if (job.status === 'preparing') progress = 0.2
  if (job.status === 'rendering') progress = 0.2 + job.progress * 0.75
  if (job.status === 'verifying') progress = 0.97
  if (job.status === 'done') progress = 1
  const phase = job.status === 'queued' ? 'queued' : job.status
  return {
    phase,
    progress,
    message: job.queuePosition > 1 ? `Waiting in the render queue (position ${job.queuePosition}).` : job.message,
    error: job.error,
    warning: job.warning,
    jobId: job.id,
    bytes: job.outputBytes,
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not draw the title overlay.'))
    }, 'image/png')
  })
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('The export was cancelled.', 'AbortError'))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
