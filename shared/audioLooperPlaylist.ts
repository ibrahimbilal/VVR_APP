/** Playlist timing shared by the editor and the renderer. */

import { MAX_PLAYLIST_CROSSFADE_SECONDS, MIN_CROSSFADE_SECONDS, MIN_TRIM_SECONDS } from './audioLooper'

export { MAX_PLAYLIST_CROSSFADE_SECONDS }

/**
 * Longest crossfade that still leaves half of every trimmed track,
 * including the join from the last track back to the first.
 */
export function playlistCrossfadeLimit(durations: number[]): number {
  if (durations.length < 2) return 0
  let limit = MAX_PLAYLIST_CROSSFADE_SECONDS
  for (let index = 0; index < durations.length; index += 1) {
    const current = durations[index] ?? 0
    const next = durations[(index + 1) % durations.length] ?? 0
    if (!(current > 0) || !(next > 0)) return 0
    limit = Math.min(limit, current * 0.5, next * 0.5)
  }
  return Math.max(0, limit)
}

/** Sequence length after internal joins and, when crossfade is on, the wrap back to the first track. */
export function playlistPeriod(durations: number[], crossfadeSeconds: number): number {
  const sum = durations.reduce((total, value) => total + value, 0)
  if (durations.length < 2 || !(crossfadeSeconds > 0)) return sum
  return sum - durations.length * crossfadeSeconds
}

export function playlistRepeats(period: number, targetDuration: number): number {
  if (!(period > 0) || !(targetDuration > 0)) return 0
  if (period >= targetDuration) return 1
  return targetDuration / period
}

/**
 * Validates a multi-track timeline and returns the loop period.
 * Crossfade off: the period is the sum of the trimmed lengths.
 * Crossfade on: each join, including last-to-first, overlaps by the same duration.
 */
export function assertPlaylistTimeline(
  durations: number[],
  crossfadeEnabled: boolean,
  crossfadeSeconds: number,
): number {
  if (durations.length < 2) throw new Error('Add at least two tracks.')
  for (const duration of durations) {
    if (!(duration >= MIN_TRIM_SECONDS)) throw new Error('Each trim must be longer than zero.')
  }
  if (!crossfadeEnabled) return playlistPeriod(durations, 0)
  const limit = playlistCrossfadeLimit(durations)
  if (!(limit >= MIN_CROSSFADE_SECONDS)) {
    throw new Error('These tracks are too short for a crossfade. Turn the transition off or use longer trims.')
  }
  if (!(crossfadeSeconds >= MIN_CROSSFADE_SECONDS)) {
    throw new Error(`Crossfade must be at least ${MIN_CROSSFADE_SECONDS}s.`)
  }
  if (crossfadeSeconds > limit + 1e-6) {
    throw new Error(
      `Crossfade must be at most ${limit.toFixed(2)}s for these tracks (half the shortest join, including the loop back to the first track).`,
    )
  }
  const period = playlistPeriod(durations, crossfadeSeconds)
  if (!(period > 0.05)) throw new Error('Crossfade removes the whole sequence. Shorten the transition.')
  return period
}
