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
import { notifyRenderReady, type RenderAppId } from './renderNotifications'
import type { JobPollUpdate } from './jobPoll'

const MAX_EXPORT_JOBS = 12

export type ManagedExportJob = {
  id: string
  trackId: string
  displayName: string
  downloadFilename: string
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
    const trackId = beginTrackedRender(input.app, input.displayName)
    const job: ManagedExportJob = {
      id,
      trackId,
      displayName: input.displayName,
      downloadFilename: input.downloadFilename,
      abort,
      state: idleExport(),
    }
    jobs.value = [...jobs.value, job]

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
        syncTrackedRender(trackId, updated.state)
      },
      onComplete: (result) => {
        unregisterRenderCancel(trackId)
        const current = jobs.value.find((item) => item.id === id)
        endTrackedRender(trackId)
        if (!current) return
        if (result === 'done' && current.state.phase === 'done' && current.state.downloadUrl) {
          notifyRenderReady(input.app, current.displayName, current.state.downloadUrl, current.downloadFilename)
        }
        if (result === 'cancelled') {
          patchJob(id, { phase: 'cancelled', message: 'Export cancelled.', error: null })
          input.toast?.('Export cancelled.', 'info')
          removeJob(id)
          return
        }
        if (result === 'error' && current.state.phase !== 'error') {
          const text = current.state.error || 'Export failed.'
          patchJob(id, { phase: 'error', error: text, message: text })
          input.onError?.(text)
        }
      },
    })
    return true
  }

  function clearFinished(): void {
    jobs.value = jobs.value.filter((job) => isActiveExportPhase(job.state.phase) || job.state.phase === 'idle')
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
