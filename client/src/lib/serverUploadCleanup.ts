import * as api from './api'

let unloadHookInstalled = false

export function ensureServerUploadCleanupOnClose(): void {
  if (unloadHookInstalled || typeof window === 'undefined') return
  unloadHookInstalled = true
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return
    api.beaconCleanupServerUploads({ purgeAll: true })
  })
}

export async function cleanupServerUploads(jobId: string | null = null): Promise<void> {
  await api.cleanupServerUploads({ purgeAll: true, jobId })
}

export function beaconServerUploadCleanup(jobId: string | null = null): void {
  api.beaconCleanupServerUploads({ purgeAll: true, jobId })
}
