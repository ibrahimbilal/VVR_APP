import { previewMetricsSnapshot, setScreensaverDiagnosticsEnabled } from './previewMetrics'

/** Runs ~2s of rAF sampling; requires the editor canvas to be drawing. Call from devtools after enabling diagnostics. */
export function runPreviewMicroBench(): Promise<ReturnType<typeof previewMetricsSnapshot>> {
  setScreensaverDiagnosticsEnabled(true)
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(previewMetricsSnapshot()), 2000)
  })
}

declare global {
  interface Window {
    __vvrScreensaverBench?: () => Promise<ReturnType<typeof previewMetricsSnapshot>>
  }
}

export function installPreviewBenchHook(): void {
  if (typeof window === 'undefined') return
  window.__vvrScreensaverBench = runPreviewMicroBench
}
