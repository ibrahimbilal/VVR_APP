import type { SubscribeAnimationSettings } from '@shared/screensaverSubscribeAnimation'
import { DEFAULT_SCREENSAVER_OUTPUT } from '@shared/screensaver'
import { channelInitials, subscribeAnimationLayout, type SubscribeAnimationLayout } from './subscribeAnimationLayout'
import { drawIconButton, drawChannelAvatar, drawMousePointer, drawPillButton, roundRect } from './subscribeAnimationDraw'
import { subscribeClickTargets } from './subscribeAnimationClickTargets'
import { subscribeMousePointerAt } from './subscribeAnimationMouse'
import { subscribeAnimationMotionAt } from './subscribeAnimationTimeline'
import { subscribeChannelCardThemeColors } from './subscribeAnimationChannelCardTheme'
import { getSubscribeChannelAvatarForSettings } from './subscribeAnimationChannelAvatar'

function drawMouseOverlay(
  ctx: CanvasRenderingContext2D,
  settings: SubscribeAnimationSettings,
  layout: SubscribeAnimationLayout,
  timeSec: number,
  slideY: number,
  opacity: number,
): void {
  if (opacity <= 0.001) return
  const targets = subscribeClickTargets(settings, layout)
  const pointer = subscribeMousePointerAt(timeSec, settings.style, targets, layout)
  if (!pointer.visible) return
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(0, slideY)
  drawMousePointer(ctx, pointer, layout.scale)
  ctx.restore()
}

function renderChannelCard(
  ctx: CanvasRenderingContext2D,
  settings: SubscribeAnimationSettings,
  layout: SubscribeAnimationLayout,
  timeSec: number,
): void {
  const { contentWidth: width, contentHeight: height, scale } = layout
  const motion = subscribeAnimationMotionAt(timeSec, settings.durationSec, settings.style)
  if (motion.opacity <= 0.001) return

  ctx.save()
  ctx.globalAlpha = motion.opacity
  ctx.translate(0, motion.slideY)

  const pad = 14 * scale
  const avatarSize = 52 * scale
  const theme = subscribeChannelCardThemeColors(settings.channelCardTheme)
  const avatarImage = getSubscribeChannelAvatarForSettings(settings.channelAvatarUrl)

  roundRect(ctx, 0, 0, width, height, 16 * scale)
  ctx.fillStyle = theme.cardFill
  ctx.fill()
  ctx.strokeStyle = theme.cardStroke
  ctx.lineWidth = 1
  ctx.stroke()

  const avatarX = pad
  const avatarY = (height - avatarSize) / 2
  drawChannelAvatar(
    ctx,
    avatarX,
    avatarY,
    avatarSize,
    scale,
    channelInitials(settings.channelName),
    theme,
    avatarImage,
  )

  const textX = avatarX + avatarSize + pad
  const nameY = height * 0.34
  ctx.textAlign = 'left'
  ctx.fillStyle = theme.channelName
  ctx.font = `600 ${Math.round(17 * scale)}px Inter, system-ui, sans-serif`
  const name = settings.channelName.length > 28 ? `${settings.channelName.slice(0, 27)}…` : settings.channelName
  ctx.fillText(name, textX, nameY)

  if (settings.channelSubscriberCount) {
    ctx.fillStyle = theme.channelSubscribers
    ctx.font = `500 ${Math.round(13 * scale)}px Inter, system-ui, sans-serif`
    const subLabel =
      settings.channelSubscriberCount.length > 32
        ? `${settings.channelSubscriberCount.slice(0, 31)}…`
        : settings.channelSubscriberCount
    ctx.fillText(subLabel, textX, height * 0.48)
  }

  const btnH = 34 * scale
  const gap = 8 * scale
  const iconSize = btnH
  const btnY = height * 0.58
  const btnX = textX
  const subscribeW = width - btnX - pad - iconSize - gap
  const subscribeFill = motion.subscribed
    ? theme.buttonClickedFill
    : motion.buttonPressed
      ? '#c62828'
      : '#ff0000'
  const subscribeLabelColor = motion.subscribed ? theme.buttonClickedLabel : '#ffffff'
  drawPillButton(
    ctx,
    btnX,
    btnY,
    subscribeW,
    btnH,
    motion.subscribed ? 'Subscribed' : 'Subscribe',
    subscribeFill,
    scale,
    subscribeLabelColor,
    motion.subscribeClickScale,
  )
  const alertEngaged = motion.alertsActive || motion.alertsPressed
  drawIconButton(
    ctx,
    btnX + subscribeW + gap,
    btnY,
    iconSize,
    scale,
    alertEngaged,
    'bell',
    motion.alertsPressed && !motion.alertsActive,
    motion.alertsActive,
    motion.alertClickScale,
    theme,
  )

  drawMouseOverlay(ctx, settings, layout, timeSec, motion.slideY, motion.opacity)
  ctx.restore()
}

function renderButtonRow(
  ctx: CanvasRenderingContext2D,
  settings: SubscribeAnimationSettings,
  layout: SubscribeAnimationLayout,
  timeSec: number,
): void {
  const { contentWidth: width, contentHeight: height, scale } = layout
  const motion = subscribeAnimationMotionAt(timeSec, settings.durationSec, settings.style)
  if (motion.opacity <= 0.001) return

  ctx.save()
  ctx.globalAlpha = motion.opacity
  ctx.translate(0, motion.slideY)

  const btnH = height
  const gap = 8 * scale
  const iconSize = btnH
  let x = 0

  if (settings.style === 'like-subscribe-alerts') {
    drawIconButton(
      ctx,
      x,
      0,
      iconSize,
      scale,
      motion.likeActive,
      'like',
      false,
      motion.likeActive,
      motion.likeClickScale,
    )
    x += iconSize + gap
  }

  const subscribeW =
    settings.style === 'subscribe-only' ? width : settings.style === 'subscribe-alerts' ? width - iconSize - gap : width - iconSize - gap - iconSize - gap
  const subscribeFill = motion.subscribed ? '#ffffff' : motion.buttonPressed ? '#c62828' : '#ff0000'
  const subscribeLabelColor = motion.subscribed ? '#09090b' : '#ffffff'
  drawPillButton(
    ctx,
    x,
    0,
    subscribeW,
    btnH,
    motion.subscribed ? 'Subscribed' : 'Subscribe',
    subscribeFill,
    scale,
    subscribeLabelColor,
    motion.subscribeClickScale,
  )
  x += subscribeW + gap

  if (settings.style === 'subscribe-alerts' || settings.style === 'like-subscribe-alerts') {
    const alertEngaged = motion.alertsActive || motion.alertsPressed
    drawIconButton(
      ctx,
      x,
      0,
      iconSize,
      scale,
      alertEngaged,
      'bell',
      motion.alertsPressed && !motion.alertsActive,
      motion.alertsActive,
      motion.alertClickScale,
    )
  }

  drawMouseOverlay(ctx, settings, layout, timeSec, motion.slideY, motion.opacity)
  ctx.restore()
}

export function renderSubscribeAnimationAt(
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  settings: SubscribeAnimationSettings,
  layoutInput?: SubscribeAnimationLayout,
  outputWidth = DEFAULT_SCREENSAVER_OUTPUT.width,
): void {
  const layout = layoutInput ?? subscribeAnimationLayout(settings, outputWidth)
  ctx.clearRect(0, 0, layout.width, layout.height)
  ctx.save()
  ctx.translate(layout.padding, layout.padding)
  if (settings.style === 'channel-card') {
    renderChannelCard(ctx, settings, layout, timeSec)
  } else {
    renderButtonRow(ctx, settings, layout, timeSec)
  }
  ctx.restore()
}
