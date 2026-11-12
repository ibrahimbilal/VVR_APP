import { fetchJob, listRecoverableJobs, type JobStatus } from './api'
import { exportStateFromPoll } from './exportState'
import { mapJobToProgress, pollJobUntilDone, type JobPollUpdate } from './jobPoll'
import { forgetRenderJob, loadPersistedRenderJobs, rememberRenderJob, type PersistedRenderJob } from './persistedRenderJobs'
import { notifyRenderOutcome, notifyRenderReady, type RenderAppId } from './renderNotifications'
import { publishScreensaverRender } from '../apps/frame-screensaver/lib/screensaverProjectEvents'
import {
  beginTrackedRender,
  endTrackedRender,
  registerRenderCancel,
  syncTrackedRender,
  unregisterRenderCancel,
} from './renderJobTracking'
import { usePlatformStore } from '../stores/platform'

type JobMeta = {
  app: RenderAppId
  projectName: string
  downloadFilename: string
  projectId: string | null
}

const following = new Set<string>()

export async function resumePersistedRenderJobs(): Promise<void> {
  const platform = usePlatformStore()
  if (!platform.serverOnline) {
    await platform.refreshServer()
  }
  if (!platform.serverOnline) return

  const persistedById = new Map(loadPersistedRenderJobs().map((item) => [item.serverJobId, item]))
  let serverJobs: JobStatus[] = []
  try {
    serverJobs = await listRecoverableJobs()
  } catch {
    serverJobs = []
  }

  const ids = new Set<string>([...persistedById.keys(), ...serverJobs.map((job) => job.id)])
  if (ids.size === 0) return

  let inProgress = 0
  for (const serverJobId of ids) {
    if (following.has(serverJobId)) continue
    const persisted = persistedById.get(serverJobId)
    const listed = serverJobs.find((job) => job.id === serverJobId)
    let job: JobStatus | null = listed ?? null
    if (!job) {
      try {
        job = await fetchJob(serverJobId)
      } catch {
        continue
      }
    }
    if (!job) {
      if (persisted?.projectId) {
        publishScreensaverRender({
          projectId: persisted.projectId,
          trackId: `resume:${serverJobId}`,
          phase: 'error',
          progress: 0,
          error: 'The render is no longer on the server.',
          jobId: serverJobId,
          downloadUrl: null,
          filename: persisted.downloadFilename,
        })
      }
      if (persisted) forgetRenderJob(serverJobId)
      continue
    }

    const meta = resolveJobMeta(job, persisted)
    if (!meta) {
      forgetRenderJob(serverJobId)
      continue
    }

    if (job.status === 'error' || job.status === 'cancelled') {
      if (meta.projectId) {
        publishScreensaverRender({
          projectId: meta.projectId,
          trackId: `resume:${serverJobId}`,
          phase: job.status,
          progress: job.progress,
          error: job.error,
          jobId: serverJobId,
          downloadUrl: null,
          filename: meta.downloadFilename,
        })
        notifyRenderOutcome(
          meta.app,
          meta.projectName,
          job.status === 'cancelled' ? 'cancelled' : 'failed',
          `resume:${serverJobId}`,
          meta.projectId,
          job.error,
        )
      }
      forgetRenderJob(serverJobId)
      continue
    }

    if (job.status === 'done') {
      finishReadyExport(meta, job)
      forgetRenderJob(serverJobId)
      continue
    }

    if (!persisted) {
      rememberRenderJob({
        serverJobId,
        app: meta.app,
        projectName: meta.projectName,
        downloadFilename: meta.downloadFilename,
        projectId: meta.projectId,
      })
    }

    following.add(serverJobId)
    inProgress += 1
    void followServerJob(serverJobId, meta)
  }

  if (inProgress > 0) {
    platform.toast(
      inProgress === 1
        ? 'Reconnected to an export that was still running on the renderer.'
        : `Reconnected to ${inProgress} exports still on the renderer.`,
      'info',
    )
  }
}

function resolveJobMeta(job: JobStatus, persisted?: PersistedRenderJob): JobMeta | null {
  if (persisted) {
    return {
      app: persisted.app,
      projectName: persisted.projectName,
      downloadFilename: persisted.downloadFilename,
      projectId: persisted.projectId ?? null,
    }
  }
  const app = appFromJobKind(job.kind)
  if (!app) return null
  const name = job.downloadName.trim() || 'Untitled project'
  const ext = job.outputExt?.startsWith('.') ? job.outputExt : app === 'audio-looper' ? '.mp3' : '.mp4'
  return {
    app,
    projectName: name,
    downloadFilename: `${name}${ext}`,
    projectId: null,
  }
}

function appFromJobKind(kind: JobStatus['kind']): RenderAppId | null {
  if (kind === 'screensaver') return 'screensaver'
  if (kind === 'audio-looper') return 'audio-looper'
  if (kind === 'ranking') return 'ranking'
  if (kind === 'image-motion') return 'image-motion'
  return null
}

function finishReadyExport(meta: JobMeta, job: JobStatus, trackId?: string): void {
  if (meta.projectId) {
    publishScreensaverRender({
      projectId: meta.projectId,
      trackId: trackId ?? `resume:${job.id}`,
      phase: 'done',
      progress: 1,
      error: null,
      jobId: job.id,
      downloadUrl: `/api/jobs/${job.id}/download`,
      filename: meta.downloadFilename,
    })
  }
  notifyRenderReady(
    meta.app,
    meta.projectName,
    `/api/jobs/${job.id}/download`,
    meta.downloadFilename,
    trackId,
    meta.projectId,
  )
}

async function followServerJob(serverJobId: string, meta: JobMeta): Promise<void> {
  const trackId = beginTrackedRender(meta.app, meta.projectName, meta.projectId)
  const abort = new AbortController()
  registerRenderCancel(trackId, {
    abort: () => abort.abort(),
    getServerJobId: () => serverJobId,
  })

  const applyPoll = (patch: JobPollUpdate) => {
    const state = exportStateFromPoll(patch)
    syncTrackedRender(trackId, state)
    if (!meta.projectId) return
    publishScreensaverRender({
      projectId: meta.projectId,
      trackId,
      phase: state.phase,
      progress: state.progress,
      error: state.error,
      jobId: state.jobId ?? serverJobId,
      downloadUrl: state.downloadUrl,
      filename: meta.downloadFilename,
    })
  }

  try {
    const initial = await fetchJob(serverJobId)
    if (!initial || initial.status === 'error' || initial.status === 'cancelled') {
      if (meta.projectId && initial) {
        publishScreensaverRender({
          projectId: meta.projectId,
          trackId,
          phase: initial.status === 'cancelled' ? 'cancelled' : 'error',
          progress: initial.progress,
          error: initial.error,
          jobId: serverJobId,
          downloadUrl: null,
          filename: meta.downloadFilename,
        })
        notifyRenderOutcome(
          meta.app,
          meta.projectName,
          initial.status === 'cancelled' ? 'cancelled' : 'failed',
          trackId,
          meta.projectId,
          initial.error,
        )
      }
      forgetRenderJob(serverJobId)
      return
    }
    if (initial.status === 'done') {
      finishReadyExport(meta, initial, trackId)
      forgetRenderJob(serverJobId)
      return
    }
    applyPoll(mapJobToProgress(initial))

    await pollJobUntilDone(serverJobId, abort.signal, applyPoll)
    finishReadyExport(meta, { ...initial, id: serverJobId, status: 'done' }, trackId)
    forgetRenderJob(serverJobId)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (meta.projectId) {
        publishScreensaverRender({
          projectId: meta.projectId,
          trackId,
          phase: 'cancelled',
          progress: 0,
          error: null,
          jobId: serverJobId,
          downloadUrl: null,
          filename: meta.downloadFilename,
        })
        notifyRenderOutcome(meta.app, meta.projectName, 'cancelled', trackId, meta.projectId, null)
      }
      forgetRenderJob(serverJobId)
      return
    }
    const platform = usePlatformStore()
    const text = error instanceof Error ? error.message : 'Export failed.'
    if (meta.projectId) {
      publishScreensaverRender({
        projectId: meta.projectId,
        trackId,
        phase: 'error',
        progress: 0,
        error: text,
        jobId: serverJobId,
        downloadUrl: null,
        filename: meta.downloadFilename,
      })
      notifyRenderOutcome(meta.app, meta.projectName, 'failed', trackId, meta.projectId, text)
    }
    platform.toast(text, 'error')
    forgetRenderJob(serverJobId)
  } finally {
    following.delete(serverJobId)
    unregisterRenderCancel(trackId)
    endTrackedRender(trackId)
  }
}
