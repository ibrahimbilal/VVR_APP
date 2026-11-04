import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_SUBSCRIBE_EDGE_DISTANCE,
  DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE,
  defaultSubscribeAnimation,
  defaultSubscribeSizePercent,
  subscribeDesignWidthForStyle,
  type SubscribeAnimationStyle,
} from './screensaverSubscribeAnimation'

const OUTPUT_4K_WIDTH = 3840
const PADDING_DESIGN = 24

function designHeight(style: SubscribeAnimationStyle): number {
  return style === 'channel-card' ? 140 : 44
}

/** Mirrors client `subscribeAnimationLayout` sizing at a given output width. */
function layoutBitmapPixels(
  outputWidth: number,
  style: SubscribeAnimationStyle,
  sizePercent: number,
  edgeDistance = 0,
) {
  const designW = subscribeDesignWidthForStyle(style)
  const designH = designHeight(style)
  const contentWidth = Math.max(1, Math.round((outputWidth * sizePercent) / 100))
  const scale = contentWidth / designW
  const contentHeight = Math.round(designH * scale)
  const padding = Math.round(PADDING_DESIGN * scale)
  const edgeBottom = Math.max(0, Math.round(edgeDistance))
  const paddingBottom = padding + edgeBottom
  return {
    width: contentWidth + padding * 2,
    height: contentHeight + padding + paddingBottom,
    scale,
  }
}

describe('subscribe animation defaults', () => {
  it('uses edge distance 0 and per-style size defaults', () => {
    assert.equal(DEFAULT_SUBSCRIBE_EDGE_DISTANCE, 0)
    assert.equal(DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE['channel-card'], 27)
    assert.equal(DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE['subscribe-only'], 12)
    assert.equal(DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE['subscribe-alerts'], 18)
    assert.equal(DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE['like-subscribe-alerts'], 25)
    const defaults = defaultSubscribeAnimation()
    assert.equal(defaults.edgeDistance, 0)
    assert.equal(defaults.sizePercent, 27)
    assert.equal(defaultSubscribeSizePercent('subscribe-only'), 12)
  })
})

describe('subscribe animation 4K layout', () => {
  const styles = Object.keys(DEFAULT_SUBSCRIBE_SIZE_PERCENT_BY_STYLE) as SubscribeAnimationStyle[]

  for (const style of styles) {
    it(`${style} default layout fits 3840×2160 frame`, () => {
      const sizePercent = defaultSubscribeSizePercent(style)
      const layout = layoutBitmapPixels(OUTPUT_4K_WIDTH, style, sizePercent)
      assert.ok(layout.width <= OUTPUT_4K_WIDTH, `width ${layout.width}`)
      assert.ok(layout.height <= 2160, `height ${layout.height}`)
      assert.ok(layout.width >= 100 && layout.height >= 40)
    })
  }
})
