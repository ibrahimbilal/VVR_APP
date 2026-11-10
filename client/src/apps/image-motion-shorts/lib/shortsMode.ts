export type ShortsEditorMode = 'ranking' | 'image-motion'

const KEY = 'vf-shorts-mode'

export function loadShortsMode(): ShortsEditorMode {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === 'image-motion') return 'image-motion'
  } catch {
    /* ignore */
  }
  return 'ranking'
}

export function saveShortsMode(mode: ShortsEditorMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore */
  }
}
