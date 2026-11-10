import { resolveFade } from './timeline'
import type { ImageMotionSegment, SegmentTransitionSettings } from './imageMotion'

export interface TimelineSegment {
  index: number
  segment: ImageMotionSegment
  duration: number
  start: number
  joinFade: number
  transitionAfter: SegmentTransitionSettings
}

export interface PlayheadLocation {
  segmentIndex: number
  localTime: number
  localProgress: number
  globalTime: number
  crossfade: CrossfadeState | null
}

export interface CrossfadeState {
  fromIndex: number
  toIndex: number
  blend: number
  fadeDuration: number
  fromProgress: number
  toProgress: number
}

function segmentDuration(segment: ImageMotionSegment): number {
  return Math.max(0.3, segment.motion.duration || segment.duration)
}

export function joinFadeAfter(segments: ImageMotionSegment[], index: number): number {
  if (index < 0 || index >= segments.length - 1) return 0
  const seg = segments[index]
  if (!seg || seg.transitionAfter.type !== 'fade') return 0
  const a = segmentDuration(seg)
  const b = segmentDuration(segments[index + 1]!)
  return resolveFade([a, b], 'fade', seg.transitionAfter.fadeDuration)
}

export function buildTimelineSegments(segments: ImageMotionSegment[]): TimelineSegment[] {
  let start = 0
  return segments.map((segment, index) => {
    const duration = segmentDuration(segment)
    const row: TimelineSegment = {
      index,
      segment,
      duration,
      start,
      joinFade: joinFadeAfter(segments, index),
      transitionAfter: segment.transitionAfter,
    }
    start += duration
    return row
  })
}

/** Sum of the image durations. A crossfade plays inside the next image's time and does not shorten the total. */
export function timelineDuration(segments: ImageMotionSegment[]): number {
  return segments.reduce((total, segment) => total + segmentDuration(segment), 0)
}

export function locatePlayhead(segments: ImageMotionSegment[], playhead: number): PlayheadLocation | null {
  if (segments.length === 0) return null
  const timeline = buildTimelineSegments(segments)
  const total = timelineDuration(segments)
  const t = Math.min(Math.max(0, playhead), Math.max(0, total - 1e-6))

  for (let i = 0; i < timeline.length; i++) {
    const row = timeline[i]!
    const incomingFade = i > 0 ? timeline[i - 1]!.joinFade : 0
    if (incomingFade > 0 && t >= row.start && t < row.start + incomingFade) {
      const blend = (t - row.start) / incomingFade
      const toProgress = row.duration > 0 ? Math.min(1, (t - row.start) / row.duration) : 0
      return {
        segmentIndex: i,
        localTime: t - row.start,
        localProgress: toProgress,
        globalTime: t,
        crossfade: {
          fromIndex: i - 1,
          toIndex: i,
          blend: Math.min(1, Math.max(0, blend)),
          fadeDuration: incomingFade,
          fromProgress: 1,
          toProgress,
        },
      }
    }

    const nextStart = i < timeline.length - 1 ? timeline[i + 1]!.start : total
    if (t >= row.start && t < nextStart) {
      const localTime = t - row.start
      return {
        segmentIndex: i,
        localTime,
        localProgress: row.duration > 0 ? Math.min(1, localTime / row.duration) : 0,
        globalTime: t,
        crossfade: null,
      }
    }
  }

  const last = timeline[timeline.length - 1]!
  return {
    segmentIndex: timeline.length - 1,
    localTime: last.duration,
    localProgress: 1,
    globalTime: t,
    crossfade: null,
  }
}

/** Per-join xfade offsets for chained FFmpeg transitions. */
export function xfadeJoins(
  segments: ImageMotionSegment[],
): { offset: number; fade: number; fromInput: number; toInput: number }[] {
  const timeline = buildTimelineSegments(segments)
  const joins: { offset: number; fade: number; fromInput: number; toInput: number }[] = []
  for (let i = 0; i < timeline.length - 1; i++) {
    const row = timeline[i]!
    if (row.joinFade <= 0) continue
    joins.push({ offset: row.start + row.duration, fade: row.joinFade, fromInput: i, toInput: i + 1 })
  }
  return joins
}
