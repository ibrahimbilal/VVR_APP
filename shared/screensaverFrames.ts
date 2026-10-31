/** No overlay. Older saved projects used preset names; those load as none. */
export const NONE_FRAME_ID = 'none'

/** Uploaded frame PNGs. Matches the overlay file cap. */
export const FRAME_FILE_LIMIT = 40 * 1024 * 1024

/** Bundled PNGs in `client/src/assets/frames` (e.g. `default:frame-1`). */
export const BUILTIN_FRAME_PREFIX = 'default:'

const FRAME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BUILTIN_FRAME_ID = /^default:[a-z0-9-]+$/i

export function isBuiltinFrameId(frameId: string): boolean {
  return frameId.startsWith(BUILTIN_FRAME_PREFIX)
}

export function normalizeFrameId(value: unknown): string {
  if (value === NONE_FRAME_ID) return NONE_FRAME_ID
  if (typeof value === 'string' && FRAME_UUID.test(value)) return value
  if (typeof value === 'string' && BUILTIN_FRAME_ID.test(value)) return value
  return NONE_FRAME_ID
}

export function hasCustomFrame(frameId: string): boolean {
  return frameId !== NONE_FRAME_ID
}
