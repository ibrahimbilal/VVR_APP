import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defaultComposition } from './screensaverComposition'
import { moveAssetRefs, syncAssetRefs } from './thumbnailAssets'
import { nudgeForSharedAnchor, normToPx, rectsOverlap, topLeftFromAnchor } from './thumbnailLayout'
import {
  DURATION_BADGE_OPTIONS,
  RESOLUTION_BADGE_OPTIONS,
  badgeAssetFolder,
  nearestDurationBadgeLabel,
  normalizeDurationBadgeText,
  normalizeResolutionBadgeText,
  resolveBadgeAssetSlug,
} from './thumbnailBadges'
import {
  applyBadgeStyle,
  assetIdsInDocument,
  badgeAnchorPoint,
  badgeAppearance,
  badgeLines,
  chipLabel,
  createThumbnailDocument,
  dragBadge,
  exactExportSize,
  formatBadgeDuration,
  formatDurationParts,
  legacyThumbnailAssets,
  parseDurationText,
  parseThumbnailDocument,
  placeBadge,
  previewPixelSize,
  qualityFromResolution,
  qualityIdFromText,
  resetBadgePosition,
} from './thumbnailProject'
import { documentFromTransfer, validateThumbnailTransfer } from './thumbnailTransfer'

describe('thumbnail transfer', () => {
  it('rejects a payload without artwork', () => {
    const missing = validateThumbnailTransfer({ version: 1, sourceApp: 'standalone', artwork: {} })
    assert.equal(missing.ok, false)
    const unknown = validateThumbnailTransfer({ version: 2, sourceApp: 'standalone', artwork: { assetId: 'a' } })
    assert.equal(unknown.ok, false)
  })

  it('keeps a framed screensaver composition and fills both badges', () => {
    const composition = defaultComposition()
    composition.crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }
    composition.rotation = 12
    const result = validateThumbnailTransfer({
      version: 1,
      sourceApp: 'frame-screensaver',
      sourceProjectId: 'frame-screensaver',
      linkMode: 'linked',
      returnPath: '/frame-screensaver',
      title: 'Gallery',
      extra: 'ignore',
      artwork: { assetId: 'art', composition, fit: 'contain', ignored: true },
      frame: { assetId: 'frame-png' },
      video: { width: 1920, height: 1080, durationSeconds: 3600, nope: 1 },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal('extra' in result.payload, false)
    assert.equal(result.payload.linkMode, 'linked')
    assert.equal(result.payload.artwork.composition?.rotation, 12)
    const doc = documentFromTransfer(result.payload)
    assert.equal(doc.image.assetId, 'art')
    assert.equal(doc.image.crop.w, 0.5)
    assert.equal((doc.image.composition as { rotation: number }).rotation, 12)
    assert.equal(doc.image.frameAssetId, 'frame-png')
    assert.equal(doc.source.returnPath, '/frame-screensaver')
    assert.equal(doc.resolution.text, '1080P')
    assert.equal(doc.duration.text, '1 HOUR')
    assert.deepEqual(assetIdsInDocument(doc).sort(), ['art', 'frame-png'])
  })

  it('fills ranking metadata and leaves a plain upload on the default badges', () => {
    const ranking = validateThumbnailTransfer({
      version: 1,
      sourceApp: 'ranking-videos',
      linkMode: 'snapshot',
      artwork: { assetId: 'clip' },
      video: { width: 1080, height: 1920, durationSeconds: 8 * 60 * 60 },
    })
    assert.equal(ranking.ok, true)
    if (!ranking.ok) return
    const doc = documentFromTransfer(ranking.payload)
    assert.equal(doc.resolution.text, '1080P')
    assert.equal(doc.duration.text, '8 HOURS')
    assert.equal(doc.image.composition, null)

    const blank = createThumbnailDocument()
    blank.image.sourceWidth = 640
    blank.image.sourceHeight = 360
    assert.equal(blank.resolution.text, '4K UHD')
    assert.equal(blank.duration.text, '2 HOURS')
    blank.resolution.text = '8K UHD'
    const loaded = parseThumbnailDocument(JSON.parse(JSON.stringify(blank)))
    assert.equal(loaded?.resolution.text, '8K UHD')
    assert.equal(qualityIdFromText('8K UHD'), '8k')
  })
})

describe('badges', () => {
  it('formats duration labels', () => {
    assert.equal(formatBadgeDuration(30 * 60), '30 MIN')
    assert.equal(formatBadgeDuration(60 * 60), '1 HOUR')
    assert.equal(formatBadgeDuration(2 * 60 * 60), '2 HOURS')
    assert.equal(formatBadgeDuration(2.5 * 60 * 60), '2 HOURS 30 MIN')
    assert.equal(formatBadgeDuration(8 * 60 * 60), '8 HOURS')
    assert.equal(formatDurationParts(2, 30), '2 HOURS 30 MIN')
    assert.deepEqual(parseDurationText('2 HOURS 30 MIN'), { hours: 2, minutes: 30 })
    assert.equal(parseDurationText('ALL NIGHT'), null)
  })

  it('maps quality from the short side', () => {
    assert.equal(qualityFromResolution(1920, 1080).label, '1080P')
    assert.equal(qualityFromResolution(1080, 1920).label, '1080P')
    assert.equal(qualityFromResolution(2560, 1440).label, '1440P')
    assert.equal(qualityFromResolution(3840, 2160).label, '4K UHD')
    assert.equal(qualityFromResolution(7680, 4320).label, '8K UHD')
    assert.equal(qualityFromResolution(1280, 720).label, '720P')
    assert.equal(qualityFromResolution(640, 360).label, '360P')
  })

  it('applies a badge style without moving the badge or the image', () => {
    const doc = createThumbnailDocument()
    doc.resolution.text = '720P'
    doc.resolution.appearance.scale = 1.6
    const next = applyBadgeStyle(doc.resolution, 'silver-plate')
    assert.equal(next.text, '720P')
    assert.equal(next.anchor, doc.resolution.anchor)
    assert.equal(next.appearance.styleId, 'silver-plate')
    assert.equal(next.appearance.scale, 1.6)
    assert.equal(doc.resolution.appearance.styleId, 'gold-plate')
    const mutated = badgeAppearance('outline')
    mutated.styleId = 'gold'
    assert.equal(badgeAppearance('outline').styleId, 'outline')
    assert.equal(doc.image.assetId, null)
  })

  it('splits resolution and duration labels the same way', () => {
    assert.deepEqual(badgeLines('4K UHD'), { hero: '4K', foot: 'ULTRA HD' })
    assert.deepEqual(badgeLines('8K UHD'), { hero: '8K', foot: 'ULTRA HD' })
    assert.deepEqual(badgeLines('1080P'), { hero: '1080P', foot: null })
    assert.deepEqual(badgeLines('2 HOURS'), { hero: '2', foot: 'HOURS' })
    assert.deepEqual(badgeLines('1 HOUR'), { hero: '1', foot: 'HOUR' })
    assert.deepEqual(badgeLines('2 HOURS 30 MIN'), { hero: '2', foot: 'HOURS 30 MIN' })
    assert.deepEqual(badgeLines('30 MIN'), { hero: '30', foot: 'MIN' })
  })

  it('shortens chip labels to a number and one letter', () => {
    assert.equal(chipLabel('4K UHD'), '4K')
    assert.equal(chipLabel('8K UHD'), '8K')
    assert.equal(chipLabel('1080P'), '1080P')
    assert.equal(chipLabel('720P'), '720P')
    assert.equal(chipLabel('8 HOURS'), '8H')
    assert.equal(chipLabel('2 HOURS'), '2H')
    assert.equal(chipLabel('1 HOUR'), '1H')
    assert.equal(chipLabel('30 MIN'), '30M')
    assert.equal(chipLabel('2 HOURS 30 MIN'), '2H')
  })
})

describe('layout', () => {
  it('uses normalized coordinates that scale to any pixel size', () => {
    const doc = createThumbnailDocument()
    assert.equal(doc.resolution.anchor, 'top-right')
    assert.equal(doc.duration.anchor, 'bottom-left')
    assert.equal(normToPx(0.5, 1280) / 1280, normToPx(0.5, 3840) / 3840)
  })

  it('nudges a shared preset and leaves a dragged badge where it was dropped', () => {
    assert.deepEqual(nudgeForSharedAnchor('top-right'), { x: 0, y: 0.16 })
    assert.ok(nudgeForSharedAnchor('bottom-left').y < 0)
    assert.ok(nudgeForSharedAnchor('middle-left').x > 0)
    assert.ok(nudgeForSharedAnchor('middle-right').x < 0)

    const doc = createThumbnailDocument()
    doc.duration = placeBadge(doc.duration, 'top-right', doc.resolution)
    assert.equal(doc.duration.anchor, 'top-right')
    assert.equal(doc.duration.deliberate, false)
    assert.ok(doc.duration.offsetY > 0)
    const resolutionBox = topLeftFromAnchor(doc.resolution.anchor, doc.resolution.x, doc.resolution.y, 0.24, 0.12)
    const durationPoint = badgeAnchorPoint(doc.duration)
    const durationBox = topLeftFromAnchor(doc.duration.anchor, durationPoint.x, durationPoint.y, 0.24, 0.12)
    assert.equal(rectsOverlap(resolutionBox, durationBox), false)

    const nudgedY = doc.duration.y
    doc.resolution = placeBadge(doc.resolution, 'top-right', doc.duration)
    assert.equal(doc.resolution.offsetY, 0)
    assert.equal(doc.duration.y, nudgedY)

    const dragged = dragBadge(doc.duration, 0.42, 0.61)
    assert.equal(dragged.anchor, 'free')
    assert.equal(dragged.deliberate, true)
    const moved = placeBadge(doc.resolution, dragged.anchor === 'free' ? 'top-right' : dragged.anchor, dragged)
    assert.equal(dragged.x, 0.42)
    assert.equal(dragged.y, 0.61)
    assert.equal(moved.offsetY, 0)
    const reset = resetBadgePosition(dragged, 'duration', doc.resolution)
    assert.equal(reset.anchor, 'bottom-left')
    assert.equal(reset.deliberate, false)
    assert.equal(dragged.x, 0.42)
  })
})

describe('badge assets', () => {
  it('maps catalog labels to svg slugs and folders', () => {
    assert.equal(resolveBadgeAssetSlug('gold-plate', '4K UHD'), '4k-uhd')
    assert.equal(resolveBadgeAssetSlug('gold', '4K UHD'), '4k')
    assert.equal(resolveBadgeAssetSlug('silver', '1080P'), '1080p')
    assert.equal(resolveBadgeAssetSlug('outline', '2 HOURS'), '2-hours')
    assert.equal(resolveBadgeAssetSlug('invert', '30 MIN'), '30m')
    assert.equal(badgeAssetFolder('gold-stack'), 'stacks/gold-stack')
    assert.equal(RESOLUTION_BADGE_OPTIONS.length, 5)
    assert.equal(DURATION_BADGE_OPTIONS.length, 4)
  })

  it('normalizes legacy badge text to catalog labels', () => {
    assert.equal(normalizeResolutionBadgeText('1440P'), '1080P')
    assert.equal(normalizeDurationBadgeText('2 HOURS 30 MIN', 9000), '2 HOURS')
    assert.equal(nearestDurationBadgeLabel(3600), '1 HOUR')
  })
})

describe('export and persistence', () => {
  it('keeps 16:9 export pixels exact and caps preview', () => {
    assert.deepEqual(exactExportSize(3840, 2160), { width: 3840, height: 2160 })
    assert.deepEqual(exactExportSize(1920, 1080), { width: 1920, height: 1080 })
    assert.deepEqual(exactExportSize(100, 100), { width: 1280, height: 720 })
    const preview = previewPixelSize(3840, 2160, 960)
    assert.equal(Math.max(preview.width, preview.height), 960)
  })

  it('discards a legacy layer project and round-trips the badge document', () => {
    assert.equal(parseThumbnailDocument({ version: 1, id: 'old', layers: [] }), null)
    assert.equal(parseThumbnailDocument({ version: 9 }), null)
    assert.deepEqual(legacyThumbnailAssets({ version: 1, id: 'old', layers: [{ assetId: 'a' }, { assetId: '' }] }), {
      projectId: 'old',
      assetIds: ['a'],
    })
    const doc = createThumbnailDocument()
    doc.duration.text = '30 MIN'
    doc.export = { width: 1920, height: 1080, format: 'jpeg', jpegQuality: 0.8 }
    const loaded = parseThumbnailDocument(JSON.parse(JSON.stringify(doc)))
    assert.ok(loaded)
    assert.equal(loaded?.duration.text, '30 MIN')
    assert.equal(loaded?.export.width, 1920)
    assert.equal(loaded?.export.format, 'jpeg')
    assert.equal(loaded?.resolution.appearance.styleId, 'gold-plate')
    const legacy = JSON.parse(JSON.stringify(doc)) as { resolution: { appearance: { styleId: string } }; duration: { appearance: { styleId: string } } }
    legacy.resolution.appearance.styleId = 'luxury-gold'
    legacy.duration.appearance.styleId = 'modern-dark'
    const migrated = parseThumbnailDocument(legacy)
    assert.equal(migrated?.resolution.appearance.styleId, 'gold-plate')
    assert.equal(migrated?.duration.appearance.styleId, 'invert')
    assert.equal(loaded?.image.fit, 'cover')
  })
})

describe('assets', () => {
  it('does not delete a shared asset that another project still uses', () => {
    const assets = [
      { id: 'shared', refs: ['one', 'two'] },
      { id: 'only-one', refs: ['one'] },
    ]
    const afterOne = syncAssetRefs(assets, 'one', [])
    assert.deepEqual(afterOne.removed, ['only-one'])
    assert.deepEqual(afterOne.assets.find((item) => item.id === 'shared')?.refs, ['two'])
    const afterTwo = syncAssetRefs(afterOne.assets, 'two', [])
    assert.deepEqual(afterTwo.removed, ['shared'])
    const moved = moveAssetRefs([{ id: 'art', refs: ['pending-transfer'] }], 'pending-transfer', 'project-1')
    assert.deepEqual(moved.assets[0]?.refs, ['project-1'])
    assert.deepEqual(moved.removed, [])
  })
})
