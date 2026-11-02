import type { SubscribeAnimationSettings } from '@shared/screensaverSubscribeAnimation'
import { subscribeActionStart } from './subscribeAnimationTimeline'
import type { SubscribeAnimationLayout } from './subscribeAnimationLayout'

export interface SubscribeClickTarget {
  cx: number
  cy: number
  clickStartSec: number
}

export function subscribeClickTargets(
  settings: SubscribeAnimationSettings,
  layout: SubscribeAnimationLayout,
): SubscribeClickTarget[] {
  const { contentWidth: width, contentHeight: height, scale } = layout

  if (settings.style === 'channel-card') {
    const pad = 14 * scale
    const avatarSize = 52 * scale
    const btnH = 34 * scale
    const gap = 8 * scale
    const iconSize = btnH
    const btnY = height * 0.58
    const btnX = pad + avatarSize + pad
    const subscribeW = width - btnX - pad - iconSize - gap
    return [
      { cx: btnX + subscribeW / 2, cy: btnY + btnH / 2, clickStartSec: subscribeActionStart(0) },
      {
        cx: btnX + subscribeW + gap + iconSize / 2,
        cy: btnY + iconSize / 2,
        clickStartSec: subscribeActionStart(1),
      },
    ]
  }

  const btnH = height
  const gap = 8 * scale
  const iconSize = btnH
  let x = 0
  const targets: SubscribeClickTarget[] = []

  if (settings.style === 'like-subscribe-alerts') {
    targets.push({
      cx: x + iconSize / 2,
      cy: iconSize / 2,
      clickStartSec: subscribeActionStart(0),
    })
    x += iconSize + gap
  }

  const subscribeW =
    settings.style === 'subscribe-only'
      ? width
      : settings.style === 'subscribe-alerts'
        ? width - iconSize - gap
        : width - iconSize - gap - iconSize - gap

  targets.push({
    cx: x + subscribeW / 2,
    cy: btnH / 2,
    clickStartSec: subscribeActionStart(settings.style === 'like-subscribe-alerts' ? 1 : 0),
  })
  x += subscribeW + gap

  if (settings.style === 'subscribe-alerts' || settings.style === 'like-subscribe-alerts') {
    targets.push({
      cx: x + iconSize / 2,
      cy: iconSize / 2,
      clickStartSec: subscribeActionStart(settings.style === 'like-subscribe-alerts' ? 2 : 1),
    })
  }

  return targets
}
