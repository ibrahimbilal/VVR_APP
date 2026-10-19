export interface TimedClip {
  trimStart: number
  trimEnd: number
}

export function clipDuration(clip: TimedClip): number {
  const span = clip.trimEnd - clip.trimStart
  if (!Number.isFinite(span) || span <= 0) return 0
  return span
}

/** Fade cannot eat more than 40% of the shortest clip, and never more than 1 second. */
export function resolveFade(
  durations: number[],
  transition: 'cut' | 'fade',
  requested: number,
): number {
  if (transition !== 'fade' || durations.length < 2) return 0
  const shortest = Math.min(...durations)
  if (!Number.isFinite(shortest) || shortest <= 0) return 0
  const capped = Math.min(Math.max(requested, 0), 1, shortest * 0.4)
  return Math.round(capped * 1000) / 1000
}

export function sequenceDuration(durations: number[], fade: number): number {
  if (durations.length === 0) return 0
  const sum = durations.reduce((total, value) => total + value, 0)
  return Math.max(0, sum - fade * (durations.length - 1))
}
