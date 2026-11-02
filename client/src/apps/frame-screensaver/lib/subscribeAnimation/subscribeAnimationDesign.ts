import type { SubscribeAnimationStyle } from '@shared/screensaverSubscribeAnimation'

export interface SubscribeDesignSize {
  width: number
  height: number
}

export function subscribeDesignSize(style: SubscribeAnimationStyle): SubscribeDesignSize {
  switch (style) {
    case 'subscribe-only':
      return { width: 168, height: 44 }
    case 'subscribe-alerts':
      return { width: 252, height: 44 }
    case 'like-subscribe-alerts':
      return { width: 336, height: 44 }
    case 'channel-card':
    default:
      return { width: 420, height: 140 }
  }
}
