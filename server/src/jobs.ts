import { rm } from 'node:fs/promises'
import path from 'node:path'
import { releaseClips, retainClips, jobsDir, outputsDir } from './storage'
import { renderProject, type RenderRequest } from './render'
import { renderScreensaver, type ScreensaverRenderRequest } from './renderScreensaver'

export type JobStatus = 'queued' | 'preparing' | 'rendering' | 'verifying' | 'done' | 'error' | 'cancelled'

export interface JobView {
  id: string
  status: JobStatus
  progress: number
  message: string
  error: string | null
  warning: string | null
  outputBytes: number | null
  outputDuration: number | null
  queuePosition: number
  downloadName: string
  encoder: string | null
  hardware: boolean | null
  encodeFps: number | null
  encodeSpeed: number | null
  elapsedSec: number | null
  etaSec: number | null
  stage: string | null
}

interface JobBase {
  id: string
  status: JobStatus
  progress: number
  message: string
  error: string | null
  warning: string | null
  outputBytes: number | null
  outputDuration: number | null
  outputPath: string | null
  downloadName: string
  cancelRequested: boolean
  kill: (() => void) | null
  createdAt: number
  encoderLabel: string | null
  hardware: boolean | null
  encodeFps: number | null
  encodeSpeed: number | null
  elapsedSec: number | null
  etaSec: number | null
  stage: string | null
  encodeStarted: number | null
}

interface RankingJob extends JobBase, RenderRequest {
  kind: 'ranking'
}

interface ScreensaverJob extends JobBase, ScreensaverRenderRequest {
  kind: 'screensaver'
  mediaId: string
}

type Job = RankingJob | ScreensaverJob

const jobs = new Map<string, Job>()
const queue: string[] = []
let pumping = false
let activeId: string | null = null

export function createJob(id: string, input: RenderRequest & { downloadName: string }): JobView {
  const job: RankingJob = {
    kind: 'ranking',
    ...input,
    id,
    status: 'queued',
    progress: 0,
    message: 'Waiting to render.',
    error: null,
    warning: null,
    outputBytes: null,
    outputDuration: null,
    outputPath: null,
    downloadName: input.downloadName,
    cancelRequested: false,
    kill: null,
    createdAt: Date.now(),
    ...emptyDiagnostics(),
  }
  jobs.set(id, job)
  retainClips(input.clips.map((clip) => clip.id))
  queue.push(id)
  void pump()
  return view(job)
}

export function createScreensaverJob(
  id: string,
  input: ScreensaverRenderRequest & { downloadName: string; mediaId: string },
): JobView {
  const job: ScreensaverJob = {
    kind: 'screensaver',
    ...input,
    id,
    status: 'queued',
    progress: 0,
    message: 'Waiting to render.',
    error: null,
    warning: null,
    outputBytes: null,
    outputDuration: null,
    outputPath: null,
    downloadName: input.downloadName,
    cancelRequested: false,
    kill: null,
    createdAt: Date.now(),
    ...emptyDiagnostics(),
  }
  jobs.set(id, job)
  retainClips([input.mediaId])
  queue.push(id)
  void pump()
  return view(job)
}

export function getJob(id: string): JobView | null {
  const job = jobs.get(id)
  return job ? view(job) : null
}

export function jobOutput(id: string): { path: string; name: string } | null {
  const job = jobs.get(id)
  if (!job || job.status !== 'done' || !job.outputPath) return null
  return { path: job.outputPath, name: `${job.downloadName}.mp4` }
}

const ACTIVE_STATUSES = new Set<JobStatus>(['queued', 'preparing', 'rendering', 'verifying'])

export function outputPathsInUse(): Set<string> {
  const keep = new Set<string>()
  for (const job of jobs.values()) {
    if (!job.outputPath || !ACTIVE_STATUSES.has(job.status)) continue
    keep.add(job.outputPath)
  }
  return keep
}

export function jobIdsInUse(): Set<string> {
  const keep = new Set<string>()
  for (const job of jobs.values()) {
    if (ACTIVE_STATUSES.has(job.status)) keep.add(job.id)
  }
  return keep
}

export async function dropJobOutput(jobId: string): Promise<void> {
  const job = jobs.get(jobId)
  const file = job?.outputPath ?? outputFile(jobId)
  await rm(file, { force: true }).catch(() => undefined)
  if (job) {
    job.outputPath = null
    job.outputBytes = null
    job.outputDuration = null
  }
}

export function cancelJob(id: string): JobView | null {
  const job = jobs.get(id)
  if (!job) return null
  if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return view(job)
  job.cancelRequested = true
  job.status = 'cancelled'
  job.message = 'Cancelling.'
  job.kill?.()
  return view(job)
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (queue.length > 0) {
      const id = queue.shift()
      if (!id) break
      const job = jobs.get(id)
      if (!job || job.status === 'cancelled') {
        if (job) await finish(job)
        continue
      }
      activeId = id
      try {
        const hooks = {
          cancelled: () => job.cancelRequested || job.status === 'cancelled',
          onProgress: (progress: number, message?: string) => {
            if (job.cancelRequested) return
            job.progress = progress
            if (message) job.message = message
            noteTiming(job)
          },
          onStats: (stats: { fps: number | null; speed: number | null }) => {
            if (job.cancelRequested) return
            job.encodeFps = stats.fps
            job.encodeSpeed = stats.speed
            noteTiming(job)
          },
          onEncode: (info: { encoder: string; hardware: boolean }) => {
            job.encoderLabel = info.encoder
            job.hardware = info.hardware
          },
          onStatus: (status: JobStatus, message: string) => {
            if (job.cancelRequested && status !== 'cancelled') return
            job.status = status
            job.message = message
            job.stage = stageLabel(status, message)
            if (status === 'rendering' && job.encodeStarted == null) job.encodeStarted = Date.now()
          },
          registerKill: (kill: () => void) => {
            job.kill = kill
            if (job.cancelRequested) kill()
          },
        }
        const result =
          job.kind === 'ranking'
            ? await renderProject(job, hooks)
            : await renderScreensaver(job, hooks)
        if (job.cancelRequested) {
          job.status = 'cancelled'
          job.message = 'Render cancelled.'
        } else {
          job.status = 'done'
          job.progress = 1
          job.stage = 'Completed'
          job.etaSec = 0
          job.message = 'Export verified.'
          job.warning = result.warning
          job.outputPath = result.outputPath
          job.outputBytes = result.bytes
          job.outputDuration = result.duration
        }
      } catch (error) {
        if (job.cancelRequested || (error instanceof Error && error.name === 'RenderCancelled')) {
          job.status = 'cancelled'
          job.message = 'Render cancelled.'
          job.error = null
        } else {
          job.status = 'error'
          job.progress = 0
          job.error = error instanceof Error ? error.message : 'Rendering failed.'
          job.message = job.error
        }
      } finally {
        activeId = null
        job.kill = null
        await finish(job)
      }
    }
  } finally {
    pumping = false
  }
}

async function finish(job: Job): Promise<void> {
  if (job.kind === 'ranking') {
    releaseClips(job.clips.map((clip) => clip.id))
  } else {
    releaseClips([job.mediaId])
  }
  const dir = path.join(jobsDir, job.id)
  await rm(dir, { recursive: true, force: true })
  if (job.status !== 'done' && job.outputPath) {
    await rm(job.outputPath, { force: true })
    job.outputPath = null
  }
}

function view(job: Job): JobView {
  let queuePosition = 0
  if (job.status === 'queued') {
    const index = queue.indexOf(job.id)
    queuePosition = index === -1 ? 1 : index + 1
    if (activeId) queuePosition += 0
  }
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    warning: job.warning,
    outputBytes: job.outputBytes,
    outputDuration: job.outputDuration,
    queuePosition,
    downloadName: job.downloadName,
    encoder: job.encoderLabel,
    hardware: job.hardware,
    encodeFps: job.encodeFps,
    encodeSpeed: job.encodeSpeed,
    elapsedSec: job.elapsedSec,
    etaSec: job.etaSec,
    stage: job.stage,
  }
}

function emptyDiagnostics(): Pick<JobBase, 'encoderLabel' | 'hardware' | 'encodeFps' | 'encodeSpeed' | 'elapsedSec' | 'etaSec' | 'stage' | 'encodeStarted'> {
  return {
    encoderLabel: null,
    hardware: null,
    encodeFps: null,
    encodeSpeed: null,
    elapsedSec: null,
    etaSec: null,
    stage: null,
    encodeStarted: null,
  }
}

function noteTiming(job: Job): void {
  if (job.encodeStarted == null) return
  const elapsed = (Date.now() - job.encodeStarted) / 1000
  job.elapsedSec = Math.round(elapsed * 10) / 10
  if (job.progress > 0.02 && elapsed > 2) {
    job.etaSec = Math.round((elapsed * (1 - job.progress)) / job.progress)
  } else {
    job.etaSec = null
  }
}

function stageLabel(status: JobStatus, message: string): string {
  if (status === 'preparing') return 'Preparing media'
  if (status === 'rendering') return 'Encoding'
  if (status === 'verifying') return 'Validating output'
  if (status === 'done') return 'Completed'
  return message
}

export function outputFile(id: string): string {
  return path.join(outputsDir, `${id}.mp4`)
}
