import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defaultComposition } from './screensaverComposition'
import { moveAssetRefs, syncAssetRefs } from './thumbnailAssets'
import { canRedo, canUndo, createHistory, historyCommit, historyRedo, historyUndo } from './thumbnailHistory'
import { anchorPoint, autoPlaceBadges, contrastPair, normToPx, rectsOverlap, topLeftFromAnchor } from './thumbnailLayout'
import {
  THUMBNAIL_TEMPLATES,
  applyPreset,
  applyTemplate,
  artworkLayer,
  badgeLabel,
  clampQualityChoice,
  createThumbnailProject,
  deleteUserPreset,
  exactExportSize,
  formatBadgeDuration,
  frameLayer,
  layersInDrawOrder,
  missingAssetIds,
  parsePreset,
  parseProject,
  presetFromProject,
  previewPixelSize,
  qualityFromResolution,
  reorderLayer,
  sanitizeFilenamePart,
  sanitizeQualityOverride,
  serializePreset,
  serializeProject,
  thumbnailFilename,
} from './thumbnailProject'
import { projectFromTransfer, validateThumbnailTransfer } from './thumbnailTransfer'
import { zipStored } from './thumbnailZip'

describe('thumbnail transfer', () => {
  it('rejects a payload without artwork', () => {
    const missing = validateThumbnailTransfer({ version: 1, sourceApp: 'standalone', artwork: {} })
    assert.equal(missing.ok, false)
    const unknown = validateThumbnailTransfer({ version: 2, sourceApp: 'standalone', artwork: { assetId: 'a' } })
    assert.equal(unknown.ok, false)
  })

  it('drops unknown fields and keeps a framed screensaver composition', () => {
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
    assert.equal(result.payload.artwork.composition?.crop.x, 0.1)
    const project = projectFromTransfer(result.payload)
    assert.equal(artworkLayer(project)?.assetId, 'art')
    assert.equal(artworkLayer(project)?.crop.w, 0.5)
    assert.equal((artworkLayer(project)?.composition as { rotation: number }).rotation, 12)
    assert.equal(frameLayer(project)?.assetId, 'frame-png')
    assert.equal(frameLayer(project)?.visible, true)
    assert.equal(project.returnPath, '/frame-screensaver')
    assert.equal(badgeLabel(project, project.layers.find((item) => item.badgeRole === 'quality')!), '1080P')
    assert.equal(badgeLabel(project, project.layers.find((item) => item.badgeRole === 'duration')!), '1 HOUR')
    assert.deepEqual(missingAssetIds(project, ['art']), ['frame-png'])
  })
})

describe('badges', () => {
  it('formats duration labels', () => {
    assert.equal(formatBadgeDuration(30 * 60), '30 MIN')
    assert.equal(formatBadgeDuration(60 * 60), '1 HOUR')
    assert.equal(formatBadgeDuration(2 * 60 * 60), '2 HOURS')
    assert.equal(formatBadgeDuration(2.5 * 60 * 60), '2 HOURS 30 MIN')
    assert.equal(formatBadgeDuration(8 * 60 * 60), '8 HOURS')
    assert.equal(formatBadgeDuration(12 * 60 * 60), '12 HOURS')
  })

  it('maps quality from the short side and refuses a higher claim', () => {
    assert.equal(qualityFromResolution(1920, 1080).label, '1080P')
    assert.equal(qualityFromResolution(1080, 1920).label, '1080P')
    assert.equal(qualityFromResolution(2560, 1440).label, '1440P')
    assert.equal(qualityFromResolution(3840, 2160).label, '4K UHD')
    assert.equal(qualityFromResolution(7680, 4320).label, '8K UHD')
    assert.equal(qualityFromResolution(1280, 720).label, '720P')
    assert.equal(qualityFromResolution(640, 360).label, '360P')
    assert.equal(clampQualityChoice('8k', '1080'), '1080')
    assert.equal(clampQualityChoice('720', '1080'), '720')
    assert.equal(sanitizeQualityOverride('8K UHD', 1920, 1080), null)
    assert.equal(sanitizeQualityOverride('720P', 1920, 1080), '720P')
  })
})

describe('layout', () => {
  it('uses normalized coordinates that scale to any pixel size', () => {
    assert.deepEqual(anchorPoint('top-left', 0.04), { x: 0.04, y: 0.04 })
    assert.deepEqual(anchorPoint('center', 0.04), { x: 0.5, y: 0.5 })
    const box = topLeftFromAnchor('top-right', 0.96, 0.04, 0.2, 0.1)
    assert.equal(box.x, 0.76)
    assert.equal(normToPx(0.5, 1280) / 1280, normToPx(0.5, 3840) / 3840)
  })

  it('places badges without overlap and prefers contrast', () => {
    const placed = autoPlaceBadges(
      [
        { id: 'quality', width: 0.2, height: 0.1, prefer: 'top-right' },
        { id: 'duration', width: 0.2, height: 0.1, prefer: 'bottom-left' },
      ],
      { margin: 0.04 },
    )
    assert.equal(placed.quality.anchor, 'top-right')
    assert.equal(placed.duration.anchor, 'bottom-left')
    const qualityBox = topLeftFromAnchor(placed.quality.anchor, placed.quality.x, placed.quality.y, 0.2, 0.1)
    const durationBox = topLeftFromAnchor(placed.duration.anchor, placed.duration.x, placed.duration.y, 0.2, 0.1)
    assert.equal(rectsOverlap(qualityBox, durationBox), false)

    const contrasted = autoPlaceBadges(
      [{ id: 'quality', width: 0.2, height: 0.1, prefer: 'top-right' }],
      {
        margin: 0.04,
        textIsLight: true,
        luminance: { 'top-right': 0.95, 'top-left': 0.05 },
      },
    )
    assert.equal(contrasted.quality.anchor, 'top-left')
    assert.equal(contrastPair(0.9).color, '#161616')
    assert.equal(contrastPair(0.1).color, '#f7f7f7')
  })

  it('reorders layers by z', () => {
    const project = createThumbnailProject()
    const title = project.layers.find((item) => item.textRole === 'title')
    assert.ok(title)
    const reordered = reorderLayer(project.layers, title.id, -1)
    const before = layersInDrawOrder(project.layers).map((item) => item.id)
    const after = layersInDrawOrder(reordered).map((item) => item.id)
    assert.notEqual(after.at(-1), before.at(-1))
    assert.equal(after.at(-1), before.at(-2))
  })
})

describe('templates and presets', () => {
  it('keeps built-in templates immutable', () => {
    assert.equal(THUMBNAIL_TEMPLATES.length, 9)
    assert.equal(Object.isFrozen(THUMBNAIL_TEMPLATES), true)
    const first = applyTemplate(createThumbnailProject('Ribo'), 'luxury-gold')
    const title = first.layers.find((item) => item.textRole === 'title')
    assert.ok(title)
    title.textStyle.color = '#000000'
    const second = applyTemplate(createThumbnailProject('Ribo'), 'luxury-gold')
    assert.notEqual(second.layers.find((item) => item.textRole === 'title')?.textStyle.color, '#000000')
    assert.equal(first.templateId, 'luxury-gold')
    const clean = applyTemplate(first, 'clean-artwork')
    assert.equal(clean.layers.find((item) => item.badgeRole === 'quality')?.visible, false)
    assert.equal(deleteUserPreset([], 'luxury-gold').length, 0)
  })

  it('round-trips a user preset and rejects a newer version', () => {
    const styled = applyTemplate(createThumbnailProject('Named'), 'cinematic')
    const preset = presetFromProject(styled, 'My cinematic')
    const parsed = parsePreset(serializePreset(preset))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    const applied = applyPreset(createThumbnailProject('Named'), parsed.preset)
    assert.equal(applied.templateId, 'cinematic')
    assert.equal(artworkLayer(applied)?.assetId, null)
    const newer = parsePreset(JSON.stringify({ version: 2, name: 'Later' }))
    assert.equal(newer.ok, false)
  })
})

describe('export and history', () => {
  it('keeps export pixels exact and caps preview', () => {
    assert.deepEqual(exactExportSize(3840, 2160), { width: 3840, height: 2160 })
    const preview = previewPixelSize(3840, 2160, 960)
    assert.equal(Math.max(preview.width, preview.height), 960)
    assert.equal(sanitizeFilenamePart('My Project!'), 'my-project')
    assert.equal(thumbnailFilename('My Project', 'luxury-gold', 1280, 720, 'png'), 'my-project-thumbnail-luxury-gold-1280x720.png')
  })

  it('undoes and redoes committed edits', () => {
    const start = createThumbnailProject('One')
    let history = createHistory(start)
    history = historyCommit(history, { ...start, name: 'Two' })
    history = historyCommit(history, { ...start, name: 'Three' })
    assert.equal(canUndo(history), true)
    history = historyUndo(history)
    assert.equal(history.present.name, 'Two')
    history = historyRedo(history)
    assert.equal(history.present.name, 'Three')
    const undone = historyUndo(historyUndo(historyUndo(history)))
    assert.equal(canUndo(undone), false)
    assert.equal(undone.present.name, 'One')
  })

  it('stores a zip of the selected variation bytes', () => {
    const payload = new TextEncoder().encode('png-bytes')
    const zip = zipStored([{ name: 'gallery-thumbnail-modern-dark-1280x720.png', data: payload }])
    assert.equal(zip[0], 0x50)
    assert.equal(zip[1], 0x4b)
    const text = new TextDecoder().decode(zip)
    assert.equal(text.includes('gallery-thumbnail-modern-dark-1280x720.png'), true)
    assert.equal(text.includes('png-bytes'), true)
  })
})

describe('assets and persistence', () => {
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

  it('round-trips a project document', () => {
    const project = applyTemplate(createThumbnailProject('Saved'), 'nature')
    project.durationSeconds = 90 * 60
    const loaded = parseProject(JSON.parse(serializeProject(project)))
    assert.ok(loaded)
    assert.equal(loaded?.name, 'Saved')
    assert.equal(loaded?.templateId, 'nature')
    assert.equal(loaded?.width, 1280)
    assert.equal(loaded?.height, 720)
    assert.equal(loaded?.layers.length, project.layers.length)
    assert.equal(parseProject({ version: 9 }), null)
  })
})
