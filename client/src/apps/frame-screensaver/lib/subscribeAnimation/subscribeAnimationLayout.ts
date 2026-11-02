import type { SubscribeAnimationPosition, SubscribeAnimationSettings } from '@shared/screensaverSubscribeAnimation'
import { subscribeDesignSize } from './subscribeAnimationDesign'

/** Extra transparent margin around the design (design px at scale 1, scaled with layout `scale`). */
export const SUBSCRIBE_ANIMATION_CANVAS_PADDING_DESIGN = 24

/** Transparent strip below the UI for cursor approach (outside content box, inside export PNG). */
export const SUBSCRIBE_ANIMATION_MOUSE_ENTRY_PADDING_DESIGN = 0

export interface SubscribeAnimationLayout {
  /** Full bitmap size including transparent padding. */
  width: number
  height: number
  contentWidth: number
  contentHeight: number
  padding: number
  mouseEntryPadding: number
  designWidth: number
  designHeight: number
  /** Design-unit to export pixel multiplier for drawing. */
  scale: number
}

export function subscribeAnimationLayout(
  settings: SubscribeAnimationSettings,
  outputWidth: number,
): SubscribeAnimationLayout {
  const design = subscribeDesignSize(settings.style)
  const outW = Math.max(1, Math.round(outputWidth))
  const contentWidth = Math.max(1, Math.round((outW * settings.sizePercent) / 100))
  const scale = contentWidth / design.width
  const contentHeight = Math.round(design.height * scale)
  const padding = Math.round(SUBSCRIBE_ANIMATION_CANVAS_PADDING_DESIGN * scale)
  const mouseEntryPadding = Math.round(SUBSCRIBE_ANIMATION_MOUSE_ENTRY_PADDING_DESIGN * scale)
  return {
    designWidth: design.width,
    designHeight: design.height,
    contentWidth,
    contentHeight,
    padding,
    mouseEntryPadding,
    width: contentWidth + padding * 2,
    height: contentHeight + padding * 2 + mouseEntryPadding,
    scale,
  }
}

export function subscribeAnimationOverlayOnOutput(
  outputWidth: number,
  outputHeight: number,
  settings: SubscribeAnimationSettings,
): { x: number; y: number; layout: SubscribeAnimationLayout } {
  const layout = subscribeAnimationLayout(settings, outputWidth)
  const margin = Math.max(0, Math.round(settings.edgeDistance))
  let x = margin
  const y = Math.max(0, outputHeight - layout.height - margin)
  if (settings.position === 'bottom-center') {
    x = Math.round((outputWidth - layout.width) / 2)
  } else if (settings.position === 'bottom-right') {
    x = Math.max(0, outputWidth - layout.width - margin)
  }
  return { x, y, layout }
}

export function channelInitials(channelName: string): string {
  const parts = channelName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'TV'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

export function positionLabel(position: SubscribeAnimationPosition): string {
  if (position === 'bottom-center') return 'Bottom center'
  if (position === 'bottom-right') return 'Bottom right'
  return 'Bottom left'
}
