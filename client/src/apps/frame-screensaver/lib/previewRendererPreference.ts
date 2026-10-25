export type PreviewRendererMode = 'auto' | 'webgl2' | 'canvas2d'

const STORAGE_KEY = 'vvr-screensaver-renderer'

export function readPreviewRendererMode(): PreviewRendererMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'webgl2' || stored === 'canvas2d') return stored
    const fromQuery = new URLSearchParams(window.location.search).get('screensaver_renderer')
    if (fromQuery === 'webgl2' || fromQuery === 'canvas2d') return fromQuery
  } catch {
    // ignore
  }
  return 'auto'
}

export function writePreviewRendererMode(mode: PreviewRendererMode): void {
  try {
    if (mode === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}
