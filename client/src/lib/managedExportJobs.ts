import { computed, ref, type Ref } from 'vue'
import type { ExportState } from '../types'
import { idleExport, isActiveExportPhase, pickDisplayExportState } from './exportState'
import { enqueueExportWork } from './exportQueueRunner'
import {
  beginTrackedRender,
  cancelTrackedRender,
  endTrackedRender,
  registerRenderCancel,
  syncTrackedRender,
  unregisterRenderCancel,
} from './renderJobTracking'
import { forgetRenderJob, rememberRenderJob } from './persistedRenderJobs'
import { notifyRenderOutcome, notifyRenderReady, type RenderAppId } from './renderNotifications'
import { publishScreensaverRender } from '../apps/frame-screensaver/lib/screensaverProjectEvents'
import type { JobPollUpdate } from './jobPoll'

const MAX_EXPORT_JOBS = 12

export type ManagedExportJob = {
  id: string
  trackId: string
  displayName: string
  downloadFilename: string
  projectId: string | null
  abort: AbortController
  state: ExportState
}

export function useManagedExportJobs() {
  const jobs = ref<ManagedExportJob[]>([])

  const exportState = computed(() => pickDisplayExportState(jobs.value))

  const exporting = computed(() =>
    jobs.value.some((job) => isActiveExportPhase(job.state.phase) || job.state.phase === 'idle'),
  )

  const activeExportCount = computed(
    () => jobs.value.filter((job) => isActiveExportPhase(job.state.phase) || job.state.phase === 'idle').length,
  )

  function patchJob(jobId: string, patch: Partial<ExportState>): ManagedExportJob | null {
    const index = jobs.value.findIndex((item) => item.id === jobId)
    if (index === -1) return null
    const next = {
      ...jobs.value[index]!,
      state: { ...jobs.value[index]!.state, ...patch },
    }
    jobs.value = [...jobs.value.slice(0, index), next, ...jobs.value.slice(index + 1)]
    return next
  }

  function removeJob(id: string): void {
    jobs.value = jobs.value.filter((job) => job.id !== id)
  }

  function cancelJobByTrackId(trackId: string): void {
    cancelTrackedRender(trackId)
  }

  function cancelFrontActive(): void {
    const front = jobs.value.find((job) => isActiveExportPhase(job.state.phase) || job.state.phase === 'idle')
    if (!front) return
    cancelJobByTrackId(front.trackId)
  }

  function cancelAll(): void {
    for (const job of jobs.value) job.abort.abort()
  }

  function enqueue(input: {
    app: RenderAppId
    displayName: string
    downloadFilename: string
    projectId?: string | null
    onTrack?: (trackId: string) => void
    submit: (signal: AbortSignal, onUpdate: (patch: JobPollUpdate) => void) => Promise<string>
    onError?: (message: string) => void
    toast?: (text: string, tone?: 'info' | 'error' | 'success') => void
  }): boolean {
    const activeOrWaiting = jobs.value.filter(
      (job) => isActiveExportPhase(job.state.phase) || job.state.phase === 'idle',
    ).length
    if (activeOrWaiting >= MAX_EXPORT_JOBS) {
      input.toast?.(`Export queue is full (${MAX_EXPORT_JOBS} items). Wait for a render to finish.`, 'info')
      return false
    }

    const id = crypto.randomUUID()
    const abort = new AbortController()
    const projectId = input.projectId ?? null
    const trackId = beginTrackedRender(input.app, input.displayName, projectId)
    input.onTrack?.(trackId)
    const job: ManagedExportJob = {
      id,
      trackId,
      displayName: input.displayName,
      downloadFilename: input.downloadFilename,
      projectId,
      abort,
      state: idleExport(),
    }
    jobs.value = [...jobs.value, job]

    const emit = (state: ExportState) => {
      if (!projectId) return
      publishScreensaverRender({
        projectId,
        trackId,
        phase: state.phase,
        progress: state.progress,
        error: state.error,
        jobId: state.jobId,
        downloadUrl: state.downloadUrl,
        filename: input.downloadFilename,
      })
    }

    registerRenderCancel(trackId, {
      abort: () => abort.abort(),
      getServerJobId: () => jobs.value.find((item) => item.id === id)?.state.jobId ?? null,
    })

    enqueueExportWork({
      id,
      signal: abort.signal,
      submit: input.submit,
      onUpdate: (patch) => {
        const updated = patchJob(id, patch as Partial<ExportState>)
        if (!updated) return
        if (updated.state.jobId) {
          rememberRenderJob({
            serverJobId: updated.state.jobId,
            app: input.app,
            projectName: input.displayName,
            downloadFilename: input.downloadFilename,
            projectId,
          })
        }
        syncTrackedRender(trackId, updated.state)
        emit(updated.state)
      },
      onComplete: (result) => {
        unregisterRenderCancel(trackId)
        const current = jobs.value.find((item) => item.id === id)
        if (current?.state.jobId) forgetRenderJob(current.state.jobId)
        if (!current) {
          endTrackedRender(trackId)
          return
        }
        if (result === 'done' && current.state.phase === 'done' && current.state.downloadUrl) {
          emit(current.state)
          notifyRenderReady(
            input.app,
            current.displayName,
            current.state.downloadUrl,
            current.downloadFilename,
            trackId,
            projectId,
          )
        } else {
          endTrackedRender(trackId)
        }
        if (result === 'cancelled') {
          const cancelled = patchJob(id, { phase: 'cancelled', message: 'Export cancelled.', error: null })
          if (cancelled) emit(cancelled.state)
          notifyRenderOutcome(input.app, current.displayName, 'cancelled', trackId, projectId, null)
          input.toast?.('Export cancelled.', 'info')
          removeJob(id)
          return
        }
        if (result === 'error' && current.state.phase !== 'error') {
          const text = current.state.error || 'Export failed.'
          const failed = patchJob(id, { phase: 'error', error: text, message: text })
          if (failed) emit(failed.state)
          notifyRenderOutcome(input.app, current.displayName, 'failed', trackId, projectId, text)
          input.onError?.(text)
        } else if (result === 'error') {
          emit(current.state)
          notifyRenderOutcome(input.app, current.displayName, 'failed', trackId, projectId, current.state.error)
        }
      },
    })
    return true
  }

  function clearFinished(projectId?: string): void {
    jobs.value = jobs.value.filter((job) => {
      const active = isActiveExportPhase(job.state.phase) || job.state.phase === 'idle'
      if (active) return true
      if (projectId && job.projectId !== projectId) return true
      return false
    })
  }

  return {
    jobs: jobs as Ref<ManagedExportJob[]>,
    exportState,
    exporting,
    activeExportCount,
    enqueue,
    cancelFrontActive,
    cancelJobByTrackId,
    cancelAll,
    removeJob,
    clearFinished,
  }
}
