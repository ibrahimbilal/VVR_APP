import {
  LUCIDE_BELL_PATHS,
  LUCIDE_BELL_RING_PATHS,
  LUCIDE_ICON_VIEWBOX,
  LUCIDE_MOUSE_POINTER_PATHS,
  LUCIDE_MOUSE_POINTER_HOTSPOT,
  LUCIDE_THUMBS_UP_PATHS,
  strokeLucidePaths,
} from './subscribeAnimationLucideIcons'
import type { SubscribeMousePointer } from './subscribeAnimationMouse'
import type { SubscribeChannelCardThemeColors } from './subscribeAnimationChannelCardTheme'

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function withButtonScale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  clickScale: number,
  draw: () => void,
): void {
  if (Math.abs(clickScale - 1) < 0.002) {
    draw()
    return
  }
  const cx = x + w / 2
  const cy = y + h / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(clickScale, clickScale)
  ctx.translate(-cx, -cy)
  draw()
  ctx.restore()
}

export function drawPillButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  fill: string,
  scale: number,
  labelColor = '#ffffff',
  clickScale = 1,
): void {
  withButtonScale(ctx, x, y, w, h, clickScale, () => {
    roundRect(ctx, x, y, w, h, h / 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.fillStyle = labelColor
    ctx.font = `700 ${Math.round(14 * scale)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
  })
}

export function drawIconButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  scale: number,
  active: boolean,
  kind: 'bell' | 'like',
  bellAngle = 0,
  bellScale = 1,
  pressed = false,
  clicked = false,
  clickScale = 1,
  channelTheme?: SubscribeChannelCardThemeColors,
): void {
  const cx = x + size / 2
  const cy = y + size / 2
  withButtonScale(ctx, x, y, size, size, clickScale, () => {
    roundRect(ctx, x, y, size, size, size / 2)
    if (clicked) {
      ctx.fillStyle = channelTheme?.buttonClickedFill ?? '#ffffff'
    } else if (pressed && !active) {
      ctx.fillStyle = channelTheme ? channelTheme.iconButtonActive : 'rgba(50, 50, 58, 0.95)'
    } else if (channelTheme) {
      ctx.fillStyle = active ? channelTheme.iconButtonActive : channelTheme.iconButtonIdle
    } else {
      ctx.fillStyle = active ? 'rgba(82, 82, 91, 0.95)' : 'rgba(30, 30, 36, 0.92)'
    }
    ctx.fill()
    ctx.strokeStyle = clicked
      ? channelTheme
        ? 'rgba(255,255,255,0.12)'
        : 'rgba(0,0,0,0.12)'
      : channelTheme?.iconButtonStroke ?? 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.stroke()

    const iconSize = size * 0.52
    const likeColor = channelTheme?.iconLike ?? '#0078f8'
    const defaultIcon = channelTheme?.iconDefault ?? '#ffffff'
    if (kind === 'bell') {
      const paths = active ? LUCIDE_BELL_RING_PATHS : LUCIDE_BELL_PATHS
      const iconColor = clicked ? (channelTheme?.buttonClickedIcon ?? '#000000') : defaultIcon
      strokeLucidePaths(ctx, paths, cx, cy, iconSize, iconColor, {
        strokeWidth: 2.25 * scale,
        rotationDeg: bellAngle,
        scale: bellScale,
      })
    } else {
      const iconColor = clicked || active ? likeColor : defaultIcon
      strokeLucidePaths(ctx, LUCIDE_THUMBS_UP_PATHS, cx, cy + size * 0.02, iconSize, iconColor, {
        strokeWidth: 2.25 * scale,
        fill: active,
      })
    }
  })
}

export function drawChannelAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  scale: number,
  initials: string,
  theme: SubscribeChannelCardThemeColors,
  image: CanvasImageSource | null,
): void {
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (image) {
    ctx.drawImage(image, x, y, size, size)
  } else {
    ctx.fillStyle = theme.avatarFallback
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = theme.avatarInitials
    ctx.font = `700 ${Math.round(18 * scale)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, cx, cy + 1)
  }
  ctx.restore()
}

export function drawLucideBell(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  pixelSize: number,
  scale: number,
  bellAngle = 0,
  bellScale = 1,
): void {
  strokeLucidePaths(ctx, LUCIDE_BELL_PATHS, centerX, centerY, pixelSize, '#ffffff', {
    strokeWidth: 2.25 * scale,
    rotationDeg: bellAngle,
    scale: bellScale,
  })
}

export function drawMousePointer(
  ctx: CanvasRenderingContext2D,
  pointer: SubscribeMousePointer,
  layoutScale: number,
): void {
  if (!pointer.visible) return
  const pixelSize = 26 * layoutScale
  const scale = (pixelSize / LUCIDE_ICON_VIEWBOX) * pointer.clickScale
  const strokeWidth = 1 * layoutScale
  ctx.save()
  ctx.translate(pointer.x, pointer.y)
  ctx.scale(scale, scale)
  ctx.translate(-LUCIDE_MOUSE_POINTER_HOTSPOT.x, -LUCIDE_MOUSE_POINTER_HOTSPOT.y)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = strokeWidth / scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const arrow = new Path2D(LUCIDE_MOUSE_POINTER_PATHS[1])
  ctx.fill(arrow, 'evenodd')
  for (const d of LUCIDE_MOUSE_POINTER_PATHS) {
    ctx.stroke(new Path2D(d))
  }
  ctx.restore()
}
