/**
 * One-time copy of pre-rebrand browser keys (`vvr-*` → `ribo-*`).
 * Does not overwrite an existing ribo key.
 */
const KEY_PAIRS: ReadonlyArray<readonly [legacy: string, next: string]> = [
  ['vvr-color-sets', 'ribo-color-sets'],
  ['vvr-active-render-jobs', 'ribo-active-render-jobs'],
  ['vvr-render-notifications', 'ribo-render-notifications'],
  ['vvr-screensaver-renderer', 'ribo-screensaver-renderer'],
  ['vvr-screensaver-diagnostics', 'ribo-screensaver-diagnostics'],
  ['vvr-screensaver-webgl-failed', 'ribo-screensaver-webgl-failed'],
]

function migrateStore(store: Storage): void {
  for (const [legacy, next] of KEY_PAIRS) {
    try {
      if (store.getItem(next) !== null) continue
      const value = store.getItem(legacy)
      if (value === null) continue
      store.setItem(next, value)
      store.removeItem(legacy)
    } catch {
      // Private browsing / quota — ignore
    }
  }
}

export function migrateLegacyBrowserStorage(): void {
  try {
    migrateStore(localStorage)
  } catch {
    // ignore
  }
  try {
    migrateStore(sessionStorage)
  } catch {
    // ignore
  }
}
