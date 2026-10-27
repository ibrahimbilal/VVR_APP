import { placementForFit, sanitizeComposition } from '@shared/screensaverComposition'
import { canRedo, canUndo, createHistory, historyCheckpoint, historyCommit, historyDropCheckpoint, historyRedo, historyReplace, historyUndo, type HistoryStack } from '@shared/thumbnailHistory'
import { autoPlaceBadges, fullNormCrop, panNormCrop, zoomNormCrop, type FixedAnchor } from '@shared/thumbnailLayout'
import {
  type ContentBadgeId,
  type QualityId,
  type SeasonId,
  type TemplateId,
  type ThumbnailAspect,
  type ThumbnailCatalogEntry,
  type ThumbnailFit,
  type ThumbnailPreset,
  type ThumbnailProject,
  QUALITY_OPTIONS,
  addImageLayer,
  addShapeLayer,
  addTextLayer,
  alignLayerSelection,
  applyPreset,
  applyTemplate,
  artworkLayer,
  assetIdsInProject,
  catalogEntry,
  clampQualityChoice,
  createThumbnailProject,
  deleteUserPreset,
  duplicateLayer,
  frameLayer,
  parsePreset,
  parseProject,
  nudgeLayer,
  patchLayer,
  placeLayerAtAnchor,
  presetFromProject,
  qualityFromResolution,
  removeLayers,
  reorderLayer,
  sanitizeQualityOverride,
  serializePreset,
  setOutputSize,
  setSeason,
  withArtworkSize,
} from '@shared/thumbnailProject'
import { projectFromTransfer, validateThumbnailTransfer, type ThumbnailTransferPayload } from '@shared/thumbnailTransfer'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { deleteThumbnailValue, getImageAsset, loadThumbnailValue, saveThumbnailValue } from '../../../lib/idb'
import { usePlatformStore } from '../../../stores/platform'
import { movePendingAssets, releasePendingAssets, storeImageBlob, syncProjectAssets } from '../lib/assetStore'
import { renderThumbnail, sampleAnchorLuminance, type ThumbnailRenderAssets } from '../lib/renderThumbnail'

type EditorSection = 'templates' | 'assets' | 'text' | 'badges' | 'backgrounds' | 'frames' | 'presets'
type TransferChoice = 'keep' | 'replace' | 'save-new'

const bitmaps = new Map<string, ImageBitmap>()

export const useThumbnailStore = defineStore('thumbnail', () => {
  const platform = usePlatformStore()
  const initialProject = createThumbnailProject()
  const project = ref<ThumbnailProject>(initialProject)
  const history = ref<HistoryStack<ThumbnailProject>>(createHistory(initialProject))
  const hydrated = ref(false)
  const dirty = ref(false)
  const persisted = ref(false)
  const mode = ref<'quick' | 'advanced'>('quick')
  const section = ref<EditorSection>('templates')
  const selectedIds = ref<string[]>([])
  const zoom = ref(1)
  const catalog = ref<ThumbnailCatalogEntry[]>([])
  const presets = ref<ThumbnailPreset[]>([])
  const defaultPresetId = ref<string | null>(null)
  const promptOpen = ref(false)
  const exportOpen = ref(false)
  const projectsOpen = ref(false)
  const previewOpen = ref(false)
  const missingAssets = ref<string[]>([])
  const assetEpoch = ref(0)
  const guideVertical = ref(false)
  const guideHorizontal = ref(false)
  const pending = ref<ThumbnailTransferPayload | null>(null)
  let gesturing = false
  let saveTimer = 0
  let bitmapKey = ''
  let savedAssetIds: string[] = []
  const touchedAssetIds = new Set<string>()
  let initPromise: Promise<void> | null = null
  let consuming = false

  const canUndoEdit = computed(() => canUndo(history.value))
  const canRedoEdit = computed(() => canRedo(history.value))
  const primary = computed(() => {
    const id = selectedIds.value[selectedIds.value.length - 1]
    return project.value.layers.find((item) => item.id === id) ?? null
  })

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
    catalog.value = (await loadThumbnailValue<ThumbnailCatalogEntry[]>('catalog')) ?? []
    presets.value = (await loadThumbnailValue<ThumbnailPreset[]>('presets')) ?? []
    defaultPresetId.value = await loadThumbnailValue<string>('preset-default')
    const activeId = await loadThumbnailValue<string>('active')
    if (activeId) {
      const parsed = parseProject(await loadThumbnailValue(`project:${activeId}`))
      if (parsed) adopt(parsed, true)
    }
    hydrated.value = true
    await syncBitmaps()
  }

  async function consumeStoredTransfer(): Promise<void> {
    if (consuming || promptOpen.value) return
    consuming = true
    try {
      const stored = await loadThumbnailValue<unknown>('pending-transfer')
      if (!stored) return
      const validated = validateThumbnailTransfer(stored)
      if (!validated.ok) {
        await deleteThumbnailValue('pending-transfer')
        platform.toast(validated.error)
        return
      }
      pending.value = validated.payload
      if (!persisted.value && !dirty.value) await acceptTransfer('replace')
      else promptOpen.value = true
    } finally {
      consuming = false
    }
  }

  async function acceptTransfer(choice: TransferChoice): Promise<void> {
    const payload = pending.value
    promptOpen.value = false
    if (!payload) return
    if (choice === 'keep') {
      await releasePendingAssets(payloadAssetIds(payload))
      pending.value = null
      await deleteThumbnailValue('pending-transfer')
      return
    }
    if (choice === 'save-new' && (dirty.value || persisted.value)) await saveNow()
    const nextId = choice === 'replace' ? project.value.id : undefined
    const previousIds = choice === 'replace' ? assetIdsInProject(project.value) : []
    let next = projectFromTransfer(payload, nextId)
    const artworkAsset = await getImageAsset(payload.artwork.assetId)
    if (artworkAsset) next = withArtworkSize(next, artworkAsset.width, artworkAsset.height)
    const preset = defaultPresetId.value ? presets.value.find((item) => item.id === defaultPresetId.value) : undefined
    if (preset && payload.sourceApp === 'standalone') next = applyPreset(next, preset)
    await movePendingAssets(payloadAssetIds(payload), next.id)
    adopt(next, false)
    dirty.value = true
    pending.value = null
    await deleteThumbnailValue('pending-transfer')
    await syncBitmaps()
    await saveNow(previousIds)
    selectedIds.value = []
  }

  function adopt(next: ThumbnailProject, saved: boolean): void {
    project.value = next
    history.value = createHistory(next)
    persisted.value = saved
    dirty.value = false
    gesturing = false
    savedAssetIds = assetIdsInProject(next)
  }

  function snapshot(): ThumbnailProject {
    return JSON.parse(JSON.stringify(project.value)) as ThumbnailProject
  }

  function commit(mutator: (draft: ThumbnailProject) => void): void {
    const draft = JSON.parse(JSON.stringify(project.value)) as ThumbnailProject
    mutator(draft)
    history.value = historyCommit(history.value, draft)
    project.value = history.value.present
    dirty.value = true
    scheduleSave()
  }

  function beginGesture(): void {
    if (gesturing) return
    gesturing = true
    history.value = historyCheckpoint(history.value)
  }

  function previewEdit(mutator: (draft: ThumbnailProject) => void): void {
    if (!gesturing) beginGesture()
    const draft = JSON.parse(JSON.stringify(project.value)) as ThumbnailProject
    mutator(draft)
    project.value = draft
    history.value = historyReplace(history.value, draft)
  }

  function endGesture(): void {
    if (!gesturing) return
    gesturing = false
    guideVertical.value = false
    guideHorizontal.value = false
    const previous = history.value.past[history.value.past.length - 1]
    if (previous && JSON.stringify(previous) === JSON.stringify(project.value)) {
      history.value = historyDropCheckpoint(history.value)
      return
    }
    dirty.value = true
    scheduleSave()
  }

  function undo(): void {
    if (gesturing || !canUndo(history.value)) return
    history.value = historyUndo(history.value)
    project.value = JSON.parse(JSON.stringify(history.value.present)) as ThumbnailProject
    dirty.value = true
    scheduleSave()
    void syncBitmaps()
  }

  function redo(): void {
    if (gesturing || !canRedo(history.value)) return
    history.value = historyRedo(history.value)
    project.value = JSON.parse(JSON.stringify(history.value.present)) as ThumbnailProject
    dirty.value = true
    scheduleSave()
    void syncBitmaps()
  }

  function scheduleSave(): void {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      void saveNow()
    }, 400)
  }

  async function saveNow(previousOverride?: string[]): Promise<void> {
    if (!hydrated.value) return
    const current = snapshot()
    current.updatedAt = Date.now()
    project.value.updatedAt = current.updatedAt
    const previous = [...new Set([...(previousOverride ?? savedAssetIds), ...touchedAssetIds])]
    const nextIds = assetIdsInProject(current)
    const removed = await syncProjectAssets(current.id, previous, nextIds)
    touchedAssetIds.clear()
    savedAssetIds = nextIds.filter((id) => !removed.includes(id))
    forgetBitmaps(removed)
    await saveThumbnailValue(`project:${current.id}`, current)
    const entry = catalogEntry(current)
    catalog.value = [entry, ...catalog.value.filter((item) => item.id !== current.id)]
    await saveThumbnailValue('catalog', JSON.parse(JSON.stringify(catalog.value)))
    await saveThumbnailValue('active', current.id)
    persisted.value = true
    dirty.value = false
  }

  async function createBlank(): Promise<void> {
    let fresh = createThumbnailProject()
    const preset = defaultPresetId.value ? presets.value.find((item) => item.id === defaultPresetId.value) : undefined
    if (preset) fresh = applyPreset(fresh, preset)
    adopt(fresh, false)
    selectedIds.value = []
    bitmapKey = ''
    await syncBitmaps()
  }

  async function openSaved(id: string): Promise<void> {
    const parsed = parseProject(await loadThumbnailValue(`project:${id}`))
    if (!parsed) {
      platform.toast('That thumbnail project could not be opened.')
      return
    }
    if (dirty.value) await saveNow()
    adopt(parsed, true)
    selectedIds.value = []
    projectsOpen.value = false
    bitmapKey = ''
    await syncBitmaps()
  }

  async function deleteSaved(id: string): Promise<void> {
    const parsed = parseProject(await loadThumbnailValue(`project:${id}`))
    if (parsed) await syncProjectAssets(id, assetIdsInProject(parsed), [])
    await deleteThumbnailValue(`project:${id}`)
    catalog.value = catalog.value.filter((item) => item.id !== id)
    await saveThumbnailValue('catalog', JSON.parse(JSON.stringify(catalog.value)))
    if (project.value.id === id) await createBlank()
  }

  function setName(name: string): void {
    previewEdit((draft) => {
      draft.name = name
      const title = draft.layers.find((item) => item.textRole === 'title')
      if (title && !title.userEdited) title.text = name
    })
  }

  function applyBuiltInTemplate(id: TemplateId): void {
    const next = applyTemplate(snapshot(), id)
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    dirty.value = true
    scheduleSave()
  }

  function changeSeason(season: SeasonId): void {
    const next = setSeason(snapshot(), season)
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    dirty.value = true
    scheduleSave()
  }

  function changeOutput(width: number, height: number, aspect?: ThumbnailAspect): void {
    const next = setOutputSize(snapshot(), width, height, aspect)
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    dirty.value = true
    scheduleSave()
  }

  function patchPrimary(patch: Parameters<typeof patchLayer>[2]): void {
    const id = primary.value?.id
    if (!id) return
    commit((draft) => {
      const patched = patchLayer(draft, id, patch)
      draft.layers = patched.layers
      draft.updatedAt = patched.updatedAt
      if (patch.text !== undefined) {
        const layer = draft.layers.find((item) => item.id === id)
        if (layer?.textRole === 'title') layer.userEdited = true
      }
      const layer = draft.layers.find((item) => item.id === id)
      if (layer?.kind === 'background') syncCompositionBackground(draft)
    })
  }

  function setAnchor(anchor: FixedAnchor): void {
    const id = primary.value?.id
    if (!id) return
    commit((draft) => {
      draft.autoLayout = false
      const frame = frameLayer(draft)
      const inset = frame?.visible && frame.assetId ? 0.06 : 0
      draft.layers = draft.layers.map((item) =>
        item.id === id ? placeLayerAtAnchor(item, anchor, draft.safeMargin + inset) : item,
      )
    })
  }

  function nudge(dx: number, dy: number): void {
    if (selectedIds.value.length === 0) return
    commit((draft) => {
      draft.autoLayout = false
      draft.layers = draft.layers.map((item) =>
        selectedIds.value.includes(item.id) && !item.locked ? nudgeLayer(item, dx, dy, draft.snapGrid, draft.snapCenter) : item,
      )
    })
  }

  function moveSelection(id: string, x: number, y: number, snap: boolean): void {
    previewEdit((draft) => {
      draft.autoLayout = false
      draft.layers = draft.layers.map((item) => {
        if (item.id !== id || item.locked) return item
        const nextX = snap ? snapValue(x, draft) : x
        const nextY = snap ? snapValue(y, draft) : y
        guideVertical.value = draft.snapCenter && Math.abs(nextX - 0.5) < 0.012
        guideHorizontal.value = draft.snapCenter && Math.abs(nextY - 0.5) < 0.012
        return { ...item, anchor: 'free', x: nextX, y: nextY }
      })
    })
  }

  function align(edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    commit((draft) => {
      draft.layers = alignLayerSelection(draft.layers, selectedIds.value, edge)
    })
  }

  function bring(direction: -1 | 1): void {
    const id = primary.value?.id
    if (!id) return
    commit((draft) => {
      draft.layers = reorderLayer(draft.layers, id, direction)
    })
  }

  function duplicate(): void {
    const id = primary.value?.id
    if (!id) return
    const next = duplicateLayer(snapshot(), id)
    const created = next.layers.find((item) => !project.value.layers.some((current) => current.id === item.id))
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    if (created) selectedIds.value = [created.id]
    dirty.value = true
    scheduleSave()
  }

  function removeSelected(): void {
    if (selectedIds.value.length === 0) return
    const next = removeLayers(snapshot(), selectedIds.value)
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    selectedIds.value = selectedIds.value.filter((id) => project.value.layers.some((item) => item.id === id))
    dirty.value = true
    scheduleSave()
    void syncBitmaps()
  }

  function addText(text = 'Text'): void {
    const next = addTextLayer(snapshot(), text)
    const created = next.layers[next.layers.length - 1]
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    if (created) selectedIds.value = [created.id]
    section.value = 'text'
    dirty.value = true
    scheduleSave()
  }

  function addShape(): void {
    const next = addShapeLayer(snapshot())
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    selectedIds.value = [next.layers[next.layers.length - 1].id]
    dirty.value = true
    scheduleSave()
  }

  async function importImages(files: File[], target: 'artwork' | 'frame' | 'image'): Promise<void> {
    try {
      for (const [index, file] of files.entries()) {
        const asset = await storeImageBlob(file, file.name, project.value.id)
        touchedAssetIds.add(asset.id)
        const useAs = index === 0 ? target : 'image'
        if (useAs === 'artwork') {
          commit((draft) => {
            const artwork = artworkLayer(draft)
            if (!artwork) return
            artwork.assetId = asset.id
            artwork.sourceWidth = asset.width
            artwork.sourceHeight = asset.height
            artwork.composition = null
            artwork.fit = 'cover'
            artwork.crop = fullNormCrop()
            artwork.anchor = 'top-left'
            artwork.x = 0
            artwork.y = 0
            artwork.width = 1
            artwork.height = 1
          })
        } else if (useAs === 'frame') {
          commit((draft) => {
            const frame = frameLayer(draft)
            if (!frame) return
            frame.assetId = asset.id
            frame.visible = true
          })
        } else {
          const next = addImageLayer(snapshot(), asset.id, asset.width, asset.height)
          history.value = historyCommit(history.value, next)
          project.value = history.value.present
          selectedIds.value = [next.layers[next.layers.length - 1].id]
          dirty.value = true
          scheduleSave()
        }
      }
      bitmapKey = ''
      await syncBitmaps()
    } catch (error) {
      platform.toast(error instanceof Error ? error.message : 'Could not store that image.')
    }
  }

  function setFit(fit: ThumbnailFit): void {
    commit((draft) => {
      const artwork = artworkLayer(draft)
      if (!artwork) return
      artwork.fit = fit
      const composition = sanitizeComposition(artwork.composition)
      const sourceWidth = artwork.sourceWidth || composition?.crop.w || 0
      const sourceHeight = artwork.sourceHeight || 0
      if (composition && artwork.sourceWidth > 0 && artwork.sourceHeight > 0) {
        const place = placementForFit(fit, artwork.sourceWidth, artwork.sourceHeight, draft.width, draft.height, composition.crop)
        composition.x = place.x
        composition.y = place.y
        composition.width = place.width
        composition.height = place.height
        artwork.composition = composition
        return
      }
      if (sourceWidth > 0 && sourceHeight > 0) {
        const place = placementForFit(fit, artwork.sourceWidth, artwork.sourceHeight, draft.width, draft.height, artwork.crop)
        artwork.anchor = 'top-left'
        artwork.x = place.x
        artwork.y = place.y
        artwork.width = place.width
        artwork.height = place.height
      }
    })
  }

  function zoomArtwork(factor: number): void {
    commit((draft) => {
      const artwork = artworkLayer(draft)
      if (!artwork) return
      const composition = sanitizeComposition(artwork.composition)
      if (composition) {
        const cx = composition.x + composition.width / 2
        const cy = composition.y + composition.height / 2
        composition.width = clamp(composition.width * factor, 0.05, 4)
        composition.height = clamp(composition.height * factor, 0.05, 4)
        composition.x = cx - composition.width / 2
        composition.y = cy - composition.height / 2
        artwork.composition = composition
        return
      }
      artwork.crop = zoomNormCrop(artwork.crop, factor)
    })
  }

  function panArtwork(dx: number, dy: number): void {
    commit((draft) => {
      const artwork = artworkLayer(draft)
      if (!artwork) return
      const composition = sanitizeComposition(artwork.composition)
      if (composition) {
        composition.x += dx
        composition.y += dy
        artwork.composition = composition
        return
      }
      artwork.crop = panNormCrop(artwork.crop, dx, dy)
    })
  }

  function resetCrop(): void {
    commit((draft) => {
      const artwork = artworkLayer(draft)
      if (!artwork) return
      artwork.crop = fullNormCrop()
      const composition = sanitizeComposition(artwork.composition)
      if (composition) {
        composition.crop = { x: 0, y: 0, w: 1, h: 1 }
        if (artwork.sourceWidth > 0 && artwork.sourceHeight > 0) {
          const place = placementForFit('contain', artwork.sourceWidth, artwork.sourceHeight, draft.width, draft.height, composition.crop)
          composition.x = place.x
          composition.y = place.y
          composition.width = place.width
          composition.height = place.height
        }
        artwork.composition = composition
      } else {
        artwork.anchor = 'top-left'
        artwork.x = 0
        artwork.y = 0
        artwork.width = 1
        artwork.height = 1
        artwork.fit = 'contain'
      }
    })
  }

  function setQuality(id: QualityId): void {
    commit((draft) => {
      const width = draft.videoWidth ?? draft.width
      const height = draft.videoHeight ?? draft.height
      const derived = qualityFromResolution(width, height)
      const clamped = clampQualityChoice(id, derived.id)
      if (clamped === 'custom') {
        draft.qualityOverride = 'Custom'
        return
      }
      draft.qualityOverride = clamped === derived.id ? null : (QUALITY_OPTIONS.find((item) => item.id === clamped)?.label ?? null)
    })
  }

  function setQualityText(value: string): void {
    commit((draft) => {
      const width = draft.videoWidth ?? draft.width
      const height = draft.videoHeight ?? draft.height
      draft.qualityOverride = sanitizeQualityOverride(value, width, height)
    })
  }

  function setDurationText(value: string): void {
    commit((draft) => {
      draft.durationOverride = value.trim() ? value.trim().slice(0, 32) : null
      const badge = draft.layers.find((item) => item.badgeRole === 'duration')
      if (badge) badge.visible = Boolean(draft.durationOverride || draft.durationSeconds != null)
    })
  }

  function setFlag(key: 'autoContrast' | 'showSafeArea' | 'snapCenter' | 'showGuides', value: boolean): void {
    commit((draft) => {
      draft[key] = value
    })
  }

  function setSafeMargin(value: number): void {
    commit((draft) => {
      draft.safeMargin = Math.min(0.2, Math.max(0, value))
    })
  }

  function setSnapGrid(value: number): void {
    commit((draft) => {
      draft.snapGrid = value > 0 ? value : 0
    })
  }

  function setContent(id: ContentBadgeId | null): void {
    commit((draft) => {
      const badge = draft.layers.find((item) => item.badgeRole === 'content')
      if (!badge) return
      if (!id) {
        badge.visible = false
        return
      }
      badge.visible = true
      badge.contentBadge = id
      if (id !== 'custom') {
        badge.text = id === 'no-music' ? 'NO MUSIC' : id === 'relaxing-art' ? 'RELAXING ART' : id === 'frame-tv' ? 'FRAME TV' : id === 'ambient-art' ? 'AMBIENT ART' : id === 'loop' ? 'LOOP' : 'SLEEP'
      }
    })
  }

  function toggleVisible(id: string): void {
    commit((draft) => {
      const layer = draft.layers.find((item) => item.id === id)
      if (!layer) return
      layer.visible = !layer.visible
      if (layer.kind === 'frame' || layer.kind === 'background') syncCompositionBackground(draft)
    })
  }

  function toggleLock(id: string): void {
    commit((draft) => {
      const layer = draft.layers.find((item) => item.id === id)
      if (layer) layer.locked = !layer.locked
    })
  }

  function runAutoLayout(): void {
    const canvas = renderThumbnail(project.value, renderAssets(), { maxEdge: 480, skipOverlay: true, checker: false })
    const frame = frameLayer(project.value)
    const placed = autoPlaceBadges(
      project.value.layers
        .filter((item) => item.kind === 'badge' && item.visible)
        .map((item) => ({
          id: item.id,
          width: item.width,
          height: item.height,
          prefer: item.badgeRole === 'duration' ? 'bottom-left' : item.badgeRole === 'content' ? 'top-left' : 'top-right',
        })),
      {
        margin: project.value.safeMargin,
        frameInset: frame?.visible && frame.assetId ? 0.06 : 0,
        luminance: sampleAnchorLuminance(canvas, project.value.safeMargin),
        textIsLight: true,
      },
    )
    commit((draft) => {
      draft.autoLayout = true
      draft.layers = draft.layers.map((item) => {
        const place = placed[item.id]
        return place ? { ...item, anchor: place.anchor, x: place.x, y: place.y } : item
      })
    })
  }

  async function savePreset(name: string): Promise<void> {
    const preset = presetFromProject(snapshot(), name)
    presets.value = [...presets.value, preset]
    await saveThumbnailValue('presets', JSON.parse(JSON.stringify(presets.value)))
  }

  function applyUserPreset(id: string): void {
    const preset = presets.value.find((item) => item.id === id)
    if (!preset) return
    const next = applyPreset(snapshot(), preset)
    history.value = historyCommit(history.value, next)
    project.value = history.value.present
    dirty.value = true
    scheduleSave()
  }

  async function renamePreset(id: string, name: string): Promise<void> {
    presets.value = presets.value.map((item) => (item.id === id ? { ...item, name: name.trim() || item.name } : item))
    await saveThumbnailValue('presets', JSON.parse(JSON.stringify(presets.value)))
  }

  async function duplicatePreset(id: string): Promise<void> {
    const preset = presets.value.find((item) => item.id === id)
    if (!preset) return
    const copy = JSON.parse(JSON.stringify(preset)) as ThumbnailPreset
    presets.value = [...presets.value, { ...copy, id: crypto.randomUUID(), name: `${preset.name} copy` }]
    await saveThumbnailValue('presets', JSON.parse(JSON.stringify(presets.value)))
  }

  async function removePreset(id: string): Promise<void> {
    presets.value = deleteUserPreset(presets.value, id)
    if (defaultPresetId.value === id) {
      defaultPresetId.value = null
      await deleteThumbnailValue('preset-default')
    }
    await saveThumbnailValue('presets', JSON.parse(JSON.stringify(presets.value)))
  }

  async function setDefaultPreset(id: string | null): Promise<void> {
    defaultPresetId.value = id
    if (id) await saveThumbnailValue('preset-default', id)
    else await deleteThumbnailValue('preset-default')
  }

  function presetJson(id: string): string | null {
    const preset = presets.value.find((item) => item.id === id)
    return preset ? serializePreset(preset) : null
  }

  async function importPresetJson(text: string): Promise<void> {
    const parsed = parsePreset(text)
    if (!parsed.ok) {
      platform.toast(parsed.error)
      return
    }
    parsed.preset.id = crypto.randomUUID()
    presets.value = [...presets.value, parsed.preset]
    await saveThumbnailValue('presets', JSON.parse(JSON.stringify(presets.value)))
    platform.toast('Preset imported.', 'info')
  }

  function renderAssets(): ThumbnailRenderAssets {
    const byId: ThumbnailRenderAssets['byId'] = {}
    for (const [id, bitmap] of bitmaps) byId[id] = { source: bitmap, width: bitmap.width, height: bitmap.height }
    return { byId }
  }

  async function syncBitmaps(): Promise<void> {
    const ids = assetIdsInProject(project.value)
    const key = ids.slice().sort().join('|')
    if (key === bitmapKey) return
    for (const id of [...bitmaps.keys()]) {
      if (!ids.includes(id)) {
        bitmaps.get(id)?.close()
        bitmaps.delete(id)
      }
    }
    const missing: string[] = []
    for (const id of ids) {
      if (bitmaps.has(id)) continue
      const asset = await getImageAsset(id)
      if (!asset) {
        missing.push(id)
        continue
      }
      try {
        bitmaps.set(id, await createImageBitmap(asset.blob))
      } catch {
        missing.push(id)
      }
    }
    missingAssets.value = missing
    bitmapKey = key
    assetEpoch.value += 1
  }

  function selectOnly(id: string | null): void {
    selectedIds.value = id ? [id] : []
  }

  function toggleSelect(id: string): void {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((item) => item !== id)
      : [...selectedIds.value, id]
  }

  return {
    project,
    history,
    hydrated,
    dirty,
    persisted,
    mode,
    section,
    selectedIds,
    zoom,
    catalog,
    presets,
    defaultPresetId,
    promptOpen,
    exportOpen,
    projectsOpen,
    previewOpen,
    missingAssets,
    assetEpoch,
    guideVertical,
    guideHorizontal,
    pending,
    canUndoEdit,
    canRedoEdit,
    primary,
    init,
    consumeStoredTransfer,
    acceptTransfer,
    saveNow,
    createBlank,
    openSaved,
    deleteSaved,
    undo,
    redo,
    beginGesture,
    endGesture,
    setName,
    applyBuiltInTemplate,
    changeSeason,
    changeOutput,
    patchPrimary,
    setAnchor,
    nudge,
    moveSelection,
    align,
    bring,
    duplicate,
    removeSelected,
    addText,
    addShape,
    importImages,
    setFit,
    zoomArtwork,
    panArtwork,
    resetCrop,
    setQuality,
    setQualityText,
    setDurationText,
    setFlag,
    setSafeMargin,
    setSnapGrid,
    setContent,
    toggleVisible,
    toggleLock,
    runAutoLayout,
    savePreset,
    applyUserPreset,
    renamePreset,
    duplicatePreset,
    removePreset,
    setDefaultPreset,
    presetJson,
    importPresetJson,
    renderAssets,
    selectOnly,
    toggleSelect,
  }
})

function payloadAssetIds(payload: ThumbnailTransferPayload): string[] {
  const ids = [payload.artwork.assetId]
  if (payload.frame?.assetId) ids.push(payload.frame.assetId)
  return ids
}

function syncCompositionBackground(draft: ThumbnailProject): void {
  const artwork = artworkLayer(draft)
  const background = draft.layers.find((item) => item.kind === 'background')
  const composition = artwork ? sanitizeComposition(artwork.composition) : null
  if (!artwork || !background || !composition) return
  if (!background.visible || background.boxStyle.fill === 'none') {
    composition.background = { mode: 'transparent', color: '#000000', blur: 0 }
  } else if (background.blur > 0) {
    composition.background = { mode: 'blur', color: background.boxStyle.color, blur: background.blur }
  } else {
    composition.background = { mode: 'color', color: background.boxStyle.color, blur: 0 }
  }
  artwork.composition = composition
}

function snapValue(value: number, draft: ThumbnailProject): number {
  let next = draft.snapGrid > 0 ? Math.round(value / draft.snapGrid) * draft.snapGrid : value
  if (draft.snapCenter && Math.abs(next - 0.5) <= Math.max(draft.snapGrid, 0.015)) next = 0.5
  return Math.min(1.25, Math.max(-0.25, next))
}

function forgetBitmaps(ids: string[]): void {
  for (const id of ids) {
    bitmaps.get(id)?.close()
    bitmaps.delete(id)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
