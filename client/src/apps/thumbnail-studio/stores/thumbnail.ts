import { clampBadgeMarginPx, fullNormCrop, presetAnchorPoint, type FixedAnchor } from '@shared/thumbnailLayout'
import { DURATION_BADGE_OPTIONS, RESOLUTION_BADGE_OPTIONS } from '@shared/thumbnailBadges'
import {
  type BadgeId,
  type BadgeStyleId,
  type ThumbnailBadge,
  type ThumbnailDocument,
  THUMBNAIL_DOCUMENT_KEY,
  assetIdsInDocument,
  badgeAppearance,
  clampBadgeScale,
  createThumbnailDocument,
  DEFAULT_THUMBNAIL_PROJECT_NAME,
  dragBadge,
  parseThumbnailDocument,
  placeBadge,
  resetBadgePosition,
  syncPresetBadgeCoords,
  thumbnailDownloadFilename,
} from '@shared/thumbnailProject'
import { documentFromTransfer, validateThumbnailTransfer, type ThumbnailTransferPayload } from '@shared/thumbnailTransfer'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { titleFromFileName } from '../../../lib/format'
import { deleteThumbnailValue, getImageAsset, listThumbnailKeys, loadThumbnailValue } from '../../../lib/idb'
import { usePlatformStore } from '../../../stores/platform'
import { movePendingAssets, releasePendingAssets, storeImageBlob, syncProjectAssets } from '../lib/assetStore'
import * as projectLibrary from '../lib/thumbnailProjectLibrary'
import { exportThumbnailBlob, type ThumbnailRenderAssets } from '../lib/renderThumbnail'
import { DUPLICATE_EXPORT_MESSAGE, thumbnailExportFingerprint } from '../../../lib/exportFingerprint'
import { type FileStatusBoxStatus } from '../../../lib/fileStatusBox'

const bitmaps = new Map<string, ImageBitmap>()
const LEGACY_KEYS = new Set(['presets', 'preset-default', 'active'])
const editStamps = new Map<string, string>()

interface ThumbnailUploadStatus {
  state: 'uploading' | 'processing' | 'ready' | 'error'
  fileName: string
  fileSize: number
  width: number
  height: number
  error: string | null
}

interface ThumbnailProjectSummary {
  id: string
  name: string
  updatedAt: number
  previewUrl: string | null
  exportLabel: string
  hasImage: boolean
  fileName: string
  sourceWidth: number
  sourceHeight: number
  configFingerprint: string
  meta: projectLibrary.ThumbnailProjectMeta
}

function editStamp(document: ThumbnailDocument): string {
  const { updatedAt: _updatedAt, ...rest } = document
  return JSON.stringify(rest)
}

function exportLabel(document: ThumbnailDocument): string {
  const ext = document.export.format === 'jpeg' ? 'JPEG' : 'PNG'
  return `${document.export.width}×${document.export.height} · ${ext}`
}

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

  const projectId = computed(() => doc.value.id)
  const hasImage = computed(() => Boolean(doc.value.image.assetId))
  const hasComposition = computed(() => doc.value.image.composition != null)
  const imageFileName = ref<string | null>(null)
  const imageFileSize = ref<number | null>(null)
  const imageFileStatus = ref<FileStatusBoxStatus>('ready')
  const imageFileError = ref<string | null>(null)
  const projects = ref<ThumbnailProjectSummary[]>([])
  const previewUrls = ref<Record<string, string>>({})
  const uploadByProject = ref<Record<string, ThumbnailUploadStatus>>({})
  let applyingProject = false
  const projectMetaById = ref<Record<string, projectLibrary.ThumbnailProjectMeta>>({})

  const currentExportFingerprint = computed(() => thumbnailExportFingerprint(doc.value))
  const activeMeta = computed(() => projectMetaById.value[doc.value.id] ?? { downloadedFingerprint: null, configFingerprint: '' })
  const exportDuplicateBlocker = computed(() => {
    if (!hasImage.value) return ''
    const downloaded = activeMeta.value.downloadedFingerprint
    if (downloaded && currentExportFingerprint.value === downloaded) return DUPLICATE_EXPORT_MESSAGE
    return ''
  })

  const projectCards = computed(() =>
    [...projects.value]
      .filter((item) => item.hasImage)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => ({
        ...item,
        previewUrl: previewUrls.value[item.id] ?? item.previewUrl,
        upload: uploadView(item),
        downloadedUnchanged: Boolean(
          item.meta.downloadedFingerprint &&
            item.configFingerprint &&
            item.meta.downloadedFingerprint === item.configFingerprint,
        ),
      })),
  )

  function uploadView(item: ThumbnailProjectSummary) {
    const live = uploadByProject.value[item.id]
    if (live) return live
    return {
      state: 'ready' as const,
      fileName: item.fileName,
      fileSize: 0,
      width: item.sourceWidth,
      height: item.sourceHeight,
      error: null,
    }
  }

  function summaryFrom(
    document: ThumbnailDocument,
    meta: projectLibrary.ThumbnailProjectMeta,
    fileName = '',
  ): ThumbnailProjectSummary {
    return {
      id: document.id,
      name: document.name,
      updatedAt: document.updatedAt || Date.now(),
      previewUrl: previewUrls.value[document.id] ?? null,
      exportLabel: exportLabel(document),
      hasImage: Boolean(document.image.assetId),
      fileName,
      sourceWidth: document.image.sourceWidth,
      sourceHeight: document.image.sourceHeight,
      configFingerprint: meta.configFingerprint,
      meta,
    }
  }

  function upsertSummary(summary: ThumbnailProjectSummary) {
    projects.value = [...projects.value.filter((item) => item.id !== summary.id), summary]
  }

  function seedEditStamp() {
    editStamps.set(doc.value.id, editStamp(doc.value))
  }

  async function refreshPreviewUrl(id: string, assetId: string | null) {
    if (!assetId) {
      const next = { ...previewUrls.value }
      delete next[id]
      previewUrls.value = next
      return
    }
    const asset = await getImageAsset(assetId)
    if (!asset) return
    const url = URL.createObjectURL(asset.blob)
    const previous = previewUrls.value[id]
    if (previous) URL.revokeObjectURL(previous)
    previewUrls.value = { ...previewUrls.value, [id]: url }
  }

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
    const library = await projectLibrary.loadThumbnailLibrary()
    const metaMap: Record<string, projectLibrary.ThumbnailProjectMeta> = {}
    for (const [id, meta] of library.meta) metaMap[id] = meta
    projectMetaById.value = metaMap

    const summaries: ThumbnailProjectSummary[] = []
    for (const project of library.projects) {
      const meta = metaMap[project.id] ?? { downloadedFingerprint: null, configFingerprint: '' }
      let fileName = ''
      if (project.image.assetId) {
        const asset = await getImageAsset(project.image.assetId)
        fileName = asset?.name ?? ''
        await refreshPreviewUrl(project.id, project.image.assetId)
      }
      summaries.push(summaryFrom(project, meta, fileName))
    }
    projects.value = summaries

    let activeId = library.activeId
    if (!activeId || !summaries.some((item) => item.id === activeId)) {
      activeId = [...summaries].sort((a, b) => b.updatedAt - a.updatedAt).find((item) => item.hasImage)?.id ?? null
    }
    if (!activeId) {
      resetDocument()
      projectMetaById.value = { ...projectMetaById.value, [doc.value.id]: { downloadedFingerprint: null, configFingerprint: '' } }
      await projectLibrary.saveThumbnailActiveId(doc.value.id)
    } else {
      const loaded = library.projects.find((item) => item.id === activeId)
      if (loaded) await loadProjectIntoEditor(loaded)
      else resetDocument()
    }
    hydrated.value = true
  }

  async function loadProjectIntoEditor(project: ThumbnailDocument): Promise<void> {
    applyingProject = true
    doc.value = clone(project)
    savedAssetIds = assetIdsInDocument(project)
    bitmapKey = ''
    imageFileStatus.value = project.image.assetId ? 'ready' : 'ready'
    imageFileError.value = null
    await syncBitmaps()
    await refreshImageAssetMeta()
    await refreshPreviewUrl(project.id, project.image.assetId)
    seedEditStamp()
    applyingProject = false
  }

  async function flushSave(): Promise<void> {
    window.clearTimeout(saveTimer)
    if (!hydrated.value || applyingProject) return
    await saveNow()
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
    imageFileName.value = null
    imageFileSize.value = null
    imageFileStatus.value = 'ready'
    imageFileError.value = null
  }

  function clearImageFileUi(): void {
    imageFileName.value = null
    imageFileSize.value = null
    imageFileStatus.value = 'ready'
    imageFileError.value = null
  }

  async function refreshImageAssetMeta(): Promise<void> {
    const id = doc.value.image.assetId
    if (!id) {
      imageFileName.value = null
      imageFileSize.value = null
      return
    }
    const asset = await getImageAsset(id)
    imageFileName.value = asset?.name ?? 'Image'
    imageFileSize.value = asset?.byteLength ?? null
  }

  function isPristineDraft(): boolean {
    if (hasImage.value || pending.value !== null) return false
    return doc.value.name.trim() === DEFAULT_THUMBNAIL_PROJECT_NAME
  }

  async function newProject(): Promise<void> {
    await flushSave()
    if (isPristineDraft()) {
      applyingProject = true
      resetDocument()
      pending.value = null
      promptOpen.value = false
      replaceOnTransfer.value = false
      applyingProject = false
      await projectLibrary.saveThumbnailActiveId(doc.value.id)
      return
    }
    window.clearTimeout(saveTimer)
    const previousId = doc.value.id
    const previousIds = assetIdsInDocument(doc.value)
    pending.value = null
    promptOpen.value = false
    replaceOnTransfer.value = false
    resetDocument()
    projectMetaById.value = {
      ...projectMetaById.value,
      [doc.value.id]: { downloadedFingerprint: null, configFingerprint: '' },
    }
    await syncProjectAssets(previousId, previousIds, [])
    await projectLibrary.saveThumbnailActiveId(doc.value.id)
    await deleteThumbnailValue('pending-transfer')
  }

  async function discardLegacy(): Promise<void> {
    const keys = await listThumbnailKeys()
    for (const key of keys) {
      if (
        key === THUMBNAIL_DOCUMENT_KEY ||
        key === 'pending-transfer' ||
        key === projectLibrary.THUMBNAIL_CATALOG_KEY ||
        key.startsWith('project:') ||
        key.startsWith('meta:')
      ) {
        continue
      }
      if (!LEGACY_KEYS.has(key)) continue
      await deleteThumbnailValue(key)
    }
  }

  async function openProject(id: string): Promise<boolean> {
    if (id === doc.value.id) {
      if (hasImage.value && !projects.value.some((item) => item.id === id)) await saveNow()
      await projectLibrary.saveThumbnailActiveId(id)
      return true
    }
    await flushSave()
    let saved = await projectLibrary.loadThumbnailProjectRecord(id)
    if (!saved?.id || !saved.image.assetId) {
      platform.toast('That thumbnail project is no longer available.')
      return false
    }
    if (!projects.value.some((item) => item.id === id)) {
      const meta = await projectLibrary.loadThumbnailProjectMeta(id)
      projectMetaById.value = { ...projectMetaById.value, [id]: meta }
      let fileName = ''
      const asset = await getImageAsset(saved.image.assetId)
      fileName = asset?.name ?? ''
      upsertSummary(summaryFrom(saved, meta, fileName))
    }
    await loadProjectIntoEditor(saved)
    await projectLibrary.saveThumbnailActiveId(id)
    return true
  }

  async function renameProject(id: string, rawName: string): Promise<void> {
    const nextName = rawName.trim().slice(0, 80)
    if (!nextName) {
      platform.toast('Enter a project name.', 'info')
      return
    }
    if (id === doc.value.id) {
      setName(nextName)
      return
    }
    const saved = await projectLibrary.loadThumbnailProjectRecord(id)
    if (!saved?.id) {
      platform.toast('That thumbnail project is no longer available.')
      return
    }
    const updated = { ...saved, name: nextName, updatedAt: Date.now() }
    await projectLibrary.saveThumbnailProjectRecord(updated)
    const summary = projects.value.find((item) => item.id === id)
    if (summary) upsertSummary({ ...summary, name: nextName, updatedAt: updated.updatedAt })
  }

  async function duplicateProject(id: string): Promise<void> {
    if (id === doc.value.id) await flushSave()
    const saved = await projectLibrary.loadThumbnailProjectRecord(id)
    if (!saved?.id || !saved.image.assetId) {
      platform.toast('That thumbnail project is no longer available.')
      return
    }
    const copyId = crypto.randomUUID()
    const now = Date.now()
    const copy: ThumbnailDocument = {
      ...clone(saved),
      id: copyId,
      name: `Copy of ${saved.name.trim() || 'Thumbnail'}`.slice(0, 80),
      updatedAt: now,
    }
    const fingerprint = thumbnailExportFingerprint(copy)
    const meta: projectLibrary.ThumbnailProjectMeta = { downloadedFingerprint: null, configFingerprint: fingerprint }
    await projectLibrary.saveThumbnailProjectRecord(copy)
    await projectLibrary.saveThumbnailProjectMeta(copyId, meta)
    await syncProjectAssets(copyId, [], assetIdsInDocument(copy))
    projectMetaById.value = { ...projectMetaById.value, [copyId]: meta }
    let fileName = ''
    if (copy.image.assetId) {
      const asset = await getImageAsset(copy.image.assetId)
      fileName = asset?.name ?? ''
      await refreshPreviewUrl(copyId, copy.image.assetId)
    }
    upsertSummary(summaryFrom(copy, meta, fileName))
    await openProject(copyId)
  }

  async function deleteProject(id: string): Promise<void> {
    let previousIds: string[] = []
    if (id === doc.value.id) previousIds = assetIdsInDocument(doc.value)
    else {
      const saved = await projectLibrary.loadThumbnailProjectRecord(id)
      if (saved) previousIds = assetIdsInDocument(saved)
    }
    await projectLibrary.deleteThumbnailProjectData(id)
    if (previousIds.length) await syncProjectAssets(id, previousIds, [])
    const prevUrl = previewUrls.value[id]
    if (prevUrl) URL.revokeObjectURL(prevUrl)
    const nextUrls = { ...previewUrls.value }
    delete nextUrls[id]
    previewUrls.value = nextUrls
    const nextUpload = { ...uploadByProject.value }
    delete nextUpload[id]
    uploadByProject.value = nextUpload
    editStamps.delete(id)
    const nextMeta = { ...projectMetaById.value }
    delete nextMeta[id]
    projectMetaById.value = nextMeta
    projects.value = projects.value.filter((item) => item.id !== id)
    if (id !== doc.value.id) return
    const next = [...projectCards.value][0]
    if (next) {
      await openProject(next.id)
      return
    }
    applyingProject = true
    resetDocument()
    projectMetaById.value = { ...projectMetaById.value, [doc.value.id]: { downloadedFingerprint: null, configFingerprint: '' } }
    applyingProject = false
    await projectLibrary.saveThumbnailActiveId(doc.value.id)
  }

  async function deleteAllProjects(): Promise<void> {
    const removable = [...projectCards.value]
    if (!removable.length) return
    for (const item of removable) {
      if (item.id === doc.value.id) {
        await deleteProject(item.id)
        continue
      }
      const saved = await projectLibrary.loadThumbnailProjectRecord(item.id)
      const ids = saved ? assetIdsInDocument(saved) : []
      await projectLibrary.deleteThumbnailProjectData(item.id)
      if (ids.length) await syncProjectAssets(item.id, ids, [])
      const prevUrl = previewUrls.value[item.id]
      if (prevUrl) URL.revokeObjectURL(prevUrl)
      editStamps.delete(item.id)
    }
    const removed = new Set(removable.map((item) => item.id))
    const nextUrls = { ...previewUrls.value }
    const nextUpload = { ...uploadByProject.value }
    const nextMeta = { ...projectMetaById.value }
    for (const id of removed) {
      delete nextUrls[id]
      delete nextUpload[id]
      delete nextMeta[id]
    }
    previewUrls.value = nextUrls
    uploadByProject.value = nextUpload
    projectMetaById.value = nextMeta
    projects.value = projects.value.filter((item) => !removed.has(item.id))
    if (!removed.has(doc.value.id)) return
    applyingProject = true
    resetDocument()
    projectMetaById.value = { ...projectMetaById.value, [doc.value.id]: { downloadedFingerprint: null, configFingerprint: '' } }
    applyingProject = false
    await projectLibrary.saveThumbnailActiveId(doc.value.id)
  }

  async function markDownloaded(id: string, fingerprint: string): Promise<void> {
    const prev = projectMetaById.value[id] ?? { downloadedFingerprint: null, configFingerprint: fingerprint }
    const meta: projectLibrary.ThumbnailProjectMeta = {
      downloadedFingerprint: fingerprint,
      configFingerprint: fingerprint || prev.configFingerprint,
    }
    await projectLibrary.saveThumbnailProjectMeta(id, meta)
    projectMetaById.value = { ...projectMetaById.value, [id]: meta }
    const summary = projects.value.find((item) => item.id === id)
    if (summary) upsertSummary({ ...summary, meta, configFingerprint: meta.configFingerprint })
  }

  async function findThumbnailForScreensaverProject(screensaverProjectId: string): Promise<ThumbnailDocument | null> {
    const library = await projectLibrary.loadThumbnailLibrary()
    for (const project of library.projects) {
      if (
        project.source.app === 'frame-screensaver' &&
        project.source.sourceProjectId === screensaverProjectId &&
        project.image.assetId
      ) {
        return project
      }
    }
    return null
  }

  async function syncEditorIfActive(projectId: string, document: ThumbnailDocument): Promise<void> {
    if (doc.value.id !== projectId) return
    applyingProject = true
    doc.value = clone(document)
    savedAssetIds = assetIdsInDocument(document)
    bitmapKey = ''
    await syncBitmaps()
    await refreshImageAssetMeta()
    seedEditStamp()
    applyingProject = false
  }

  async function persistTransferDocument(
    document: ThumbnailDocument,
    previousIds: string[],
    fileName: string,
  ): Promise<void> {
    const fingerprint = thumbnailExportFingerprint(document)
    const meta: projectLibrary.ThumbnailProjectMeta = { downloadedFingerprint: null, configFingerprint: fingerprint }
    await projectLibrary.saveThumbnailProjectRecord(document)
    await projectLibrary.saveThumbnailProjectMeta(document.id, meta)
    projectMetaById.value = { ...projectMetaById.value, [document.id]: meta }
    await syncProjectAssets(document.id, previousIds, assetIdsInDocument(document))
    await refreshPreviewUrl(document.id, document.image.assetId)
    upsertSummary(summaryFrom(document, meta, fileName))
    await syncEditorIfActive(document.id, document)
  }

  async function replaceProjectFromTransfer(projectId: string, payload: ThumbnailTransferPayload): Promise<void> {
    const saved = await projectLibrary.loadThumbnailProjectRecord(projectId)
    const previousIds = saved ? assetIdsInDocument(saved) : []
    const next = documentFromTransfer(payload, projectId)
    if (!payload.title && saved?.name) next.name = saved.name
    const artwork = await getImageAsset(payload.artwork.assetId)
    if (artwork) {
      next.image.sourceWidth = artwork.width
      next.image.sourceHeight = artwork.height
    }
    await movePendingAssets(payloadAssetIds(payload), projectId)
    next.updatedAt = Date.now()
    await persistTransferDocument(next, previousIds, artwork?.name ?? '')
  }

  async function createProjectFromTransfer(payload: ThumbnailTransferPayload): Promise<void> {
    const next = documentFromTransfer(payload)
    const artwork = await getImageAsset(payload.artwork.assetId)
    if (artwork) {
      next.image.sourceWidth = artwork.width
      next.image.sourceHeight = artwork.height
    }
    await movePendingAssets(payloadAssetIds(payload), next.id)
    await persistTransferDocument(next, [], artwork?.name ?? '')
  }

  async function applyScreensaverTransfer(payload: ThumbnailTransferPayload): Promise<void> {
    if (!hydrated.value) await init()
    const sourceId = payload.sourceProjectId?.trim()
    const existing = sourceId ? await findThumbnailForScreensaverProject(sourceId) : null
    if (existing) {
      await replaceProjectFromTransfer(existing.id, payload)
      platform.toast('Thumbnail project updated.', 'success')
    } else {
      await createProjectFromTransfer(payload)
      platform.toast('Thumbnail project created.', 'success')
    }
    pending.value = null
    await deleteThumbnailValue('pending-transfer')
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
    imageFileStatus.value = 'processing'
    imageFileError.value = null
    let next = documentFromTransfer(payload, doc.value.id)
    const artwork = await getImageAsset(payload.artwork.assetId)
    if (artwork) {
      imageFileName.value = artwork.name
      imageFileSize.value = artwork.byteLength
      next.image.sourceWidth = artwork.width
      next.image.sourceHeight = artwork.height
    }
    await movePendingAssets(payloadAssetIds(payload), next.id)
    doc.value = next
    pending.value = null
    bitmapKey = ''
    await deleteThumbnailValue('pending-transfer')
    await syncBitmaps()
    await refreshImageAssetMeta()
    await refreshPreviewUrl(next.id, next.image.assetId)
    imageFileStatus.value = 'ready'
    await saveNow(previousIds)
  }

  function edit(mutator: (draft: ThumbnailDocument) => void): void {
    const draft = clone(doc.value)
    mutator(draft)
    if (!applyingProject) draft.updatedAt = Date.now()
    doc.value = draft
    if (!applyingProject) scheduleSave()
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

  async function attachImageToActive(file: File): Promise<void> {
    const id = doc.value.id
    const previous = assetIdsInDocument(doc.value)
    imageFileName.value = file.name
    imageFileSize.value = file.size
    imageFileStatus.value = 'uploading'
    imageFileError.value = null
    uploadByProject.value = {
      ...uploadByProject.value,
      [id]: {
        state: 'uploading',
        fileName: file.name,
        fileSize: file.size,
        width: 0,
        height: 0,
        error: null,
      },
    }
    try {
      imageFileStatus.value = 'processing'
      uploadByProject.value[id] = { ...uploadByProject.value[id]!, state: 'processing' }
      const asset = await storeImageBlob(file, file.name, doc.value.id)
      const next = clone(doc.value)
      if (next.name.trim() === DEFAULT_THUMBNAIL_PROJECT_NAME) next.name = projectNameFromFile(file)
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
      await refreshImageAssetMeta()
      await refreshPreviewUrl(id, asset.id)
      imageFileStatus.value = 'ready'
      uploadByProject.value = {
        ...uploadByProject.value,
        [id]: {
          state: 'ready',
          fileName: file.name,
          fileSize: file.size,
          width: asset.width,
          height: asset.height,
          error: null,
        },
      }
      await saveNow(previous)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read that image.'
      imageFileStatus.value = 'error'
      imageFileError.value = message
      uploadByProject.value = {
        ...uploadByProject.value,
        [id]: {
          state: 'error',
          fileName: file.name,
          fileSize: file.size,
          width: 0,
          height: 0,
          error: message,
        },
      }
      platform.toast(message)
    }
  }

  async function createDetachedProject(file: File): Promise<string> {
    const next = createThumbnailDocument()
    next.name = projectNameFromFile(file)
    next.updatedAt = Date.now()
    const asset = await storeImageBlob(file, file.name, next.id)
    next.image = {
      assetId: asset.id,
      frameAssetId: null,
      composition: null,
      fit: 'cover',
      crop: fullNormCrop(),
      sourceWidth: asset.width,
      sourceHeight: asset.height,
    }
    const fingerprint = thumbnailExportFingerprint(next)
    const meta: projectLibrary.ThumbnailProjectMeta = { downloadedFingerprint: null, configFingerprint: fingerprint }
    await projectLibrary.saveThumbnailProjectRecord(next)
    await projectLibrary.saveThumbnailProjectMeta(next.id, meta)
    projectMetaById.value = { ...projectMetaById.value, [next.id]: meta }
    await syncProjectAssets(next.id, [], assetIdsInDocument(next))
    await refreshPreviewUrl(next.id, asset.id)
    uploadByProject.value = {
      ...uploadByProject.value,
      [next.id]: {
        state: 'ready',
        fileName: file.name,
        fileSize: file.size,
        width: asset.width,
        height: asset.height,
        error: null,
      },
    }
    upsertSummary(summaryFrom(next, meta, file.name))
    return next.id
  }

  function projectNameFromFile(file: File): string {
    return (titleFromFileName(file.name) || DEFAULT_THUMBNAIL_PROJECT_NAME).slice(0, 80)
  }

  async function addImageFiles(files: File[]): Promise<void> {
    if (!files.length) return
    if (!hydrated.value) await init()
    const accepted = files.filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name))
    if (!accepted.length) {
      platform.toast('Use a PNG, JPEG, or WebP image.')
      return
    }
    if (!hasImage.value) {
      const [first, ...rest] = accepted
      if (first) await attachImageToActive(first)
      for (const file of rest) await createDetachedProject(file)
      return
    }
    await flushSave()
    const created: string[] = []
    for (const file of accepted) created.push(await createDetachedProject(file))
    const openId = created[created.length - 1]
    if (openId) await openProject(openId)
  }

  async function uploadImage(file: File): Promise<void> {
    await addImageFiles([file])
  }

  async function clearImage(): Promise<void> {
    const hadAsset = Boolean(doc.value.image.assetId)
    if (!hadAsset && !imageFileName.value) return
    const previousIds = assetIdsInDocument(doc.value)
    if (hadAsset) {
      edit((draft) => {
        draft.image = {
          assetId: null,
          frameAssetId: null,
          composition: null,
          fit: 'cover',
          crop: fullNormCrop(),
          sourceWidth: 0,
          sourceHeight: 0,
        }
        draft.source = {
          app: 'standalone',
          linkMode: 'snapshot',
          returnPath: null,
          sourceProjectId: null,
          videoWidth: null,
          videoHeight: null,
          durationSeconds: null,
        }
      })
      bitmapKey = ''
      await syncBitmaps()
      await saveNow(previousIds)
      projects.value = projects.value.filter((item) => item.id !== doc.value.id)
      await projectLibrary.deleteThumbnailProjectData(doc.value.id)
      const nextMeta = { ...projectMetaById.value }
      delete nextMeta[doc.value.id]
      projectMetaById.value = nextMeta
      await refreshPreviewUrl(doc.value.id, null)
    }
    clearImageFileUi()
  }

  function setName(value: string): void {
    edit((draft) => {
      draft.name = value.slice(0, 80)
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

  async function buildRenderAssetsForDocument(document: ThumbnailDocument): Promise<ThumbnailRenderAssets> {
    const byId: ThumbnailRenderAssets['byId'] = {}
    for (const id of assetIdsInDocument(document)) {
      const asset = await getImageAsset(id)
      if (!asset) continue
      try {
        const bitmap = await createImageBitmap(asset.blob)
        byId[id] = { source: bitmap, width: bitmap.width, height: bitmap.height }
      } catch {
        platform.toast('Could not read a saved thumbnail image.')
      }
    }
    return { byId }
  }

  function closeOwnedRenderAssets(assets: ThumbnailRenderAssets): void {
    for (const entry of Object.values(assets.byId)) {
      if (entry?.source instanceof ImageBitmap) entry.source.close()
    }
  }

  async function downloadStoredProject(thumbnail: ThumbnailDocument, allowDuplicate = true): Promise<void> {
    const fingerprint = thumbnailExportFingerprint(thumbnail)
    if (!allowDuplicate) {
      const meta = projectMetaById.value[thumbnail.id] ?? (await projectLibrary.loadThumbnailProjectMeta(thumbnail.id))
      if (meta.downloadedFingerprint && meta.downloadedFingerprint === fingerprint) return
    }
    let assets: ThumbnailRenderAssets
    let ownedAssets = false
    if (thumbnail.id === doc.value.id && hasImage.value) {
      await syncBitmaps()
      assets = renderAssets()
    } else {
      assets = await buildRenderAssetsForDocument(thumbnail)
      ownedAssets = true
    }
    try {
      const blob = await exportThumbnailBlob(thumbnail, assets)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = thumbnailDownloadFilename(thumbnail)
      link.click()
      URL.revokeObjectURL(url)
      await markDownloaded(thumbnail.id, fingerprint)
    } finally {
      if (ownedAssets) closeOwnedRenderAssets(assets)
    }
  }

  async function download(): Promise<void> {
    if (exporting.value || exportDuplicateBlocker.value) return
    exporting.value = true
    try {
      await downloadStoredProject(doc.value, false)
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
    if (!hydrated.value || applyingProject) return
    const current = clone(doc.value)
    const id = current.id
    const stamp = editStamp(current)
    if (editStamps.get(id) !== stamp) {
      const now = Date.now()
      current.updatedAt = now
      doc.value = { ...doc.value, updatedAt: now }
    } else {
      current.updatedAt = doc.value.updatedAt
    }
    editStamps.set(id, stamp)
    const fingerprint = thumbnailExportFingerprint(current)
    const prevMeta = projectMetaById.value[id] ?? { downloadedFingerprint: null, configFingerprint: '' }
    const meta: projectLibrary.ThumbnailProjectMeta = {
      downloadedFingerprint: prevMeta.downloadedFingerprint,
      configFingerprint: fingerprint,
    }
    await projectLibrary.saveThumbnailActiveId(id)
    if (current.image.assetId) {
      await projectLibrary.saveThumbnailProjectRecord(current)
      await projectLibrary.saveThumbnailProjectMeta(id, meta)
      projectMetaById.value = { ...projectMetaById.value, [id]: meta }
      const fileName = imageFileName.value ?? ''
      upsertSummary(summaryFrom(current, meta, fileName))
    }
    const previous = previousOverride ?? savedAssetIds
    const nextIds = assetIdsInDocument(current)
    await syncProjectAssets(id, previous, nextIds)
    savedAssetIds = nextIds
  }

  async function downloadProject(id: string): Promise<void> {
    if (id === doc.value.id && hasImage.value) {
      await download()
      return
    }
    const saved = await projectLibrary.loadThumbnailProjectRecord(id)
    if (!saved?.image.assetId) {
      platform.toast('That thumbnail project is no longer available.')
      return
    }
    if (exporting.value) return
    exporting.value = true
    try {
      await downloadStoredProject(saved)
    } catch (error) {
      platform.toast(error instanceof Error ? error.message : 'Could not export the thumbnail.')
    } finally {
      exporting.value = false
    }
  }

  async function downloadAllProjects(): Promise<void> {
    const items = projectCards.value
    if (!items.length) {
      platform.toast('No thumbnail projects to download.', 'info')
      return
    }
    if (exporting.value) return
    exporting.value = true
    let count = 0
    try {
      for (const item of items) {
        const saved = item.id === doc.value.id ? clone(doc.value) : await projectLibrary.loadThumbnailProjectRecord(item.id)
        if (!saved?.image.assetId) continue
        try {
          await downloadStoredProject(saved)
          count++
        } catch {
          /* try remaining */
        }
      }
      if (count > 0) platform.toast(`Downloaded ${count} thumbnail${count === 1 ? '' : 's'}.`, 'success')
      else platform.toast('Could not download any thumbnails.', 'info')
    } finally {
      exporting.value = false
    }
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
    projectId,
    hydrated,
    promptOpen,
    exporting,
    assetEpoch,
    pending,
    hasImage,
    hasComposition,
    imageFileName,
    imageFileSize,
    imageFileStatus,
    imageFileError,
    projects: projectCards,
    exportDuplicateBlocker,
    init,
    newProject,
    openProject,
    renameProject,
    duplicateProject,
    deleteProject,
    deleteAllProjects,
    downloadProject,
    downloadAllProjects,
    applyScreensaverTransfer,
    consumeStoredTransfer,
    requestReplaceOnNextTransfer,
    clearReplaceOnNextTransfer,
    acceptTransfer,
    addImageFiles,
    uploadImage,
    clearImage,
    setName,
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
