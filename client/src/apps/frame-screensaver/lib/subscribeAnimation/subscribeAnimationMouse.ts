import type { SubscribeAnimationStyle } from '@shared/screensaverSubscribeAnimation'
import type { SubscribeClickTarget } from './subscribeAnimationClickTargets'
import { subscribeClickPressScale } from './subscribeAnimationClickPulse'
import {
  SUBSCRIBE_CLICK_SEC,
  SUBSCRIBE_FADE_IN_SEC,
  SUBSCRIBE_FADE_OUT_SEC,
  subscribeFadeStart,
  subscribeInClickWindow,
} from './subscribeAnimationTimeline'

export const SUBSCRIBE_MOUSE_MOVE_SEC = 0.45

export interface SubscribeMousePointer {
  x: number
  y: number
  visible: boolean
  pressed: boolean
  clickScale: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function subscribeMousePointerAt(
  timeSec: number,
  style: SubscribeAnimationStyle,
  targets: SubscribeClickTarget[],
  layout: { scale: number; contentWidth: number; contentHeight: number; padding: number; mouseEntryPadding: number },
): SubscribeMousePointer {
  const hidden = { x: 0, y: 0, visible: false, pressed: false, clickScale: 1 }
  if (targets.length === 0) return hidden

  const fadeStart = subscribeFadeStart(style)
  if (timeSec < SUBSCRIBE_FADE_IN_SEC || timeSec >= fadeStart + SUBSCRIBE_FADE_OUT_SEC) return hidden

  const pressOffset = 2.5 * layout.scale

  const first = targets[0]
  const approach = {
    x: first.cx,
    y: layout.contentHeight + layout.padding + layout.mouseEntryPadding * 0.82,
  }
  let from = approach

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i]
    const prevEnd = i === 0 ? SUBSCRIBE_FADE_IN_SEC : targets[i - 1].clickStartSec + SUBSCRIBE_CLICK_SEC
    const moveEnd = target.clickStartSec
    const moveStart = Math.max(prevEnd, moveEnd - SUBSCRIBE_MOUSE_MOVE_SEC)
    const clickEnd = target.clickStartSec + SUBSCRIBE_CLICK_SEC

    if (timeSec < moveStart) {
      return { x: from.x, y: from.y, visible: true, pressed: false, clickScale: 1 }
    }
    if (timeSec < moveEnd) {
      const p = easeInOutCubic((timeSec - moveStart) / (moveEnd - moveStart))
      return {
        x: lerp(from.x, target.cx, p),
        y: lerp(from.y, target.cy, p),
        visible: true,
        pressed: false,
        clickScale: 1,
      }
    }
    if (timeSec < clickEnd) {
      const down = subscribeInClickWindow(timeSec, target.clickStartSec)
      const clickScale = subscribeClickPressScale(timeSec, target.clickStartSec, SUBSCRIBE_CLICK_SEC)
      return {
        x: target.cx,
        y: target.cy + (down ? pressOffset : 0),
        visible: true,
        pressed: down,
        clickScale,
      }
    }
    from = { x: target.cx, y: target.cy }
  }

  const last = targets[targets.length - 1]
  return { x: last.cx, y: last.cy, visible: true, pressed: false, clickScale: 1 }
}
