import type { SubscribeAnimationStyle } from '@shared/screensaverSubscribeAnimation'
import { subscribeClickPressScale } from './subscribeAnimationClickPulse'

/** Shared motion timeline (seconds). */
export const SUBSCRIBE_FADE_IN_SEC = 0.5
export const SUBSCRIBE_IDLE_BEFORE_ACTIONS_SEC = 1
export const SUBSCRIBE_CLICK_SEC = 0.4
export const SUBSCRIBE_ACTION_GAP_SEC = 1
export const SUBSCRIBE_FADE_OUT_SEC = 0.8
/** Design-pixel slide distance for intro (slide up) and outro (slide down). */
export const SUBSCRIBE_SLIDE_OFFSET_DESIGN = 200

export const SUBSCRIBE_FIRST_ACTION_SEC = SUBSCRIBE_FADE_IN_SEC + SUBSCRIBE_IDLE_BEFORE_ACTIONS_SEC

export function subscribeActionStart(index: number): number {
  return SUBSCRIBE_FIRST_ACTION_SEC + index * (SUBSCRIBE_CLICK_SEC + SUBSCRIBE_ACTION_GAP_SEC)
}

export function subscribeInClickWindow(timeSec: number, startSec: number): boolean {
  return timeSec >= startSec && timeSec < startSec + SUBSCRIBE_CLICK_SEC
}

export function subscribeFadeStart(style: SubscribeAnimationStyle): number {
  if (style === 'subscribe-only') {
    return subscribeActionStart(0) + SUBSCRIBE_CLICK_SEC + SUBSCRIBE_ACTION_GAP_SEC
  }
  if (style === 'like-subscribe-alerts') {
    return subscribeActionStart(2) + SUBSCRIBE_CLICK_SEC + SUBSCRIBE_ACTION_GAP_SEC
  }
  return subscribeActionStart(1) + SUBSCRIBE_CLICK_SEC + SUBSCRIBE_ACTION_GAP_SEC
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function easeOutCubic(t: number): number {
  const x = clamp01(t)
  return 1 - (1 - x) ** 3
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export interface SubscribeAnimationMotion {
  opacity: number
  slideY: number
  buttonPressed: boolean
  subscribed: boolean
  likeActive: boolean
  alertsActive: boolean
  alertsPressed: boolean
  likeClickScale: number
  subscribeClickScale: number
  alertClickScale: number
}

function applyAlertBellMotion(motion: SubscribeAnimationMotion, t: number, alertStart: number): void {
  if (t < alertStart) return
  if (subscribeInClickWindow(t, alertStart)) motion.alertsPressed = true
  if (t >= alertStart + SUBSCRIBE_CLICK_SEC) motion.alertsActive = true
}

function clickScaleAt(t: number, clickStartSec: number): number {
  return subscribeClickPressScale(t, clickStartSec, SUBSCRIBE_CLICK_SEC)
}

function applyClickPressMotion(
  motion: SubscribeAnimationMotion,
  t: number,
  likeStart: number | null,
  subStart: number,
  alertStart: number | null,
): void {
  if (likeStart != null) motion.likeClickScale = clickScaleAt(t, likeStart)
  motion.subscribeClickScale = clickScaleAt(t, subStart)
  if (alertStart != null) motion.alertClickScale = clickScaleAt(t, alertStart)
}

function applyActionMotion(motion: SubscribeAnimationMotion, t: number, style: SubscribeAnimationStyle): void {
  if (style === 'like-subscribe-alerts') {
    const likeStart = subscribeActionStart(0)
    const subStart = subscribeActionStart(1)
    const alertStart = subscribeActionStart(2)
    if (t >= likeStart) motion.likeActive = true
    if (subscribeInClickWindow(t, subStart)) motion.buttonPressed = true
    if (t >= subStart + SUBSCRIBE_CLICK_SEC) motion.subscribed = true
    applyAlertBellMotion(motion, t, alertStart)
    applyClickPressMotion(motion, t, likeStart, subStart, alertStart)
    return
  }

  const subStart = subscribeActionStart(0)
  if (subscribeInClickWindow(t, subStart)) motion.buttonPressed = true
  if (t >= subStart + SUBSCRIBE_CLICK_SEC) motion.subscribed = true

  if (style === 'subscribe-only') {
    applyClickPressMotion(motion, t, null, subStart, null)
    return
  }

  const alertStart = subscribeActionStart(1)
  applyAlertBellMotion(motion, t, alertStart)
  applyClickPressMotion(motion, t, null, subStart, alertStart)
}

/** Motion state for local animation time in [0, durationSec]. */
export function subscribeAnimationMotionAt(
  timeSec: number,
  durationSec: number,
  style: SubscribeAnimationStyle = 'channel-card',
): SubscribeAnimationMotion {
  const t = Math.max(0, Math.min(durationSec, timeSec))
  const motion: SubscribeAnimationMotion = {
    opacity: 0,
    slideY: SUBSCRIBE_SLIDE_OFFSET_DESIGN,
    buttonPressed: false,
    subscribed: false,
    likeActive: false,
    alertsActive: false,
    alertsPressed: false,
    likeClickScale: 1,
    subscribeClickScale: 1,
    alertClickScale: 1,
  }

  if (t < SUBSCRIBE_FADE_IN_SEC) {
    const p = easeOutCubic(t / SUBSCRIBE_FADE_IN_SEC)
    motion.opacity = p
    motion.slideY = SUBSCRIBE_SLIDE_OFFSET_DESIGN * (1 - p)
    return motion
  }

  applyActionMotion(motion, t, style)

  const fadeStart = subscribeFadeStart(style)
  if (t >= fadeStart) {
    const p = easeInOutCubic((t - fadeStart) / SUBSCRIBE_FADE_OUT_SEC)
    motion.opacity = 1 - p
    motion.slideY = SUBSCRIBE_SLIDE_OFFSET_DESIGN * p
  } else {
    motion.opacity = 1
    motion.slideY = 0
  }

  return motion
}
