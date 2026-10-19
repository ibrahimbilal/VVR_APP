export const OUTPUTS = [
  { width: 1080, height: 1920, label: '1080 × 1920' },
  { width: 720, height: 1280, label: '720 × 1280' },
] as const

export const FRAME_RATES = [24, 30, 60] as const

export function even(value: number): number {
  const rounded = Math.max(0, Math.round(value))
  return rounded % 2 === 0 ? rounded : Math.max(0, rounded - 1)
}

export function isAllowedOutput(width: number, height: number): boolean {
  return OUTPUTS.some((output) => output.width === width && output.height === height)
}

export function isAllowedFps(fps: number): boolean {
  return fps === 24 || fps === 30 || fps === 60
}

export interface FrameMetrics {
  width: number
  height: number
  bannerHeight: number
  videoHeight: number
}

/** Banner and video area in output pixels. Preview and FFmpeg both use this. */
export function frameMetrics(width: number, height: number, bannerHeight: number): FrameMetrics {
  const allowed = OUTPUTS.find((output) => output.width === width && output.height === height) ?? OUTPUTS[0]
  const frameWidth = allowed.width
  const frameHeight = allowed.height
  const maxBanner = even(Math.floor(frameHeight * 0.42))
  let banner = even(bannerHeight)
  banner = Math.min(Math.max(banner, 80), maxBanner)
  if ((frameHeight - banner) % 2 !== 0) banner = Math.max(80, banner - 1)
  return {
    width: frameWidth,
    height: frameHeight,
    bannerHeight: banner,
    videoHeight: frameHeight - banner,
  }
}
