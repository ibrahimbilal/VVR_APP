export function pageWasReloaded(): boolean {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return entry?.type === 'reload'
  } catch {
    return false
  }
}
