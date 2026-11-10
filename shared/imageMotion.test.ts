import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyEasing,
  computeCoverGeometry,
  cropAtProgress,
  defaultMotionSettings,
  offsetXAtProgress,
} from './imageMotion'
import { buildTimelineSegments, locatePlayhead, timelineDuration, joinFadeAfter } from './imageMotionTimeline'
import { defaultTransitionAfter, normalizeMotionSettings, type ImageMotionSegment } from './imageMotion'

describe('imageMotion cover geometry', () => {
  it('full pan RTL starts at right edge and ends at left', () => {
    const geo = computeCoverGeometry(3840, 2160, 1080, 1920, 1)
    assert.ok(geo.horizontalOverflow > 0)
    const motion = { ...defaultMotionSettings('full'), direction: 'rtl' as const }
    const startX = offsetXAtProgress(geo, motion, 0, 0)
    const endX = offsetXAtProgress(geo, motion, 1, 1)
    assert.equal(startX, geo.horizontalOverflow)
    assert.equal(endX, 0)
  })

  it('full pan LTR reverses travel', () => {
    const geo = computeCoverGeometry(3840, 2160, 1080, 1920, 1)
    const motion = { ...defaultMotionSettings('full'), direction: 'ltr' as const }
    assert.equal(offsetXAtProgress(geo, motion, 0, 0), 0)
    assert.equal(offsetXAtProgress(geo, motion, 1, 1), geo.horizontalOverflow)
  })

  it('slow pan respects travel distance', () => {
    const geo = computeCoverGeometry(3840, 2160, 1080, 1920, 1)
    const motion = normalizeMotionSettings({ mode: 'slow', travelDistance: 0.3, startPosition: 0, direction: 'rtl' })
    const travel = geo.horizontalOverflow * 0.3
    const startX = offsetXAtProgress(geo, motion, 0, 0)
    const endX = offsetXAtProgress(geo, motion, 1, 1)
    assert.ok(Math.abs(startX - geo.horizontalOverflow) < 1)
    assert.ok(Math.abs(endX - (geo.horizontalOverflow - travel)) < 1)
  })

  it('zero horizontal overflow does not move', () => {
    const geo = computeCoverGeometry(1080, 1920, 1080, 1920, 1)
    assert.equal(geo.horizontalOverflow, 0)
    const motion = defaultMotionSettings('full')
    assert.equal(offsetXAtProgress(geo, motion, 0, 0), 0)
    assert.equal(offsetXAtProgress(geo, motion, 1, 1), 0)
  })

  it('zoom increases overflow or keeps crop valid', () => {
    const base = cropAtProgress(3840, 2160, 1080, 1920, defaultMotionSettings(), 0.5)
    const zoomed = cropAtProgress(3840, 2160, 1080, 1920, { ...defaultMotionSettings(), zoom: 1.2 }, 0.5)
    assert.ok(zoomed.sourceW <= 3840)
    assert.ok(zoomed.sourceH <= 2160)
    assert.ok(zoomed.sourceX >= 0)
    assert.ok(base.sourceX >= 0)
  })
})

describe('imageMotion easing', () => {
  it('easing endpoints stay 0 and 1', () => {
    for (const easing of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      assert.equal(applyEasing(0, easing), 0)
      assert.equal(applyEasing(1, easing), 1)
    }
  })
})

function fakeSegment(partial: Partial<ImageMotionSegment> = {}): ImageMotionSegment {
  return {
    id: 'a',
    fileName: 'a.jpg',
    width: 100,
    height: 100,
    serverId: null,
    duration: 10,
    motion: defaultMotionSettings(),
    transitionAfter: defaultTransitionAfter(),
    ...partial,
  }
}

describe('imageMotionTimeline', () => {
  it('single segment timeline', () => {
    const segs = [fakeSegment({ motion: { ...defaultMotionSettings(), duration: 8 } })]
    assert.equal(timelineDuration(segs), 8)
    const loc = locatePlayhead(segs, 4)
    assert.ok(loc)
    assert.equal(loc!.segmentIndex, 0)
    assert.equal(loc!.localTime, 4)
  })

  it('crossfade keeps the sum of the image durations', () => {
    const segs = [
      fakeSegment({
        motion: { ...defaultMotionSettings(), duration: 10 },
        transitionAfter: { type: 'fade', fadeDuration: 0.5 },
      }),
      fakeSegment({
        id: 'b',
        motion: { ...defaultMotionSettings(), duration: 10 },
        transitionAfter: { type: 'fade', fadeDuration: 0.5 },
      }),
      fakeSegment({ id: 'c', motion: { ...defaultMotionSettings(), duration: 10 } }),
    ]
    assert.equal(joinFadeAfter(segs, 0), 0.5)
    assert.equal(timelineDuration(segs), 30)
    const rows = buildTimelineSegments(segs)
    assert.equal(rows[1]!.start, 10)
    assert.equal(rows[2]!.start, 20)
    const fade = locatePlayhead(segs, 10.25)
    assert.equal(fade?.crossfade?.fromIndex, 0)
    assert.equal(fade?.crossfade?.toIndex, 1)
  })

  it('locate at segment boundary', () => {
    const segs = [
      fakeSegment({
        motion: { ...defaultMotionSettings(), duration: 8 },
        transitionAfter: { type: 'cut', fadeDuration: 0.5 },
      }),
      fakeSegment({ id: 'b', motion: { ...defaultMotionSettings(), duration: 12 } }),
    ]
    const loc = locatePlayhead(segs, 8)
    assert.ok(loc)
    assert.equal(loc!.segmentIndex, 1)
    assert.equal(loc!.localTime, 0)
  })
})
