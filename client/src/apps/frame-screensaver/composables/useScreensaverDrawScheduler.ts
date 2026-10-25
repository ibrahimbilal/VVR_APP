import { recordPreviewFrame } from '../lib/previewMetrics'
import type { ScreensaverImageRenderer, ScreensaverRenderInput } from '../lib/render/types'

export function useScreensaverDrawScheduler(renderer: () => ScreensaverImageRenderer | null) {
  let rafId = 0
  let pending = false
  let latestInput: (() => ScreensaverRenderInput | null) | null = null
  let latestAfter: (() => void) | null = null

  function scheduleDraw(getInput: () => ScreensaverRenderInput | null, after?: () => void): void {
    latestInput = getInput
    latestAfter = after ?? null
    if (pending) return
    pending = true
    rafId = requestAnimationFrame(() => {
      pending = false
      const drawStart = performance.now()
      const active = renderer()
      const input = latestInput?.()
      if (!active || !input) return
      const timings = active.render(input)
      const drawMs = performance.now() - drawStart
      recordPreviewFrame({
        drawMs,
        bakeMs: timings.bakeMs ?? null,
        compositeMs: timings.compositeMs ?? null,
        backend: active.backend,
      })
      latestAfter?.()
    })
  }

  function cancel(): void {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    pending = false
  }

  return { scheduleDraw, cancel }
}
