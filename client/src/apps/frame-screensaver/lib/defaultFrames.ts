import { BUILTIN_FRAME_PREFIX } from '@shared/screensaverFrames'

const fullModules = import.meta.glob('../../../assets/frames/frame-*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const thumbModules = import.meta.glob('../../../assets/frames/thumbs/frame-*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

export interface DefaultFrame {
  id: string
  name: string
  /** Full-resolution asset for preview and export. */
  url: string
  /** Small preview for the Frames picker (150px wide). */
  thumbUrl: string
}

function baseFromAssetPath(assetPath: string): string {
  return (assetPath.split('/').pop() ?? 'frame').replace(/\.png$/i, '')
}

function idFromBase(base: string): string {
  return `${BUILTIN_FRAME_PREFIX}${base}`
}

function labelFromBase(base: string): string {
  return base.replace(/-/g, ' ')
}

function thumbUrlForBase(base: string): string {
  const key = Object.keys(thumbModules).find((path) => baseFromAssetPath(path) === base)
  return key ? thumbModules[key] : ''
}

export const DEFAULT_FRAMES: DefaultFrame[] = Object.entries(fullModules)
  .map(([path, url]) => {
    const base = baseFromAssetPath(path)
    return {
      id: idFromBase(base),
      name: labelFromBase(base),
      url,
      thumbUrl: thumbUrlForBase(base) || url,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

export function resolveBuiltinFrameUrl(frameId: string): string | null {
  return DEFAULT_FRAMES.find((frame) => frame.id === frameId)?.url ?? null
}

export function resolveBuiltinFrameThumbUrl(frameId: string): string | null {
  const frame = DEFAULT_FRAMES.find((item) => item.id === frameId)
  if (!frame) return null
  return frame.thumbUrl || frame.url
}
