import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defaultSubscribeAnimation } from '../../../shared/screensaverSubscribeAnimation'
import {
  buildCfrTimeline,
  planStaticSegments,
  selectPreferredSegmentSeconds,
  staticRuns,
} from './timeline'

describe('buildCfrTimeline', () => {
  it('builds a static-only timeline with exact frame sum', () => {
    const timeline = buildCfrTimeline({
      fps: 60,
      durationSec: 60,
      compositionKey: 'art',
      subscribeAnimation: null,
    })
    assert.equal(timeline.totalFrames, 3600)
    assert.equal(timeline.regions.length, 1)
    assert.equal(timeline.regions[0]!.kind, 'static')
    assert.equal(timeline.regions[0]!.frameCount, 3600)
  })

  it('places subscribe animation at the beginning', () => {
    const anim = defaultSubscribeAnimation()
    anim.enabled = true
    anim.startSec = 0
    anim.durationSec = 7
    const timeline = buildCfrTimeline({
      fps: 60,
      durationSec: 60,
      compositionKey: 'art',
      subscribeAnimation: anim,
    })
    assert.equal(timeline.regions[0]!.kind, 'dynamic')
    assert.equal(timeline.regions[0]!.frameCount, 420)
    assert.equal(timeline.regions[1]!.kind, 'static')
    assert.equal(timeline.regions[1]!.frameCount, 3180)
    assert.equal(
      timeline.regions.reduce((sum, region) => sum + region.frameCount, 0),
      3600,
    )
  })

  it('places subscribe animation in the middle', () => {
    const anim = defaultSubscribeAnimation()
    anim.enabled = true
    anim.startSec = 10
    anim.durationSec = 7
    const timeline = buildCfrTimeline({
      fps: 30,
      durationSec: 60,
      compositionKey: 'art',
      subscribeAnimation: anim,
    })
    assert.equal(timeline.totalFrames, 1800)
    assert.equal(timeline.regions.length, 3)
    assert.equal(timeline.regions[0]!.kind, 'static')
    assert.equal(timeline.regions[0]!.frameCount, 300)
    assert.equal(timeline.regions[1]!.kind, 'dynamic')
    assert.equal(timeline.regions[1]!.frameCount, 210)
    assert.equal(timeline.regions[2]!.kind, 'static')
    assert.equal(timeline.regions[2]!.frameCount, 1290)
  })

  it('places subscribe animation at the end', () => {
    const anim = defaultSubscribeAnimation()
    anim.enabled = true
    anim.startSec = 53
    anim.durationSec = 7
    const timeline = buildCfrTimeline({
      fps: 60,
      durationSec: 60,
      compositionKey: 'art',
      subscribeAnimation: anim,
    })
    assert.equal(timeline.regions.length, 2)
    assert.equal(timeline.regions[0]!.kind, 'static')
    assert.equal(timeline.regions[0]!.frameCount, 3180)
    assert.equal(timeline.regions[1]!.kind, 'dynamic')
    assert.equal(timeline.regions[1]!.frameCount, 420)
  })

  it('supports all CFR frame rates without drifting the sum', () => {
    for (const fps of [24, 25, 30, 50, 60]) {
      const timeline = buildCfrTimeline({
        fps,
        durationSec: 10,
        compositionKey: 'art',
        subscribeAnimation: null,
      })
      assert.equal(timeline.totalFrames, Math.round(10 * fps))
      assert.equal(timeline.durationSeconds, timeline.totalFrames / fps)
    }
  })
})

describe('planStaticSegments', () => {
  it('reuses a preferred segment and encodes an exact remainder', () => {
    const plan = planStaticSegments(3180, 60, 10)
    assert.ok(plan.uniqueFrameCounts.includes(600))
    assert.equal(plan.totalFrames, 3180)
    assert.equal(
      plan.references.reduce((sum, frames) => sum + frames, 0),
      3180,
    )
    // Remainder that is not a candidate length is encoded exactly (no mid-GOP trim).
    const covered = plan.references.reduce((sum, frames) => sum + frames, 0)
    assert.equal(covered, 3180)
    assert.ok(plan.uniqueFrameCounts.every((frames) => frames > 0))
  })

  it('handles very short static regions', () => {
    const plan = planStaticSegments(45, 60, 10)
    assert.equal(plan.totalFrames, 45)
    assert.deepEqual(plan.uniqueFrameCounts, [45])
  })

  it('handles non-divisible durations without truncating mid-plan', () => {
    const plan = planStaticSegments(1234, 60, 10)
    assert.equal(plan.totalFrames, 1234)
    assert.equal(plan.references.reduce((sum, frames) => sum + frames, 0), 1234)
  })
})

describe('selectPreferredSegmentSeconds / staticRuns', () => {
  it('prefers longer segments for hour-scale static runs', () => {
    assert.equal(selectPreferredSegmentSeconds(60 * 60 * 60, 60, 1), 30)
    assert.equal(selectPreferredSegmentSeconds(600 * 60, 60, 1), 10)
  })

  it('merges consecutive static regions', () => {
    const anim = defaultSubscribeAnimation()
    anim.enabled = false
    const timeline = buildCfrTimeline({
      fps: 60,
      durationSec: 20,
      compositionKey: 'art',
      subscribeAnimation: anim,
    })
    assert.equal(staticRuns(timeline).length, 1)
  })
})
