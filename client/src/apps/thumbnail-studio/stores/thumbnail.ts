import { clampBadgeMarginPx, fullNormCrop, panNormCrop, presetAnchorPoint, zoomNormCrop, type FixedAnchor } from '@shared/thumbnailLayout'
import { DURATION_BADGE_OPTIONS, RESOLUTION_BADGE_OPTIONS } from '@shared/thumbnailBadges'
import {
  type BadgeId,
  type BadgeStyleId,
  type ThumbnailBadge,
  type ThumbnailDocument,
  type ThumbnailFit,
  THUMBNAIL_DOCUMENT_KEY,
  assetIdsInDocument,
  badgeAppearance,
  clampBadgeScale,
  createThumbnailDocument,
  dragBadge,
  legacyThumbnailAssets,
  parseThumbnailDocument,
  placeBadge,
  resetBadgePosition,
  syncPresetBadgeCoords,
  thumbnailFilename,
} from '@shared/thumbnailProject'
import { documentFromTransfer, validateThumbnailTransfer, type ThumbnailTransferPayload } from '@shared/thumbnailTransfer'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { deleteThumbnailValue, getImageAsset, listThumbnailKeys, loadThumbnailValue, saveThumbnailValue } from '../../../lib/idb'
import { usePlatformStore } from '../../../stores/platform'
import { movePendingAssets, releasePendingAssets, storeImageBlob, syncProjectAssets } from '../lib/assetStore'
import { exportThumbnailBlob, type ThumbnailRenderAssets } from '../lib/renderThumbnail'

const bitmaps = new Map<string, ImageBitmap>()
const LEGACY_KEYS = new Set(['catalog', 'presets', 'preset-default', 'active'])

export const useThumbnailStore = defineStore('thumbnail', () => {
  const platform = usePlatformStore()
  const doc = ref<ThumbnailDocument>(createThumbnailDocument())
  const hydrated = ref(false)
  const promptOpen = ref(false)
  const exporting = ref(false)
  const assetEpoch = ref(0)
  const pending = ref<ThumbnailTransferPayload | null>(null)
  const replaceOnTransfer = ref(false)
  let saveTimer = 0
  let bitmapKey = ''
  let savedAssetIds: string[] = []
  let initPromise: Promise<void> | null = null
  let consuming = false

  const hasImage = computed(() => Boolean(doc.value.image.assetId))
  const hasComposition = computed(() => doc.value.image.composition != null)

  async function init(): Promise<void> {
    if (hydrated.value) return
    if (initPromise) return initPromise
    initPromise = restore()
    try {
      await initPromise
    } finally {
      initPromise = null
    }
  }

  async function restore(): Promise<void> {
    await discardLegacy()
    await clearPersistedDocument()
    resetDocument()
    hydrated.value = true
  }

  async function clearPersistedDocument(): Promise<void> {
    const stored = await loadThumbnailValue<unknown>(THUMBNAIL_DOCUMENT_KEY)
    if (!stored) return
    const parsed = parseThumbnailDocument(stored)
    if (parsed) {
      await syncProjectAssets(parsed.id, assetIdsInDocument(parsed), [])
    } else {
      const legacy = legacyThumbnailAssets(stored)
      if (legacy) await syncProjectAssets(legacy.projectId, legacy.assetIds, [])
    }
    await deleteThumbnailValue(THUMBNAIL_DOCUMENT_KEY)
  }

  function resetDocument(): void {
    doc.value = createThumbnailDocument()
    savedAssetIds = []
    bitmapKey = ''
    for (const id of [...bitmaps.keys()]) {
      bitmaps.get(id)?.close()
      bitmaps.delete(id)
    }
    assetEpoch.value += 1
  }

  async function newProject(): Promise<void> {
    const hasWork = hasImage.value || pending.value !== null
    if (hasWork && !window.confirm('Start a new project? The current thumbnail will be cleared.')) return
    window.clearTimeout(saveTimer)
    const previousId = doc.value.id
    const previousIds = assetIdsInDocument(doc.value)
    pending.value = null
    promptOpen.value = false
    replaceOnTransfer.value = false
    resetDocument()
    await syncProjectAssets(previousId, previousIds, [])
    await deleteThumbnailValue(THUMBNAIL_DOCUMENT_KEY)
    await deleteThumbnailValue('pending-transfer')
  }

  async function discardLegacy(): Promise<void> {
    const keys = await listThumbnailKeys()
    for (const key of keys) {
      if (key === THUMBNAIL_DOCUMENT_KEY || key === 'pending-transfer') continue
      if (!LEGACY_KEYS.has(key) && !key.startsWith('project:')) continue
      if (key.startsWith('project:')) {
        const raw = await loadThumbnailValue<unknown>(key)
        const legacy = legacyThumbnailAssets(raw)
        if (legacy && legacy.assetIds.length > 0) await syncProjectAssets(legacy.projectId, legacy.assetIds, [])
      }
      await deleteThumbnailValue(key)
    }
  }

  async function consumeStoredTransfer(): Promise<void> {
    if (consuming || promptOpen.value) return
    consuming = true
    try {
      const stored = await loadThumbnailValue<unknown>('pending-transfer')
      if (!stored) {
        replaceOnTransfer.value = false
        return
      }
      const validated = validateThumbnailTransfer(stored)
      if (!validated.ok) {
        await deleteThumbnailValue('pending-transfer')
        replaceOnTransfer.value = false
        platform.toast(validated.error)
        return
      }
      pending.value = validated.payload
      if (replaceOnTransfer.value || !doc.value.image.assetId) {
        replaceOnTransfer.value = false
        await acceptTransfer('replace')
      } else {
        promptOpen.value = true
      }
    } finally {
      consuming = false
    }
  }

  function requestReplaceOnNextTransfer(): void {
    replaceOnTransfer.value = true
  }

  function clearReplaceOnNextTransfer(): void {
    replaceOnTransfer.value = false
  }

  async function acceptTransfer(choice: 'keep' | 'replace'): Promise<void> {
    const payload = pending.value
    promptOpen.value = false
    replaceOnTransfer.value = false
    if (!payload) return
    if (choice === 'keep') {
      await releasePendingAssets(payloadAssetIds(payload))
      pending.value = null
      await deleteThumbnailValue('pending-transfer')
      return
    }
    const previousIds = assetIdsInDocument(doc.value)
    let next = documentFromTransfer(payload, doc.value.id)
    const artwork = await getImageAsset(payload.artwork.assetId)
    if (artwork) {
      next.image.sourceWidth = artwork.width
      next.image.sourceHeight = artwork.height
    }
    await movePendingAssets(payloadAssetIds(payload), next.id)
    doc.value = next
    pending.value = null
    bitmapKey = ''
    await deleteThumbnailValue('pending-transfer')
    await syncBitmaps()
    await saveNow(previousIds)
  }

  function edit(mutator: (draft: ThumbnailDocument) => void): void {
    const draft = clone(doc.value)
    mutator(draft)
    draft.updatedAt = Date.now()
    doc.value = draft
    scheduleSave()
  }

  function patchBadge(id: BadgeId, mutator: (badge: ThumbnailBadge) => void): void {
    edit((draft) => {
      mutator(draft[id])
      const badge = draft[id]
      if (badge.anchor !== 'free' && !badge.deliberate) {
        const { width, height } = draft.export
        const point = presetAnchorPoint(badge.anchor, badge.margin, badge.offsetX, badge.offsetY, width, height)
        badge.x = point.x
        badge.y = point.y
      }
    })
  }

  async function uploadImage(file: File): Promise<void> {
    const previous = assetIdsInDocument(doc.value)
    try {
      const asset = await storeImageBlob(file, file.name, doc.value.id)
      const next = clone(doc.value)
      next.image = {
        assetId: asset.id,
        frameAssetId: null,
        composition: null,
        fit: 'cover',
        crop: fullNormCrop(),
        sourceWidth: asset.width,
        sourceHeight: asset.height,
      }
      next.source = {
        app: 'standalone',
        linkMode: 'snapshot',
        returnPath: null,
        sourceProjectId: null,
        videoWidth: null,
        videoHeight: null,
        durationSeconds: null,
      }
      next.updatedAt = Date.now()
      doc.value = next
      bitmapKey = ''
      await syncBitmaps()
      await saveNow(previous)
    } catch (error) {
      platform.toast(error instanceof Error ? error.message : 'Could not read that image.')
    }
  }

  function setFit(fit: ThumbnailFit): void {
    if (hasComposition.value) return
    edit((draft) => {
      draft.image.fit = fit
    })
  }

  function setZoom(level: number): void {
    if (hasComposition.value) return
    edit((draft) => {
      const current = zoomFromCrop(draft.image.crop.w)
      const factor = clamp(level, 1, 4) / current
      draft.image.crop = zoomNormCrop(draft.image.crop, factor)
    })
  }

  function setPan(axis: 'x' | 'y', value: number): void {
    if (hasComposition.value) return
    edit((draft) => {
      const crop = draft.image.crop
      if (axis === 'x') draft.image.crop = panNormCrop(crop, clamp(value, 0, 1 - crop.w) - crop.x, 0)
      else draft.image.crop = panNormCrop(crop, 0, clamp(value, 0, 1 - crop.h) - crop.y)
    })
  }

  function resetCrop(): void {
    edit((draft) => {
      draft.image.crop = fullNormCrop()
      draft.image.fit = 'cover'
    })
  }

  function setBadgeEnabled(id: BadgeId, enabled: boolean): void {
    patchBadge(id, (badge) => {
      badge.enabled = enabled
    })
  }

  function setBadgeText(id: BadgeId, text: string): void {
    patchBadge(id, (badge) => {
      badge.text = text.trim().slice(0, 32)
    })
  }

  function setResolutionLabel(label: string): void {
    const option = RESOLUTION_BADGE_OPTIONS.find((item) => item.label === label)
    if (option) setBadgeText('resolution', option.label)
  }

  function setDurationLabel(label: string): void {
    const option = DURATION_BADGE_OPTIONS.find((item) => item.label === label)
    if (option) setBadgeText('duration', option.label)
  }

  function place(id: BadgeId, anchor: FixedAnchor): void {
    edit((draft) => {
      const other = id === 'resolution' ? draft.duration : draft.resolution
      const { width, height } = draft.export
      draft[id] = placeBadge(draft[id], anchor, other, width, height)
    })
  }

  function setMargin(id: BadgeId, marginPx: number): void {
    edit((draft) => {
      const { width, height } = draft.export
      draft[id].margin = clampBadgeMarginPx(marginPx, width, height)
      syncPresetBadgeCoords(draft[id], width, height)
    })
  }

  function setHorizontal(id: BadgeId, value: number): void {
    patchBadge(id, (badge) => {
      if (badge.anchor === 'free' || badge.deliberate) badge.x = clamp(value, 0, 1)
      else badge.offsetX = clamp(value, -0.45, 0.45)
    })
  }

  function setVertical(id: BadgeId, value: number): void {
    patchBadge(id, (badge) => {
      if (badge.anchor === 'free' || badge.deliberate) badge.y = clamp(value, 0, 1)
      else badge.offsetY = clamp(value, -0.45, 0.45)
    })
  }

  function resetPosition(id: BadgeId): void {
    edit((draft) => {
      const other = id === 'resolution' ? draft.duration : draft.resolution
      const { width, height } = draft.export
      draft[id] = resetBadgePosition(draft[id], id, other, width, height)
    })
  }

  function setBadgeStyle(styleId: BadgeStyleId): void {
    edit((draft) => {
      const look = badgeAppearance(styleId, draft.resolution.appearance.scale)
      draft.resolution.appearance = { ...look }
      draft.duration.appearance = { ...look }
    })
  }

  function setBadgeScale(scale: number): void {
    edit((draft) => {
      const next = clampBadgeScale(scale)
      draft.resolution.appearance = { ...draft.resolution.appearance, scale: next }
      draft.duration.appearance = { ...draft.duration.appearance, scale: next }
    })
  }

  function moveBadge(id: BadgeId, x: number, y: number): void {
    edit((draft) => {
      draft[id] = dragBadge(draft[id], x, y)
    })
  }

  function setExportSize(width: number, height: number): void {
    edit((draft) => {
      const size = exactSize(width, height)
      draft.export.width = size.width
      draft.export.height = size.height
      syncPresetBadgeCoords(draft.resolution, size.width, size.height)
      syncPresetBadgeCoords(draft.duration, size.width, size.height)
    })
  }

  function setExportFormat(format: 'png' | 'jpeg'): void {
    edit((draft) => {
      draft.export.format = format
    })
  }

  function setJpegQuality(quality: number): void {
    edit((draft) => {
      draft.export.jpegQuality = clamp(quality, 0.5, 1)
    })
  }

  async function download(): Promise<void> {
    if (exporting.value) return
    exporting.value = true
    try {
      const blob = await exportThumbnailBlob(doc.value, renderAssets())
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = thumbnailFilename(doc.value.export.format, doc.value.export.width, doc.value.export.height)
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      platform.toast(error instanceof Error ? error.message : 'Could not export the thumbnail.')
    } finally {
      exporting.value = false
    }
  }

  function scheduleSave(): void {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      void saveNow()
    }, 400)
  }

  async function saveNow(previousOverride?: string[]): Promise<void> {
    if (!hydrated.value) return
    const current = clone(doc.value)
    current.updatedAt = Date.now()
    doc.value = { ...doc.value, updatedAt: current.updatedAt }
    await saveThumbnailValue(THUMBNAIL_DOCUMENT_KEY, current)
    const previous = previousOverride ?? savedAssetIds
    const nextIds = assetIdsInDocument(current)
    await syncProjectAssets(current.id, previous, nextIds)
    savedAssetIds = nextIds
  }

  function renderAssets(): ThumbnailRenderAssets {
    const byId: ThumbnailRenderAssets['byId'] = {}
    for (const [id, bitmap] of bitmaps) byId[id] = { source: bitmap, width: bitmap.width, height: bitmap.height }
    return { byId }
  }

  async function syncBitmaps(): Promise<void> {
    const ids = assetIdsInDocument(doc.value)
    const key = ids.slice().sort().join('|')
    if (key === bitmapKey) return
    for (const id of [...bitmaps.keys()]) {
      if (!ids.includes(id)) {
        bitmaps.get(id)?.close()
        bitmaps.delete(id)
      }
    }
    for (const id of ids) {
      if (bitmaps.has(id)) continue
      const asset = await getImageAsset(id)
      if (!asset) continue
      try {
        bitmaps.set(id, await createImageBitmap(asset.blob))
      } catch {
        platform.toast('Could not read a saved thumbnail image.')
      }
    }
    bitmapKey = [...bitmaps.keys()].sort().join('|')
    assetEpoch.value += 1
  }

  return {
    doc,
    hydrated,
    promptOpen,
    exporting,
    assetEpoch,
    pending,
    hasImage,
    hasComposition,
    init,
    newProject,
    consumeStoredTransfer,
    requestReplaceOnNextTransfer,
    clearReplaceOnNextTransfer,
    acceptTransfer,
    uploadImage,
    setFit,
    setZoom,
    setPan,
    resetCrop,
    setBadgeEnabled,
    setBadgeText,
    setResolutionLabel,
    setDurationLabel,
    place,
    setMargin,
    setHorizontal,
    setVertical,
    resetPosition,
    setBadgeStyle,
    setBadgeScale,
    moveBadge,
    setExportSize,
    setExportFormat,
    setJpegQuality,
    download,
    renderAssets,
  }
})

function payloadAssetIds(payload: ThumbnailTransferPayload): string[] {
  const ids = [payload.artwork.assetId]
  if (payload.frame?.assetId) ids.push(payload.frame.assetId)
  return ids
}

function zoomFromCrop(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  return clamp(1 / width, 1, 4)
}

function exactSize(width: number, height: number): { width: number; height: number } {
  if (width === 1920 && height === 1080) return { width: 1920, height: 1080 }
  if (width === 3840 && height === 2160) return { width: 3840, height: 2160 }
  return { width: 1280, height: 720 }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
