/**
 * Node-side CPU timing for screensaver placement adjustments (same math as composeCanvas bake).
 * Browser preview FPS is not measured here; use diagnostics in the app for GPU metrics.
 */
import { applyBoxBlur, applyColorAdjustments, applyUnsharp, blurSigma, defaultAdjustments } from '../../shared/screensaverAdjust'

function benchPlacementPixels(width: number, height: number, iterations: number): number {
  const adjustments = defaultAdjustments()
  adjustments.saturation = 35
  adjustments.blur = 40
  adjustments.sharpness = 25
  adjustments.brightness = 15
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i / 4) % 256
    data[i + 1] = 80
    data[i + 2] = 120
    data[i + 3] = 255
  }
  const start = performance.now()
  for (let n = 0; n < iterations; n++) {
    const copy = new Uint8ClampedArray(data)
    applyColorAdjustments(copy, adjustments)
    const radius = Math.round(blurSigma(adjustments.blur, height) * 2)
    if (radius >= 1) applyBoxBlur(copy, width, height, radius)
    if (adjustments.sharpness > 0) applyUnsharp(copy, width, height, adjustments.sharpness)
  }
  return performance.now() - start
}

async function main(): Promise<void> {
  const cases = [
    { name: 'preview_placement_1280x720', w: 1280, h: 720, iter: 5 },
    { name: 'preview_placement_1920x1080', w: 1920, h: 1080, iter: 3 },
    { name: 'export_compose_3840x2160', w: 3840, h: 2160, iter: 1 },
  ]
  const rows: { case: string; width: number; height: number; totalMs: number; perPassMs: number }[] = []
  for (const item of cases) {
    const totalMs = benchPlacementPixels(item.w, item.h, item.iter)
    rows.push({
      case: item.name,
      width: item.w,
      height: item.h,
      totalMs: Math.round(totalMs * 100) / 100,
      perPassMs: Math.round((totalMs / item.iter) * 100) / 100,
    })
    console.log(JSON.stringify(rows[rows.length - 1]))
  }
}

void main()
