import { applyBoxBlur, applyColorAdjustments, applyUnsharp, blurSigma } from '@shared/screensaverAdjust'
import { backgroundBlurSigma, flattenBackground, type ScreensaverComposition } from '@shared/screensaverComposition'
import { framePreset, type FrameClip, type FramePreset } from '@shared/screensaverFrames'

export function bakePlacement(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  composition: ScreensaverComposition,
  destWidth: number,
  destHeight: number,
  compare: boolean,
): HTMLCanvasElement {
  const width = Math.max(2, Math.round(composition.width * destWidth))
  const height = Math.max(2, Math.round(composition.height * destHeight))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const crop = composition.crop
  const sx = crop.x * sourceWidth
  const sy = crop.y * sourceHeight
  const sw = Math.max(1, crop.w * sourceWidth)
  const sh = Math.max(1, crop.h * sourceHeight)
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)
  if (!compare) {
    const image = ctx.getImageData(0, 0, width, height)
    applyColorAdjustments(image.data, composition.adjustments)
    const radius = Math.round(blurSigma(composition.adjustments.blur, height) * 2)
    if (radius >= 1) applyBoxBlur(image.data, width, height, radius)
    if (composition.adjustments.sharpness > 0) applyUnsharp(image.data, width, height, composition.adjustments.sharpness)
    ctx.putImageData(image, 0, 0)
  }
  return canvas
}

export function paintComposition(
  ctx: CanvasRenderingContext2D,
  baked: HTMLCanvasElement | null,
  source: CanvasImageSource | null,
  sourceWidth: number,
  sourceHeight: number,
  composition: ScreensaverComposition,
  options: { flatten: boolean; checker: boolean },
): void {
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  ctx.clearRect(0, 0, width, height)
  paintBackground(ctx, source, sourceWidth, sourceHeight, composition, options)
  const preset = framePreset(composition.frameId)
  if (baked) {
    ctx.save()
    ctx.beginPath()
    addClip(ctx, preset.clip, width, height)
    ctx.clip()
    const centerX = (composition.x + composition.width / 2) * width
    const centerY = (composition.y + composition.height / 2) * height
    ctx.translate(centerX, centerY)
    ctx.rotate((composition.rotation * Math.PI) / 180)
    ctx.scale(composition.flipH ? -1 : 1, composition.flipV ? -1 : 1)
    ctx.globalAlpha = composition.opacity
    ctx.drawImage(baked, -baked.width / 2, -baked.height / 2)
    ctx.restore()
  }
  paintFrameArt(ctx, preset, width, height)
}

export function renderMaskCanvas(composition: ScreensaverComposition, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  addClip(ctx, framePreset(composition.frameId).clip, width, height)
  ctx.fill()
  return canvas
}

export function renderFrameCanvas(composition: ScreensaverComposition, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.clearRect(0, 0, width, height)
  paintFrameArt(ctx, framePreset(composition.frameId), width, height)
  return canvas
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not build the composition image.'))
    }, 'image/png')
  })
}

export function imageContains(composition: ScreensaverComposition, nx: number, ny: number): boolean {
  const centerX = composition.x + composition.width / 2
  const centerY = composition.y + composition.height / 2
  const dx = nx - centerX
  const dy = ny - centerY
  const rad = (-composition.rotation * Math.PI) / 180
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad)
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad)
  return Math.abs(localX) <= composition.width / 2 && Math.abs(localY) <= composition.height / 2
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource | null,
  sourceWidth: number,
  sourceHeight: number,
  composition: ScreensaverComposition,
  options: { flatten: boolean; checker: boolean },
): void {
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const flat = flattenBackground(composition.background)
  if (composition.background.mode === 'transparent' && !options.flatten && options.checker) {
    paintChecker(ctx, width, height)
    return
  }
  if (flat.blur && source && sourceWidth > 0 && sourceHeight > 0) {
    const scale = Math.max(width / sourceWidth, height / sourceHeight)
    const dw = sourceWidth * scale
    const dh = sourceHeight * scale
    ctx.save()
    ctx.filter = `blur(${Math.max(1, backgroundBlurSigma(composition.background.blur) * (height / 1080))}px)`
    ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh)
    ctx.restore()
    return
  }
  ctx.fillStyle = options.flatten || composition.background.mode !== 'transparent' ? flat.color : '#000000'
  ctx.fillRect(0, 0, width, height)
}

function paintChecker(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const size = Math.max(8, Math.round(width / 40))
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = (x / size + y / size) % 2 === 0 ? '#2a2d34' : '#1a1c22'
      ctx.fillRect(x, y, size, size)
    }
  }
}

function paintFrameArt(ctx: CanvasRenderingContext2D, preset: FramePreset, width: number, height: number): void {
  if (preset.id === 'none') return
  ctx.save()
  ctx.beginPath()
  if (preset.mat) ctx.rect(preset.mat.x * width, preset.mat.y * height, preset.mat.w * width, preset.mat.h * height)
  else ctx.rect(0, 0, width, height)
  addClip(ctx, preset.clip, width, height)
  ctx.fillStyle = preset.mat ? preset.matColor : preset.borderColor
  ctx.fill('evenodd')
  ctx.beginPath()
  addClip(ctx, preset.clip, width, height)
  ctx.strokeStyle = preset.innerColor
  ctx.lineWidth = Math.max(2, width * 0.008)
  ctx.stroke()
  ctx.strokeStyle = preset.borderColor
  ctx.lineWidth = Math.max(4, width * 0.018)
  if (preset.mat) ctx.strokeRect(preset.mat.x * width, preset.mat.y * height, preset.mat.w * width, preset.mat.h * height)
  else ctx.strokeRect(width * 0.018, height * 0.025, width * 0.964, height * 0.95)
  ctx.restore()
}

function addClip(ctx: CanvasRenderingContext2D, clip: FrameClip, width: number, height: number): void {
  const rect = clip.rect
  const x = rect.x * width
  const y = rect.y * height
  const rw = rect.w * width
  const rh = rect.h * height
  if (clip.kind === 'rect') {
    ctx.rect(x, y, rw, rh)
    return
  }
  if (clip.kind === 'round') {
    const radius = clip.radius * Math.min(width, height)
    ctx.roundRect(x, y, rw, rh, radius)
    return
  }
  const arcRadius = rw / 2
  const top = y + arcRadius
  ctx.moveTo(x, y + rh)
  ctx.lineTo(x, top)
  ctx.arc(x + arcRadius, top, arcRadius, Math.PI, 0, false)
  ctx.lineTo(x + rw, y + rh)
  ctx.closePath()
}
