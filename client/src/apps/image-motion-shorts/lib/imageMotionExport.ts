import type { ImageMotionProject, ImageMotionSegment } from '@shared/imageMotion'
import { cancelJob, startImageMotionExport } from '../../../lib/api'
import type { JobPollUpdate } from '../../../lib/jobPoll'

export async function submitImageMotionExport(input: {
  filename: string
  project: ImageMotionProject
  segments: ImageMotionSegment[]
  musicFile: File | null
  signal: AbortSignal
  onUpdate: (patch: JobPollUpdate) => void
}): Promise<string> {
  const body = new FormData()
  body.append(
    'project',
    JSON.stringify({
      filename: input.filename,
      name: input.project.name,
      video: input.project.video,
      audio: input.project.audio,
      segments: input.segments.map((s) => ({
        serverId: s.serverId,
        width: s.width,
        height: s.height,
        motion: s.motion,
        transitionAfter: s.transitionAfter,
      })),
    }),
  )
  if (input.musicFile && input.project.audio.musicVolume > 0) {
    body.append('music', input.musicFile, input.musicFile.name)
  }
  input.onUpdate({ phase: 'uploading', progress: 0.12, message: 'Uploading export settings.' })
  const { jobId } = await startImageMotionExport(body, () => undefined, input.signal)
  if (input.signal.aborted) {
    await cancelJob(jobId)
    throw new DOMException('The export was cancelled.', 'AbortError')
  }
  input.onUpdate({ phase: 'queued', progress: 0.18, message: 'Waiting in the render queue.' })
  return jobId
}
