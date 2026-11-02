/** Scale at full press (center of click window). */
export const SUBSCRIBE_CLICK_PRESS_SCALE = 0.9

/** Time to ease between rest (1) and press scale at click start/end. */
export const SUBSCRIBE_CLICK_PRESS_TRANSITION_SEC = 0.1

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function easeOutCubic(t: number): number {
  const x = clamp01(t)
  return 1 - (1 - x) ** 3
}

/** Smooth scale 1 → press → 1 across the click window (deterministic per frame time). */
export function subscribeClickPressScale(timeSec: number, clickStartSec: number, clickDurationSec: number): number {
  const clickEnd = clickStartSec + clickDurationSec
  if (timeSec < clickStartSec || timeSec >= clickEnd) return 1

  const press = SUBSCRIBE_CLICK_PRESS_SCALE
  const trans = Math.min(SUBSCRIBE_CLICK_PRESS_TRANSITION_SEC, clickDurationSec / 3)
  const elapsed = timeSec - clickStartSec
  const remaining = clickEnd - timeSec

  if (elapsed < trans) {
    const p = easeOutCubic(elapsed / trans)
    return 1 + (press - 1) * p
  }
  if (remaining < trans) {
    const p = easeOutCubic(remaining / trans)
    return 1 + (press - 1) * p
  }
  return press
}
