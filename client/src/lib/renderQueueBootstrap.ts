import { pageWasReloaded } from './pageNavigation'
import { usePlatformStore } from '../stores/platform'

const ACTIVE_JOBS_KEY = 'vvr-active-render-jobs'
const READY_KEY = 'vvr-render-notifications'

export function clearPersistedRenderQueues(): void {
  try {
    sessionStorage.removeItem(ACTIVE_JOBS_KEY)
    sessionStorage.removeItem(READY_KEY)
  } catch {
    // ignore
  }
}

export function bootstrapRenderQueuesAfterNavigation(): void {
  const reset = (): void => {
    usePlatformStore().clearRenderQueues()
    clearPersistedRenderQueues()
  }

  if (pageWasReloaded()) reset()

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset()
  })
}
