export interface OrderedClip {
  id: string
  playAtEnd?: boolean
}

/** List order, with the single finale clip moved to the end. */
export function playbackOrder<T extends OrderedClip>(clips: T[]): T[] {
  const endIndex = clips.findIndex((clip) => clip.playAtEnd)
  if (endIndex < 0 || endIndex === clips.length - 1) return clips.slice()
  const end = clips[endIndex]
  if (!end) return clips.slice()
  return [...clips.slice(0, endIndex), ...clips.slice(endIndex + 1), end]
}
