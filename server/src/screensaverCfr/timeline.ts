import {
  SCREENSAVER_CFR_DEFAULT_SEGMENT_SEC,
  SCREENSAVER_CFR_SEGMENT_CANDIDATES_SEC,
} from '../../../shared/screensaver'
import type { SubscribeAnimationSettings } from '../../../shared/screensaverSubscribeAnimation'

export type TimelineRegionKind = 'static' | 'dynamic'

export interface TimelineRegion {
  kind: TimelineRegionKind
  /** Inclusive start frame index in the final timeline. */
  startFrame: number
  /** Number of frames in this region. */
  frameCount: number
  /** Composition key — identical static regions share encoded segments. */
  compositionKey: string
  /** Present only for dynamic (subscribe animation) regions. */
  animation?: {
    startSec: number
    durationSec: number
  }
}

export interface StaticSegmentPlan {
  /** Frame counts of unique reusable segments to encode (descending preference applied). */
  uniqueFrameCounts: number[]
  /** Ordered list of references into uniqueFrameCounts for the concat manifest. */
  references: number[]
  /** Total frames covered. */
  totalFrames: number
}

export interface CfrTimeline {
  fps: number
  totalFrames: number
  durationSeconds: number
  regions: TimelineRegion[]
  preferredSegmentFrames: number
}

export interface BuildTimelineInput {
  fps: number
  durationSec: number
  compositionKey: string
  subscribeAnimation: SubscribeAnimationSettings | null
}

/**
 * Build a frame-accurate CFR timeline.
 * Integer frame indexes are the source of truth; durationSeconds is derived.
 */
export function buildCfrTimeline(input: BuildTimelineInput): CfrTimeline {
  const fps = input.fps
  const totalFrames = Math.round(input.durationSec * fps)
  if (totalFrames < 1) throw new Error('Export duration is too short for the selected frame rate.')

  const regions: TimelineRegion[] = []
  const anim = input.subscribeAnimation
  if (!anim || !anim.enabled) {
    regions.push({
      kind: 'static',
      startFrame: 0,
      frameCount: totalFrames,
      compositionKey: input.compositionKey,
    })
  } else {
    const startFrame = Math.max(0, Math.min(totalFrames, Math.round(anim.startSec * fps)))
    const animFrames = Math.max(1, Math.round(anim.durationSec * fps))
    const endFrame = Math.min(totalFrames, startFrame + animFrames)
    const actualAnimFrames = endFrame - startFrame
    if (actualAnimFrames < 1) throw new Error('Subscribe animation does not fit in the export duration.')

    if (startFrame > 0) {
      regions.push({
        kind: 'static',
        startFrame: 0,
        frameCount: startFrame,
        compositionKey: input.compositionKey,
      })
    }
    regions.push({
      kind: 'dynamic',
      startFrame,
      frameCount: actualAnimFrames,
      compositionKey: `${input.compositionKey}|anim`,
      animation: {
        startSec: startFrame / fps,
        durationSec: actualAnimFrames / fps,
      },
    })
    const tail = totalFrames - endFrame
    if (tail > 0) {
      regions.push({
        kind: 'static',
        startFrame: endFrame,
        frameCount: tail,
        compositionKey: input.compositionKey,
      })
    }
  }

  const summed = regions.reduce((sum, region) => sum + region.frameCount, 0)
  if (summed !== totalFrames) {
    throw new Error(`Timeline frame sum ${summed} does not match total ${totalFrames}.`)
  }

  return {
    fps,
    totalFrames,
    durationSeconds: totalFrames / fps,
    regions,
    preferredSegmentFrames: Math.round(SCREENSAVER_CFR_DEFAULT_SEGMENT_SEC * fps),
  }
}

/**
 * Plan reusable static segment lengths for a run of `frameCount` static frames.
 * Bulk coverage uses the preferred duration (PoC-validated 10 s by default).
 * Remainders are filled from shorter candidate lengths, then an exact leftover encode.
 * Avoids truncating compressed video at arbitrary non-keyframe boundaries.
 */
export function planStaticSegments(frameCount: number, fps: number, preferredSec = SCREENSAVER_CFR_DEFAULT_SEGMENT_SEC): StaticSegmentPlan {
  if (frameCount < 1) return { uniqueFrameCounts: [], references: [], totalFrames: 0 }

  const preferredFrames = Math.max(1, Math.round(preferredSec * fps))
  const remainderCandidates = [...SCREENSAVER_CFR_SEGMENT_CANDIDATES_SEC]
    .map((sec) => Math.max(1, Math.round(sec * fps)))
    .filter((frames) => frames < preferredFrames)
    .sort((a, b) => b - a)

  const references: number[] = []
  const used = new Map<number, true>()
  let remaining = frameCount

  if (preferredFrames <= frameCount) {
    const repeats = Math.floor(frameCount / preferredFrames)
    for (let index = 0; index < repeats; index += 1) references.push(preferredFrames)
    if (repeats > 0) used.set(preferredFrames, true)
    remaining = frameCount - repeats * preferredFrames
  }

  while (remaining > 0) {
    const fit = remainderCandidates.find((size) => size <= remaining)
    if (fit == null) {
      used.set(remaining, true)
      references.push(remaining)
      remaining = 0
      break
    }
    used.set(fit, true)
    references.push(fit)
    remaining -= fit
  }

  const uniqueFrameCounts = [...used.keys()].sort((a, b) => b - a)
  const totalFrames = references.reduce((sum, frames) => sum + frames, 0)
  if (totalFrames !== frameCount) {
    throw new Error(`Static segment plan covers ${totalFrames} frames, expected ${frameCount}.`)
  }
  return { uniqueFrameCounts, references, totalFrames }
}

/** Merge consecutive static regions that share a composition key (for encoding bookkeeping). */
export function staticRuns(timeline: CfrTimeline): { compositionKey: string; frameCount: number; startFrame: number }[] {
  const runs: { compositionKey: string; frameCount: number; startFrame: number }[] = []
  for (const region of timeline.regions) {
    if (region.kind !== 'static') continue
    const last = runs.at(-1)
    if (last && last.compositionKey === region.compositionKey && last.startFrame + last.frameCount === region.startFrame) {
      last.frameCount += region.frameCount
    } else {
      runs.push({
        compositionKey: region.compositionKey,
        frameCount: region.frameCount,
        startFrame: region.startFrame,
      })
    }
  }
  return runs
}

/**
 * Choose preferred reusable segment duration (seconds) from project shape.
 * Keeps the validated 10 s baseline unless a longer/shorter candidate clearly fits better.
 */
export function selectPreferredSegmentSeconds(totalStaticFrames: number, fps: number, uniqueCompositions: number): number {
  const staticSeconds = totalStaticFrames / fps
  if (staticSeconds <= 0) return SCREENSAVER_CFR_DEFAULT_SEGMENT_SEC
  if (uniqueCompositions > 3) return Math.min(SCREENSAVER_CFR_DEFAULT_SEGMENT_SEC, 5)
  // Prefer the validated 10 s baseline for typical screensaver lengths; longer
  // only when multi-hour static runs make fewer concat entries worthwhile.
  if (staticSeconds >= 3600) return 30
  if (staticSeconds >= 20) return SCREENSAVER_CFR_DEFAULT_SEGMENT_SEC
  if (staticSeconds >= 8) return 5
  return 2
}
