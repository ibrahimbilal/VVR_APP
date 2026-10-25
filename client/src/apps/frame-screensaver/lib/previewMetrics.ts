export interface PreviewFrameMetrics {
  drawMs: number
  bakeMs: number | null
  compositeMs: number | null
  backend: 'webgl2' | 'canvas2d' | 'none'
  timestamp: number
}

const ROLLING = 60
const frames: PreviewFrameMetrics[] = []

let diagnosticsOn = false

export function screensaverDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (diagnosticsOn) return true
  try {
    if (localStorage.getItem('vvr-screensaver-diagnostics') === '1') return true
    if (new URLSearchParams(window.location.search).get('screensaver_diag') === '1') return true
  } catch {
    // localStorage may be blocked.
  }
  return false
}

export function setScreensaverDiagnosticsEnabled(on: boolean): void {
  diagnosticsOn = on
  try {
    if (on) localStorage.setItem('vvr-screensaver-diagnostics', '1')
    else localStorage.removeItem('vvr-screensaver-diagnostics')
  } catch {
    // ignore
  }
}

export function previewMetricsEnabled(): boolean {
  return screensaverDiagnosticsEnabled()
}

export function recordPreviewFrame(sample: Omit<PreviewFrameMetrics, 'timestamp'>): void {
  if (!previewMetricsEnabled()) return
  frames.push({ ...sample, timestamp: performance.now() })
  if (frames.length > ROLLING) frames.shift()
}

export function previewMetricsSnapshot(): {
  fps: number | null
  avgDrawMs: number | null
  avgBakeMs: number | null
  avgCompositeMs: number | null
  lastBackend: PreviewFrameMetrics['backend']
} {
  if (frames.length < 2) {
    const last = frames.at(-1)
    return {
      fps: null,
      avgDrawMs: last ? last.drawMs : null,
      avgBakeMs: last?.bakeMs ?? null,
      avgCompositeMs: last?.compositeMs ?? null,
      lastBackend: last?.backend ?? 'none',
    }
  }
  const span = frames.at(-1)!.timestamp - frames[0].timestamp
  const fps = span > 0 ? ((frames.length - 1) / span) * 1000 : null
  const avg = (key: 'drawMs' | 'bakeMs' | 'compositeMs') => {
    const values = frames.map((f) => f[key]).filter((v): v is number => v != null && Number.isFinite(v))
    if (!values.length) return null
    return values.reduce((a, b) => a + b, 0) / values.length
  }
  return {
    fps,
    avgDrawMs: avg('drawMs'),
    avgBakeMs: avg('bakeMs'),
    avgCompositeMs: avg('compositeMs'),
    lastBackend: frames.at(-1)?.backend ?? 'none',
  }
}

let contextLossCount = 0
export function recordWebGlContextLoss(): void {
  contextLossCount += 1
}
export function webGlContextLossCount(): number {
  return contextLossCount
}

let lastExportPrepMs: number | null = null
let lastExportUsedWorker = false
export function recordExportPrep(ms: number, usedWorker: boolean): void {
  if (!previewMetricsEnabled()) return
  lastExportPrepMs = ms
  lastExportUsedWorker = usedWorker
}
export function exportPrepSnapshot(): { ms: number | null; usedWorker: boolean } {
  return { ms: lastExportPrepMs, usedWorker: lastExportUsedWorker }
}
