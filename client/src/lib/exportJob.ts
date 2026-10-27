import { frameMetrics } from '@shared/frame'
import { cancelJob, startExport } from './api'
import { pollJobUntilDone, type JobPollUpdate } from './jobPoll'
import { drawOverlay, ensureFonts } from './drawOverlay'
import { overlayRanks } from './format'
import { playbackOrder } from './order'
import type { Clip, ExportState, ProjectStyle, TitleSpan } from '../types'

export type ExportUpdate = JobPollUpdate & { phase?: ExportState['phase'] }

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
  const metrics = frameMetrics(
    input.style.video.width,
    input.style.video.height,
    input.style.banner.visible === false ? 0 : input.style.banner.height,
  )
  input.onUpdate({ phase: 'overlays', progress: 0.02, message: 'Drawing the title and rankings.', error: null, warning: null, downloadUrl: null })
  await ensureFonts()
  if (input.signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
  const canvas = document.createElement('canvas')
  canvas.width = metrics.width
  canvas.height = metrics.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot draw the title overlay.')

  const sequence = playbackOrder(input.clips)
  const overlays: Blob[] = []
  for (let index = 0; index < sequence.length; index += 1) {
    const clip = sequence[index]
    if (!clip) continue
    const listIndex = input.clips.findIndex((item) => item.id === clip.id)
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
        listIndex,
        input.style.ranking.format,
        input.style.ranking.color,
        input.style.caption.enabled,
        input.style.ranking.display,
        input.style.caption.color,
        input.style.ranking.pageStyle,
        input.style.ranking.showPreviousTitles,
        input.style.ranking.sort,
      ),
    })
    overlays.push(await canvasToPng(canvas))
    input.onUpdate({ progress: 0.02 + ((index + 1) / sequence.length) * 0.06 })
    if (input.signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
  }

  const body = new FormData()
  body.append(
    'project',
    JSON.stringify({
      filename: input.filename,
      clips: sequence.map((clip) => ({
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
        encoder: input.style.video.encoder,
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

  try {
    await pollJobUntilDone(started.jobId, input.signal, (patch) => {
      input.onUpdate(patch as ExportUpdate)
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      input.onUpdate({ phase: 'cancelled', message: 'Export cancelled.', error: null })
      return
    }
    throw error
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

