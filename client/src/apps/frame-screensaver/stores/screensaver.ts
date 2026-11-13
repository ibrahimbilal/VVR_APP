import { aspectRatio, clampComposition, compositionForFit, cropForAspect, defaultComposition, placementForFit, type CropAspect, type ScreensaverComposition } from '@shared/screensaverComposition'
import { FRAME_FILE_LIMIT, isBuiltinFrameId } from '@shared/screensaverFrames'
import {
  DEFAULT_CFR_FPS,
  DEFAULT_DURATION_PRESET_KEY,
  DEFAULT_DURATION_SECONDS,
  DEFAULT_SCREENSAVER_CFR_QUALITY,
  DEFAULT_SCREENSAVER_OUTPUT,
  DEFAULT_SCREENSAVER_RENDER_MODE,
  DURATION_PRESETS,
  estimateOutputBytes,
  formatDurationLabel,
  isEncoderChoice,
  isScreensaverCfrQuality,
  isScreensaverProfile,
  isScreensaverRenderMode,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  profileFps,
  SCREENSAVER_CFR_FPS,
  SCREENSAVER_CFR_QUALITY_PRESETS,
  SCREENSAVER_FPS,
  SCREENSAVER_OUTPUTS,
  SCREENSAVER_PROFILES,
  SCREENSAVER_RENDER_MODES,
  type EncoderChoice,
  type ScreensaverAudioMode,
  type ScreensaverCfrQuality,
  type ScreensaverFit,
  type ScreensaverLoop,
  type ScreensaverMode,
  type ScreensaverProfile,
  type ScreensaverRenderMode,
} from '@shared/screensaver'
import {
  defaultSubscribeAnimation,
  sanitizeSubscribeAnimation,
  SUBSCRIBE_ANIMATION_UPLOAD_BUDGET_BYTES,
  validateSubscribeAnimation,
  type SubscribeAnimationSettings,
} from '@shared/screensaverSubscribeAnimation'
import { defineStore } from 'pinia'
import { storeToRefs } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'
import * as api from '../../../lib/api'
import * as idb from '../../../lib/idb'
import { titleFromFileName } from '../../../lib/format'
import { readImageFile, readVideoFile, validateAudioFile, validateImageFile, validateScreensaverVideoFile } from '../../../lib/media'
import { idleExport, pickDisplayExportState } from '../../../lib/exportState'
import { useManagedExportJobs } from '../../../lib/managedExportJobs'
import { pageWasReloaded } from '../../../lib/pageNavigation'
import { triggerDownload } from '../../../lib/triggerDownload'
import { usePlatformStore } from '../../../stores/platform'
import type { ExportState } from '../../../types'
import {
  consumePendingScreensaverProject,
  markScreensaverProjectsReady,
  onScreensaverProjectOpen,
  onScreensaverRender,
  peekScreensaverRenderEvents,
  takePendingScreensaverProject,
} from '../lib/screensaverProjectEvents'
import * as projectLibrary from '../lib/screensaverProjectLibrary'
import {
  applyExportToRender,
  bindRenderTrack,
  draftRender,
  isLiveRenderStatus,
  mediaCountLabel,
  type ScreensaverRenderEvent,
  type ScreensaverRenderState,
} from '../lib/screensaverProjectModel'
import { composeExportPng } from '../lib/exportComposeWorker'
import { resolveBuiltinFrameUrl } from '../lib/defaultFrames'
import { frameImageUrl } from '../lib/frameImageUrl'
import {
  readPreviewRendererMode,
  writePreviewRendererMode,
  type PreviewRendererMode,
} from '../lib/previewRendererPreference'
import type { ScreensaverRendererBackend } from '../lib/render/types'
import { ensureServerUploadCleanupOnClose } from '../../../lib/serverUploadCleanup'
import { DUPLICATE_EXPORT_MESSAGE, screensaverExportFingerprint } from '../../../lib/exportFingerprint'
import { submitScreensaverExport } from '../lib/screensaverExport'
import { subscribeAnimationOverlayOnOutput } from '../lib/subscribeAnimation/subscribeAnimationLayout'
import { renderSubscribeAnimationFrames } from '../lib/subscribeAnimation/subscribeAnimationExportFrames'
import { ingestSubscribeChannelAvatar, preloadSubscribeChannelAvatar } from '../lib/subscribeAnimation/subscribeAnimationChannelAvatar'
import type { SavedScreensaverProject } from '../types'

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read the image.'))
    image.src = url
  })
}

async function fileIsPng(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  return head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
}

let sourceFile: File | null = null
let audioFile: File | null = null
let metaTimer = 0
let applyingProject = false
let libraryReady = false
const exportFingerprints = new Map<string, string>()
const editStamps = new Map<string, string>()

function editStamp(project: SavedScreensaverProject): string {
  const { updatedAt: _updatedAt, serverId: _serverId, ...rest } = project
  return JSON.stringify(rest)
}

interface ScreensaverProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  thumbnail: string | null
  mediaKind: 'image' | 'video' | null
  fileName: string
  sourceWidth: number
  sourceHeight: number
  sourceDuration: number | null
  serverId: string | null
  durationSeconds: number
  outputWidth: number
  outputHeight: number
  frameId: string
  audioMode: ScreensaverAudioMode
  audioFileName: string | null
  configFingerprint: string
  render: ScreensaverRenderState
}

interface SourceUploadStatus {
  state: 'uploading' | 'ready' | 'error'
  progress: number
  error: string | null
  fileName: string
  fileSize: number
  width: number
  height: number
  duration: number | null
}

function projectNameFromFile(file: File): string {
  return (titleFromFileName(file.name) || 'Untitled screensaver').slice(0, 80)
}

type ScreensaverExportSnapshot = {
  filename: string
  mediaId: string
  mediaKind: 'image' | 'video'
  objectUrl: string | null
  outputWidth: number
  outputHeight: number
  composition: ScreensaverComposition
  frameId: ScreensaverComposition['frameId']
}

function defaultProject(): Omit<SavedScreensaverProject, 'version'> {
  const output = DEFAULT_SCREENSAVER_OUTPUT
  return {
    name: 'Untitled screensaver',
    mode: 'static',
    mediaKind: null,
    serverId: null,
    fileName: '',
    width: 0,
    height: 0,
    sourceDuration: null,
    hasAudio: false,
    thumbnail: null,
    outputWidth: output.width,
    outputHeight: output.height,
    fps: DEFAULT_CFR_FPS,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    durationPresetKey: DEFAULT_DURATION_PRESET_KEY,
    fit: 'contain',
    loopType: 'hard',
    crossfadeSeconds: 1,
    audioMode: 'none',
    audioVolume: 0.7,
    audioFadeIn: 2,
    audioFadeOut: 3,
    loopAudio: true,
    backgroundColor: '#000000',
    audioFileName: null,
    renderingMode: DEFAULT_SCREENSAVER_RENDER_MODE,
    cfrQuality: DEFAULT_SCREENSAVER_CFR_QUALITY,
    profile: 'balanced',
    encoder: 'cpu',
  }
}

function cloneComposition(value: ScreensaverComposition): ScreensaverComposition {
  return structuredClone(toRaw(value))
}

export const useScreensaverStore = defineStore('screensaver', () => {
  const platform = usePlatformStore()
  const { serverOnline } = storeToRefs(platform)
  const exportQueue = useManagedExportJobs()

  const hydrated = ref(false)
  const projectId = ref('')
  const createdAt = ref(0)
  const updatedAt = ref(0)
  const projectRender = ref<ScreensaverRenderState>(draftRender())
  const projects = ref<ScreensaverProjectSummary[]>([])
  const sourceIds = ref<string[]>([])
  const audioIds = ref<string[]>([])
  const frameNotice = ref<string | null>(null)
  const name = ref(defaultProject().name)
  const mode = ref<ScreensaverMode>('static')
  const mediaKind = ref<'image' | 'video' | null>(null)
  const serverId = ref<string | null>(null)
  const fileName = ref('')
  const sourceFileSize = ref<number | null>(null)
  const width = ref(0)
  const height = ref(0)
  const sourceDuration = ref<number | null>(null)
  const hasAudio = ref(false)
  const thumbnail = ref<string | null>(null)
  const objectUrl = ref<string | null>(null)
  const uploadState = ref<'empty' | 'uploading' | 'ready' | 'error'>('empty')
  const uploadProgress = ref(0)
  const uploadError = ref<string | null>(null)
  const sourceUploads = ref<Record<string, SourceUploadStatus>>({})

  const outputWidth = ref<number>(DEFAULT_SCREENSAVER_OUTPUT.width)
  const outputHeight = ref<number>(DEFAULT_SCREENSAVER_OUTPUT.height)
  const fps = ref(DEFAULT_CFR_FPS)
  const profile = ref<ScreensaverProfile>('balanced')
  const encoder = ref<EncoderChoice>('cpu')
  const renderingMode = ref<ScreensaverRenderMode>(DEFAULT_SCREENSAVER_RENDER_MODE)
  const cfrQuality = ref<ScreensaverCfrQuality>(DEFAULT_SCREENSAVER_CFR_QUALITY)
  const composition = ref<ScreensaverComposition>(defaultComposition())
  const frames = ref<api.ScreensaverFrame[]>([])
  const framesLoaded = ref(false)
  const frameUploading = ref(false)
  const frameImage = ref<HTMLImageElement | null>(null)
  let frameImageToken = 0
  const compareAdjustments = ref(false)
  const cropEditing = ref(false)
  const previewInteracting = ref(false)
  let previewInteractTimer = 0
  const previewRenderer = ref<PreviewRendererMode>(readPreviewRendererMode())
  const previewRendererActive = ref<ScreensaverRendererBackend | 'none'>('none')
  const encoderOptions = ref<Awaited<ReturnType<typeof api.screensaverEncoders>>['encoders']>([])
  const autoStill = ref<string | null>(null)
  const autoMotion = ref<string | null>(null)
  const history = ref<ScreensaverComposition[]>([defaultComposition()])
  const historyIndex = ref(0)
  const durationSeconds = ref(DEFAULT_DURATION_SECONDS)
  const durationPresetKey = ref(DEFAULT_DURATION_PRESET_KEY)
  const fit = ref<ScreensaverFit>('contain')
  const loopType = ref<ScreensaverLoop>('hard')
  const crossfadeSeconds = ref(1)
  const audioMode = ref<ScreensaverAudioMode>('none')
  const audioVolume = ref(0.7)
  const audioFadeIn = ref(2)
  const audioFadeOut = ref(3)
  const loopAudio = ref(true)
  const backgroundColor = ref('#000000')
  const audioUrl = ref<string | null>(null)
  const audioFileName = ref<string | null>(null)
  const audioFileSize = ref<number | null>(null)
  const subscribeAnimation = ref<SubscribeAnimationSettings>(defaultSubscribeAnimation())
  const subscribeChannelLookupLoading = ref(false)

  const liveExportState = computed(() =>
    pickDisplayExportState(exportQueue.jobs.value.filter((job) => job.projectId === projectId.value)),
  )

  const exportState = computed<ExportState>(() => {
    const live = liveExportState.value
    if (live.phase !== 'idle') return live
    return exportStateFromSaved(projectRender.value)
  })

  const exporting = exportQueue.exporting
  const activeExportCount = exportQueue.activeExportCount

  const durationLabel = computed(() => formatDurationLabel(durationSeconds.value))

  const projectCards = computed(() =>
    [...projects.value]
      .filter((item) => item.mediaKind === 'image' || item.mediaKind === 'video')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => ({
        ...item,
        mediaLabel: mediaCountLabel(item.mediaKind),
        sourceMissing: item.mediaKind != null && !sourceIds.value.includes(item.id),
        audioMissing: item.audioMode === 'upload' && !audioIds.value.includes(item.id),
        frameMissing: frameIsMissing(item.frameId),
        outputMissing: item.render.outputMissing,
        live: isLiveRenderStatus(item.render.status),
        upload: uploadView(item),
        downloadedUnchanged: Boolean(
          item.render.downloadedFingerprint &&
            item.configFingerprint &&
            item.render.downloadedFingerprint === item.configFingerprint &&
            !item.render.outputMissing &&
            !isLiveRenderStatus(item.render.status),
        ),
      })),
  )

  const activeProjectCard = computed(() => projectCards.value.find((item) => item.id === projectId.value) ?? null)

  const sizeEstimate = computed(() => {
    const hasOutAudio = audioMode.value === 'upload' || (audioMode.value === 'source' && hasAudio.value)
    return estimateOutputBytes(
      outputWidth.value,
      outputHeight.value,
      durationSeconds.value,
      hasOutAudio,
      mode.value === 'static' ? 'still' : 'motion',
    )
  })

  function buildExportProjectJson(): Record<string, unknown> {
    const mediaId = serverId.value
    const kind = mediaKind.value
    if (!mediaId || !kind) return {}
    const animSettings = structuredClone(toRaw(subscribeAnimation.value))
    const overlay =
      animSettings.enabled
        ? subscribeAnimationOverlayOnOutput(outputWidth.value, outputHeight.value, animSettings)
        : null
    return {
      filename: name.value.trim() || 'screensaver',
      mediaId,
      kind,
      mode: mode.value,
      width: outputWidth.value,
      height: outputHeight.value,
      fps: fps.value,
      duration: durationSeconds.value,
      fit: fit.value,
      loopType: loopType.value,
      crossfadeSeconds: crossfadeSeconds.value,
      audioMode: audioMode.value,
      audioVolume: audioVolume.value,
      audioFadeIn: audioFadeIn.value,
      audioFadeOut: audioFadeOut.value,
      loopAudio: loopAudio.value,
      backgroundColor: backgroundColor.value,
      profile: profile.value,
      encoder: encoder.value,
      renderingMode: renderingMode.value,
      cfrQuality: cfrQuality.value,
      composition: cloneComposition(composition.value),
      subscribeAnimation: overlay
        ? { ...animSettings, overlayX: overlay.x, overlayY: overlay.y }
        : animSettings,
    }
  }

  const currentExportFingerprint = computed(() => {
    if (!serverId.value || !mediaKind.value) return ''
    return screensaverExportFingerprint(
      buildExportProjectJson(),
      audioMode.value === 'upload' ? audioFile : null,
    )
  })

  const exportBlocker = computed(() => {
    if (!serverOnline.value) return 'The renderer is offline.'
    if (uploadState.value !== 'ready' || !serverId.value) return 'Upload an image or video first.'
    if (mode.value === 'loop' && mediaKind.value !== 'video') return 'Looping mode needs a video source.'
    if (mode.value === 'static' && mediaKind.value !== 'image') return 'Static art mode needs an image source.'
    if (renderingMode.value === 'optimized-cfr' && (mode.value !== 'static' || mediaKind.value !== 'image')) {
      return 'Optimized CFR is only available for static image exports. Switch to Fast VFR for video.'
    }
    if (durationSeconds.value < MIN_DURATION_SECONDS || durationSeconds.value > MAX_DURATION_SECONDS) {
      return `Duration must be between ${formatDurationLabel(MIN_DURATION_SECONDS)} and ${formatDurationLabel(MAX_DURATION_SECONDS)}.`
    }
    if (audioMode.value === 'upload' && (!audioUrl.value || !audioFile)) {
      return 'Upload background audio or choose another audio option.'
    }
    if (audioMode.value === 'source' && !hasAudio.value) return 'This video has no audio. Choose another audio option.'
    if (
      composition.value.frameId !== 'none' &&
      framesLoaded.value &&
      !isBuiltinFrameId(composition.value.frameId) &&
      !frames.value.some((frame) => frame.id === composition.value.frameId)
    ) {
      return 'That frame is no longer on the server. Choose another frame.'
    }
    const animCheck = validateSubscribeAnimation(subscribeAnimation.value, durationSeconds.value, {
      staticImage: mode.value === 'static' && mediaKind.value === 'image',
    })
    if (subscribeAnimation.value.enabled && !animCheck.ok) return animCheck.message ?? 'Invalid subscribe animation settings.'
    const lastFingerprint = exportFingerprints.get(projectId.value)
    if (lastFingerprint && currentExportFingerprint.value !== '' && currentExportFingerprint.value === lastFingerprint) {
      return DUPLICATE_EXPORT_MESSAGE
    }
    return ''
  })

  watch(
    [
      name,
      mode,
      mediaKind,
      serverId,
      fileName,
      outputWidth,
      outputHeight,
      fps,
      durationSeconds,
      durationPresetKey,
      fit,
      loopType,
      crossfadeSeconds,
      audioMode,
      audioVolume,
      audioFadeIn,
      audioFadeOut,
      loopAudio,
      backgroundColor,
      audioFileName,
      profile,
      encoder,
      renderingMode,
      cfrQuality,
      composition,
      subscribeAnimation,
    ],
    () => {
      if (!hydrated.value || applyingProject) return
      invalidateCompletedExport()
      window.clearTimeout(metaTimer)
      metaTimer = window.setTimeout(() => {
        void persistMeta()
      }, 400)
    },
    { deep: true },
  )

  watch(
    () => composition.value.frameId,
    (id) => {
      void syncFrameImage(id)
    },
    { immediate: true },
  )

  watch(serverOnline, (online) => {
    if (!online || !hydrated.value || framesLoaded.value) return
    void loadFrames()
  })

  watch(mode, (value) => {
    if (!hydrated.value) return
    if (value === 'static' && mediaKind.value === 'video') {
      platform.toast('Static art mode works best with an image. Switch source or use looping video mode.', 'info')
    }
    if (value === 'loop' && mediaKind.value === 'image') {
      platform.toast('Looping mode requires a video source.', 'info')
    }
  })

  function toast(text: string, tone: 'info' | 'error' | 'success' = 'error') {
    platform.toast(text, tone)
  }

  function invalidateCompletedExport() {
    if (!hydrated.value || exporting.value) return
    if (liveExportState.value.phase === 'done') exportQueue.clearFinished(projectId.value)
  }

  function summaryFrom(project: SavedScreensaverProject, render: ScreensaverRenderState): ScreensaverProjectSummary {
    const now = Date.now()
    return {
      id: project.id || '',
      name: project.name,
      createdAt: project.createdAt ?? now,
      updatedAt: project.updatedAt ?? now,
      thumbnail: project.thumbnail,
      mediaKind: project.mediaKind,
      fileName: project.fileName,
      sourceWidth: project.width,
      sourceHeight: project.height,
      sourceDuration: project.sourceDuration,
      serverId: project.serverId,
      durationSeconds: project.durationSeconds,
      outputWidth: project.outputWidth,
      outputHeight: project.outputHeight,
      frameId: project.composition?.frameId ?? 'none',
      audioMode: project.audioMode,
      audioFileName: project.audioFileName,
      configFingerprint: project.configFingerprint ?? '',
      render,
    }
  }

  function fingerprintForSaved(project: SavedScreensaverProject, uploadAudio: File | null): string {
    if (!project.serverId || !project.mediaKind) return ''
    const animSettings = project.subscribeAnimation
      ? sanitizeSubscribeAnimation(project.subscribeAnimation)
      : defaultSubscribeAnimation()
    const overlay =
      animSettings.enabled
        ? subscribeAnimationOverlayOnOutput(project.outputWidth, project.outputHeight, animSettings)
        : null
    const composition = project.composition
      ? clampComposition(project.composition)
      : compositionForFit(
          project.fit,
          project.width || 1,
          project.height || 1,
          project.outputWidth,
          project.outputHeight,
          project.backgroundColor,
        )
    const projectJson: Record<string, unknown> = {
      filename: project.name.trim() || 'screensaver',
      mediaId: project.serverId,
      kind: project.mediaKind,
      mode: project.mode,
      width: project.outputWidth,
      height: project.outputHeight,
      fps: project.fps,
      duration: project.durationSeconds,
      fit: project.fit,
      loopType: project.loopType,
      crossfadeSeconds: project.crossfadeSeconds,
      audioMode: project.audioMode,
      audioVolume: project.audioVolume,
      audioFadeIn: project.audioFadeIn,
      audioFadeOut: project.audioFadeOut,
      loopAudio: project.loopAudio,
      backgroundColor: project.backgroundColor,
      profile: project.profile ?? 'static-fast',
      encoder: project.encoder ?? 'cpu',
      renderingMode: project.renderingMode ?? 'fast-vfr',
      cfrQuality: project.cfrQuality ?? 'balanced',
      composition,
      subscribeAnimation: overlay
        ? { ...animSettings, overlayX: overlay.x, overlayY: overlay.y }
        : animSettings,
    }
    return screensaverExportFingerprint(projectJson, project.audioMode === 'upload' ? uploadAudio : null)
  }

  function uploadView(item: ScreensaverProjectSummary) {
    const live = sourceUploads.value[item.id]
    const missing = item.mediaKind != null && !sourceIds.value.includes(item.id)
    if (live && !missing) {
      return {
        state: live.state,
        progress: live.progress,
        error: live.error,
        fileName: live.fileName || item.fileName,
        fileSize: live.fileSize,
        width: live.width || item.sourceWidth,
        height: live.height || item.sourceHeight,
        duration: live.duration ?? item.sourceDuration,
      }
    }
    if (missing) {
      return {
        state: 'error' as const,
        progress: 0,
        error: 'The source file is no longer available.',
        fileName: item.fileName,
        fileSize: null,
        width: item.sourceWidth,
        height: item.sourceHeight,
        duration: item.sourceDuration,
      }
    }
    if (!item.serverId) {
      return {
        state: 'error' as const,
        progress: 0,
        error: 'Upload did not finish.',
        fileName: item.fileName,
        fileSize: null,
        width: item.sourceWidth,
        height: item.sourceHeight,
        duration: item.sourceDuration,
      }
    }
    return {
      state: 'ready' as const,
      progress: 1,
      error: null,
      fileName: item.fileName,
      fileSize: live?.fileSize ?? null,
      width: item.sourceWidth,
      height: item.sourceHeight,
      duration: item.sourceDuration,
    }
  }

  function rememberUpload(id: string, status: SourceUploadStatus) {
    sourceUploads.value = { ...sourceUploads.value, [id]: status }
  }

  function patchUpload(id: string, patch: Partial<SourceUploadStatus>) {
    const current = sourceUploads.value[id]
    if (!current) return
    rememberUpload(id, { ...current, ...patch })
  }

  function forgetUpload(id: string) {
    if (!sourceUploads.value[id]) return
    const next = { ...sourceUploads.value }
    delete next[id]
    sourceUploads.value = next
  }

  function upsertSummary(summary: ScreensaverProjectSummary) {
    projects.value = [...projects.value.filter((item) => item.id !== summary.id), summary]
  }

  function rememberId(list: typeof sourceIds, id: string) {
    if (!list.value.includes(id)) list.value = [...list.value, id]
  }

  function forgetId(list: typeof sourceIds, id: string) {
    list.value = list.value.filter((item) => item !== id)
  }

  function frameIsMissing(frameId: string): boolean {
    if (!framesLoaded.value || !frameId || frameId === 'none' || isBuiltinFrameId(frameId)) return false
    return !frames.value.some((frame) => frame.id === frameId)
  }

  function detachMedia() {
    clearSourceUrls()
    sourceFile = null
    clearBackgroundAudioInMemory()
  }

  function applyRenderEvent(event: ScreensaverRenderEvent) {
    const summary = projects.value.find((item) => item.id === event.projectId)
    if (!summary) return
    const next = applyExportToRender(summary.render, event)
    if (!next) return
    upsertSummary({ ...summary, render: next })
    if (event.projectId === projectId.value) projectRender.value = next
    void projectLibrary.saveScreensaverRenderState(event.projectId, next).catch(() => undefined)
  }

  function adoptTrack(id: string, trackId: string) {
    const summary = projects.value.find((item) => item.id === id)
    const next = bindRenderTrack(summary?.render ?? projectRender.value, trackId)
    if (summary) upsertSummary({ ...summary, render: next })
    if (id === projectId.value) projectRender.value = next
    void projectLibrary.saveScreensaverRenderState(id, next).catch(() => undefined)
  }

  async function flushPersist() {
    window.clearTimeout(metaTimer)
    if (!hydrated.value || applyingProject || !projectId.value) return
    await persistMeta()
  }

  async function restoreProjectMedia(id: string) {
    frameNotice.value = null
    const stored = await projectLibrary.loadScreensaverProjectFile(id, 'source')
    if (stored) {
      sourceFile = new File([stored.blob], stored.name, { type: stored.type || 'application/octet-stream' })
      objectUrl.value = URL.createObjectURL(sourceFile)
      fileName.value = stored.name
      sourceFileSize.value = sourceFile.size
      uploadState.value = 'uploading'
      uploadError.value = null
      rememberId(sourceIds, id)
      const live = sourceUploads.value[id]
      if (live?.state === 'uploading') {
        uploadState.value = 'uploading'
        uploadProgress.value = live.progress
        uploadError.value = live.error
      } else {
        void resumeUpload()
      }
    } else if (mediaKind.value) {
      sourceFile = null
      clearSourceUrls()
      forgetId(sourceIds, id)
      uploadState.value = 'error'
      uploadError.value = 'The source file is no longer available.'
    } else {
      uploadState.value = 'empty'
      uploadError.value = null
    }

    const savedAudioName = audioFileName.value
    const wantsUpload = audioMode.value === 'upload' || Boolean(savedAudioName)
    const audio = await projectLibrary.loadScreensaverProjectFile(id, 'audio')
    if (audio && wantsUpload) {
      clearBackgroundAudioInMemory()
      audioFile = new File([audio.blob], audio.name, { type: audio.type || 'audio/mpeg' })
      audioUrl.value = URL.createObjectURL(audioFile)
      audioFileName.value = audio.name
      audioFileSize.value = audioFile.size
      audioMode.value = 'upload'
      rememberId(audioIds, id)
      return
    }
    clearBackgroundAudioInMemory()
    if (wantsUpload) {
      audioMode.value = 'upload'
      audioFileName.value = savedAudioName
      forgetId(audioIds, id)
    }
  }

  async function refreshRenderRecord(id: string, render: ScreensaverRenderState): Promise<ScreensaverRenderState> {
    if (render.status !== 'queued' && render.status !== 'rendering') {
      if (render.status !== 'completed' || !render.jobId || render.outputMissing) return render
      try {
        const job = await api.fetchJob(render.jobId)
        if (!job || job.status !== 'done') return { ...render, outputMissing: true }
      } catch {
        return render
      }
      return render
    }
    const waiting = { ...render, trackId: null }
    if (!render.jobId) return waiting
    try {
      const job = await api.fetchJob(render.jobId)
      if (!job) {
        return { ...waiting, status: 'failed', error: 'The render is no longer on the server.' }
      }
      if (job.status === 'done') {
        return {
          ...waiting,
          status: 'completed',
          progress: 1,
          jobId: job.id,
          outputUrl: `/api/jobs/${job.id}/download`,
          outputFilename: render.outputFilename || `${job.downloadName || 'screensaver'}.mp4`,
          outputMissing: false,
          error: null,
        }
      }
      if (job.status === 'error') return { ...waiting, status: 'failed', error: job.error || 'Export failed.' }
      if (job.status === 'cancelled') return { ...waiting, status: 'cancelled', error: null }
      return {
        ...waiting,
        status: job.status === 'queued' ? 'queued' : 'rendering',
        progress: job.progress,
        jobId: job.id,
      }
    } catch {
      return waiting
    }
  }

  async function refreshStoredRenders() {
    for (const summary of [...projects.value]) {
      const next = await refreshRenderRecord(summary.id, summary.render)
      if (next === summary.render) continue
      upsertSummary({ ...summary, render: next })
      if (summary.id === projectId.value) projectRender.value = next
      void projectLibrary.saveScreensaverRenderState(summary.id, next).catch(() => undefined)
    }
  }

  async function loadProjectIntoEditor(id: string): Promise<boolean> {
    const saved = await projectLibrary.loadScreensaverProjectRecord(id)
    if (!saved?.id) return false
    applyingProject = true
    detachMedia()
    applySaved(saved)
    projectId.value = saved.id
    createdAt.value = saved.createdAt ?? Date.now()
    updatedAt.value = saved.updatedAt ?? createdAt.value
    const summary = projects.value.find((item) => item.id === saved.id)
    let render = summary?.render ?? draftRender()
    if (isLiveRenderStatus(render.status)) render = { ...render, trackId: null }
    projectRender.value = render
    await restoreProjectMedia(saved.id)
    if (frameIsMissing(composition.value.frameId)) {
      frameNotice.value = 'The selected frame is no longer on the server.'
      replaceComposition({ ...composition.value, frameId: 'none' })
    }
    seedEditStamp()
    applyingProject = false
    if (frameNotice.value) await persistMeta()
    await projectLibrary.saveScreensaverActiveId(saved.id).catch(() => undefined)
    return true
  }

  async function init() {
    if (hydrated.value) {
      const pending = takePendingScreensaverProject()
      if (pending) await openProject(pending)
      return
    }
    if (pageWasReloaded()) {
      exportQueue.cancelAll()
      exportQueue.clearFinished()
    }
    await platform.refreshServer()
    void loadEncoders()
    try {
      const library = await projectLibrary.loadScreensaverLibrary()
      sourceIds.value = [...library.sourceIds]
      audioIds.value = [...library.audioIds]
      projects.value = library.projects
        .filter((project) => project.id)
        .map((project) => summaryFrom(project, library.renders.get(project.id!) ?? draftRender()))
      let id = library.activeId
      if (!id || !projects.value.some((item) => item.id === id)) {
        id = [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null
      }
      if (!id) {
        const now = Date.now()
        projectId.value = crypto.randomUUID()
        createdAt.value = now
        updatedAt.value = now
        projectRender.value = draftRender()
        resetToDefaults()
        await persistMeta()
        await projectLibrary.saveScreensaverRenderState(projectId.value, projectRender.value)
        await projectLibrary.saveScreensaverActiveId(projectId.value)
      } else {
        await loadProjectIntoEditor(id)
      }
      await refreshStoredRenders()
    } catch {
      toast('The saved screensaver projects could not be restored.')
      if (!projectId.value) {
        projectId.value = crypto.randomUUID()
        createdAt.value = Date.now()
        updatedAt.value = createdAt.value
        resetToDefaults()
      }
    } finally {
      const pending = takePendingScreensaverProject()
      libraryReady = true
      markScreensaverProjectsReady()
      hydrated.value = true
      ensureServerUploadCleanupOnClose()
      void loadFrames()
      for (const event of peekScreensaverRenderEvents()) applyRenderEvent(event)
      if (pending && pending !== projectId.value) await openProject(pending)
    }
  }

  async function loadFrames() {
    try {
      const saved = await api.listScreensaverFrames()
      frames.value = saved
      framesLoaded.value = true
      if (
        composition.value.frameId !== 'none' &&
        !isBuiltinFrameId(composition.value.frameId) &&
        !saved.some((frame) => frame.id === composition.value.frameId)
      ) {
        frameNotice.value = 'The selected frame is no longer on the server.'
        replaceComposition({ ...composition.value, frameId: 'none' })
        commitComposition()
        toast(frameNotice.value, 'info')
      }
      await syncFrameImage(composition.value.frameId)
    } catch {
      framesLoaded.value = false
    }
  }

  async function syncFrameImage(id: string) {
    const token = ++frameImageToken
    if (id === 'none') {
      frameImage.value = null
      return
    }
    try {
      const image = await loadHtmlImage(frameImageUrl(id))
      if (token !== frameImageToken) return
      frameImage.value = image
    } catch {
      if (token !== frameImageToken) return
      frameImage.value = null
    }
  }

  async function uploadFrames(files: File[]) {
    if (frameUploading.value || files.length === 0) return
    frameUploading.value = true
    let lastUploadedId: string | null = null
    try {
      for (const file of files) {
        if (!(await fileIsPng(file))) {
          toast(`${file.name} is not a PNG file.`)
          continue
        }
        if (file.size > FRAME_FILE_LIMIT) {
          toast(`${file.name} is larger than ${FRAME_FILE_LIMIT / (1024 * 1024)} MB.`)
          continue
        }
        const saved = await api.uploadScreensaverFrame(file)
        frames.value = [saved, ...frames.value.filter((frame) => frame.id !== saved.id)]
        framesLoaded.value = true
        lastUploadedId = saved.id
      }
      if (lastUploadedId) {
        replaceComposition({ ...composition.value, frameId: lastUploadedId })
        commitComposition()
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The frame could not be uploaded.')
    } finally {
      frameUploading.value = false
    }
  }

  function selectFrame(id: string) {
    const frameId = composition.value.frameId === id ? 'none' : id
    frameNotice.value = null
    replaceComposition({ ...composition.value, frameId })
    commitComposition()
  }

  async function removeFrame(id: string) {
    try {
      await api.deleteScreensaverFrame(id)
      frames.value = frames.value.filter((frame) => frame.id !== id)
      if (composition.value.frameId === id) {
        replaceComposition({ ...composition.value, frameId: 'none' })
        commitComposition()
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The frame could not be removed.')
    }
  }

  function applySaved(saved: SavedScreensaverProject) {
    name.value = saved.name
    mode.value = saved.mode
    mediaKind.value = saved.mediaKind
    serverId.value = saved.serverId
    fileName.value = saved.fileName
    width.value = saved.width
    height.value = saved.height
    sourceDuration.value = saved.sourceDuration
    hasAudio.value = saved.hasAudio
    thumbnail.value = saved.thumbnail
    outputWidth.value = saved.outputWidth
    outputHeight.value = saved.outputHeight
    fps.value = saved.fps
    durationSeconds.value = saved.durationSeconds
    durationPresetKey.value = saved.durationPresetKey
    fit.value = saved.fit
    loopType.value = saved.loopType
    crossfadeSeconds.value = saved.crossfadeSeconds
    audioMode.value = saved.audioMode
    audioVolume.value = saved.audioVolume
    audioFadeIn.value = saved.audioFadeIn
    audioFadeOut.value = saved.audioFadeOut
    loopAudio.value = saved.loopAudio
    backgroundColor.value = saved.backgroundColor
    audioFileName.value = saved.audioFileName
    profile.value = isScreensaverProfile(saved.profile) ? saved.profile : 'balanced'
    encoder.value = isEncoderChoice(saved.encoder) ? saved.encoder : 'cpu'
    // Older saves omit renderingMode — keep Fast VFR; do not migrate to Optimized CFR.
    renderingMode.value = isScreensaverRenderMode(saved.renderingMode) ? saved.renderingMode : 'fast-vfr'
    cfrQuality.value = isScreensaverCfrQuality(saved.cfrQuality) ? saved.cfrQuality : DEFAULT_SCREENSAVER_CFR_QUALITY
    composition.value =
      saved.version !== 1 && saved.composition
        ? clampComposition(saved.composition)
        : compositionForFit(saved.fit, saved.width, saved.height, saved.outputWidth, saved.outputHeight, saved.backgroundColor)
    subscribeAnimation.value = saved.subscribeAnimation
      ? sanitizeSubscribeAnimation(saved.subscribeAnimation)
      : defaultSubscribeAnimation()
    history.value = [cloneComposition(composition.value)]
    historyIndex.value = 0
    uploadState.value = saved.serverId ? 'uploading' : saved.mediaKind ? 'error' : 'empty'
  }

  function buildProjectRecord(): SavedScreensaverProject {
    const now = Date.now()
    if (!createdAt.value) createdAt.value = now
    return {
      version: 3,
      id: projectId.value,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      name: name.value,
      mode: mode.value,
      mediaKind: mediaKind.value,
      serverId: serverId.value,
      fileName: fileName.value,
      width: width.value,
      height: height.value,
      sourceDuration: sourceDuration.value,
      hasAudio: hasAudio.value,
      thumbnail: thumbnail.value,
      outputWidth: outputWidth.value,
      outputHeight: outputHeight.value,
      fps: fps.value,
      durationSeconds: durationSeconds.value,
      durationPresetKey: durationPresetKey.value,
      fit: fit.value,
      loopType: loopType.value,
      crossfadeSeconds: crossfadeSeconds.value,
      audioMode: audioMode.value,
      audioVolume: audioVolume.value,
      audioFadeIn: audioFadeIn.value,
      audioFadeOut: audioFadeOut.value,
      loopAudio: loopAudio.value,
      backgroundColor: backgroundColor.value,
      audioFileName: audioFileName.value,
      profile: profile.value,
      encoder: encoder.value,
      renderingMode: renderingMode.value,
      cfrQuality: cfrQuality.value,
      composition: cloneComposition(composition.value),
      subscribeAnimation: sanitizeSubscribeAnimation(subscribeAnimation.value),
    }
  }

  function seedEditStamp() {
    const id = projectId.value
    if (!id) return
    editStamps.set(id, editStamp(buildProjectRecord()))
  }

  async function persistMeta() {
    if (!projectId.value) return
    const payload = buildProjectRecord()
    const stamp = editStamp(payload)
    const id = payload.id || projectId.value
    if (editStamps.get(id) !== stamp) {
      const now = Date.now()
      payload.updatedAt = now
      updatedAt.value = now
    }
    editStamps.set(id, stamp)
    payload.configFingerprint =
      currentExportFingerprint.value || fingerprintForSaved(payload, audioMode.value === 'upload' ? audioFile : null)
    await projectLibrary.saveScreensaverProjectRecord(payload).catch(() => undefined)
    upsertSummary(summaryFrom(payload, projectRender.value))
    await projectLibrary.saveScreensaverActiveId(projectId.value).catch(() => undefined)
  }

  async function sourceKind(file: File): Promise<'image' | 'video' | null> {
    const videoErr = validateScreensaverVideoFile(file)
    if (!videoErr) return 'video'
    const imageErr = await validateImageFile(file)
    if (!imageErr) return 'image'
    toast(videoErr || imageErr || 'This file type is not supported.')
    return null
  }

  async function pickSource(file: File) {
    const kind = await sourceKind(file)
    if (!kind) return
    await attachSourceToActive(file, kind)
  }

  async function attachSourceToActive(file: File, kind: 'image' | 'video') {
    const id = projectId.value
    clearSourceUrls()
    sourceFile = file
    fileName.value = file.name
    sourceFileSize.value = file.size
    mediaKind.value = kind
    mode.value = kind === 'image' ? 'static' : 'loop'
    if (kind === 'image') {
      renderingMode.value = DEFAULT_SCREENSAVER_RENDER_MODE
      cfrQuality.value = DEFAULT_SCREENSAVER_CFR_QUALITY
      profile.value = 'balanced'
      fps.value = DEFAULT_CFR_FPS
    } else {
      renderingMode.value = 'fast-vfr'
      profile.value = 'animated'
      fps.value = 30
    }
    if (name.value.trim() === defaultProject().name) name.value = projectNameFromFile(file)
    objectUrl.value = URL.createObjectURL(file)
    uploadState.value = 'uploading'
    uploadProgress.value = 0
    uploadError.value = null
    serverId.value = null
    if (id) {
      rememberId(sourceIds, id)
      rememberUpload(id, {
        state: 'uploading',
        progress: 0,
        error: null,
        fileName: file.name,
        fileSize: file.size,
        width: 0,
        height: 0,
        duration: null,
      })
      void projectLibrary.saveScreensaverProjectFile(id, 'source', file).catch(() => {
        toast('Could not save a local copy of this file.', 'info')
      })
    }
    if (kind === 'image') {
      const meta = await readImageFile(objectUrl.value)
      if (meta) {
        width.value = meta.width
        height.value = meta.height
        thumbnail.value = meta.thumbnail
        sourceDuration.value = null
        hasAudio.value = false
        placeForSource()
        if (id) patchUpload(id, { width: meta.width, height: meta.height, duration: null })
      }
    } else {
      const meta = await readVideoFile(objectUrl.value)
      if (meta) {
        width.value = meta.width
        height.value = meta.height
        thumbnail.value = meta.thumbnail
        sourceDuration.value = meta.duration
        hasAudio.value = true
        placeForSource()
        if (id) patchUpload(id, { width: meta.width, height: meta.height, duration: meta.duration })
      }
    }
    if (id) {
      void persistMeta()
      void uploadProjectFile(id, file)
    }
  }

  async function addSourceFiles(files: File[]) {
    if (!files.length) return
    if (!hydrated.value) await init()
    const accepted: { file: File; kind: 'image' | 'video' }[] = []
    for (const file of files) {
      const kind = await sourceKind(file)
      if (kind) accepted.push({ file, kind })
    }
    if (!accepted.length) return

    const fillCurrent = !mediaKind.value && Boolean(projectId.value)
    if (fillCurrent) {
      const [first, ...rest] = accepted
      if (!first) return
      await attachSourceToActive(first.file, first.kind)
      for (const item of rest) await createDetachedProject(item.file, item.kind)
      return
    }

    await flushPersist()
    const created: string[] = []
    for (const item of accepted) created.push(await createDetachedProject(item.file, item.kind))
    const openId = created[created.length - 1]
    if (openId) await openProject(openId)
  }

  async function createDetachedProject(file: File, kind: 'image' | 'video'): Promise<string> {
    const id = crypto.randomUUID()
    const now = Date.now()
    const defaults = defaultProject()
    const previewUrl = URL.createObjectURL(file)
    let sourceWidth = 0
    let sourceHeight = 0
    let thumbnail: string | null = null
    let sourceDuration: number | null = null
    let hasSourceAudio = false
    if (kind === 'image') {
      const meta = await readImageFile(previewUrl)
      if (meta) {
        sourceWidth = meta.width
        sourceHeight = meta.height
        thumbnail = meta.thumbnail
      }
    } else {
      const meta = await readVideoFile(previewUrl)
      if (meta) {
        sourceWidth = meta.width
        sourceHeight = meta.height
        thumbnail = meta.thumbnail
        sourceDuration = meta.duration
        hasSourceAudio = true
      }
    }
    URL.revokeObjectURL(previewUrl)

    const payload: SavedScreensaverProject = {
      ...defaults,
      version: 3,
      id,
      createdAt: now,
      updatedAt: now,
      name: projectNameFromFile(file),
      mode: kind === 'image' ? 'static' : 'loop',
      mediaKind: kind,
      fileName: file.name,
      width: sourceWidth,
      height: sourceHeight,
      sourceDuration,
      hasAudio: hasSourceAudio,
      thumbnail,
      fps: kind === 'image' ? DEFAULT_CFR_FPS : 30,
      profile: kind === 'image' ? 'balanced' : 'animated',
      encoder: 'cpu',
      renderingMode: kind === 'image' ? DEFAULT_SCREENSAVER_RENDER_MODE : 'fast-vfr',
      cfrQuality: DEFAULT_SCREENSAVER_CFR_QUALITY,
      composition: compositionForFit(
        'contain',
        sourceWidth || 1,
        sourceHeight || 1,
        defaults.outputWidth,
        defaults.outputHeight,
        defaults.backgroundColor,
      ),
      subscribeAnimation: sanitizeSubscribeAnimation(defaultSubscribeAnimation()),
    }
    await projectLibrary.saveScreensaverProjectRecord(payload)
    await projectLibrary.saveScreensaverRenderState(id, draftRender())
    await projectLibrary.saveScreensaverProjectFile(id, 'source', file)
    rememberId(sourceIds, id)
    rememberUpload(id, {
      state: 'uploading',
      progress: 0,
      error: null,
      fileName: file.name,
      fileSize: file.size,
      width: sourceWidth,
      height: sourceHeight,
      duration: sourceDuration,
    })
    upsertSummary(summaryFrom(payload, draftRender()))
    void uploadProjectFile(id, file)
    return id
  }

  async function hasBlockingSource(): Promise<boolean> {
    if (hydrated.value) return mediaKind.value === 'image' || mediaKind.value === 'video'
    const library = await projectLibrary.loadScreensaverLibrary()
    const id = library.activeId
    if (!id) return false
    const stored = await projectLibrary.loadScreensaverProjectFile(id, 'source')
    if (stored?.blob) return true
    const saved = library.projects.find((project) => project.id === id)
    return saved?.mediaKind === 'image' || saved?.mediaKind === 'video'
  }

  async function acceptExternalImage(file: File): Promise<void> {
    await addSourceFiles([file])
  }

  async function uploadProjectFile(id: string, file: File) {
    const previous = sourceUploads.value[id]
    rememberUpload(id, {
      state: 'uploading',
      progress: previous?.progress ?? 0,
      error: null,
      fileName: file.name,
      fileSize: file.size,
      width: previous?.width || (id === projectId.value ? width.value : 0),
      height: previous?.height || (id === projectId.value ? height.value : 0),
      duration: previous?.duration ?? (id === projectId.value ? sourceDuration.value : null),
    })
    if (id === projectId.value) {
      uploadState.value = 'uploading'
      uploadError.value = null
    }
    try {
      if (!serverOnline.value) await platform.refreshServer()
      if (!serverOnline.value) throw new Error('The renderer is offline.')
      const result = await api.uploadScreensaverMedia(file, (fraction) => {
        patchUpload(id, { progress: fraction })
        if (id === projectId.value) uploadProgress.value = fraction
      })
      patchUpload(id, {
        state: 'ready',
        progress: 1,
        error: null,
        width: result.width,
        height: result.height,
        duration: result.duration,
      })
      if (id === projectId.value) {
        serverId.value = result.id
        mediaKind.value = result.kind
        width.value = result.width
        height.value = result.height
        sourceDuration.value = result.duration
        hasAudio.value = result.hasAudio
        uploadState.value = 'ready'
        uploadProgress.value = 1
        return
      }
      const saved = await projectLibrary.loadScreensaverProjectRecord(id)
      if (!saved?.id) return
      const updated: SavedScreensaverProject = {
        ...saved,
        serverId: result.id,
        mediaKind: result.kind,
        width: result.width,
        height: result.height,
        sourceDuration: result.duration,
        hasAudio: result.hasAudio,
      }
      await projectLibrary.saveScreensaverProjectRecord(updated)
      const summary = projects.value.find((item) => item.id === id)
      if (summary) {
        upsertSummary({
          ...summary,
          mediaKind: result.kind,
          serverId: result.id,
          sourceWidth: result.width,
          sourceHeight: result.height,
          sourceDuration: result.duration,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.'
      patchUpload(id, { state: 'error', error: message })
      if (id === projectId.value) {
        uploadState.value = 'error'
        uploadError.value = message
      }
      toast(message)
    }
  }

  async function resumeUpload() {
    const id = projectId.value
    if (!sourceFile || !id) {
      uploadState.value = 'error'
      return
    }
    if (serverId.value && (await api.clipExists(serverId.value))) {
      uploadState.value = 'ready'
      uploadProgress.value = 1
      rememberUpload(id, {
        state: 'ready',
        progress: 1,
        error: null,
        fileName: fileName.value,
        fileSize: sourceFile.size,
        width: width.value,
        height: height.value,
        duration: sourceDuration.value,
      })
      return
    }
    serverId.value = null
    await uploadProjectFile(id, sourceFile)
  }

  function removeSource() {
    clearSourceUrls()
    sourceFile = null
    mediaKind.value = null
    serverId.value = null
    fileName.value = ''
    sourceFileSize.value = null
    width.value = 0
    height.value = 0
    sourceDuration.value = null
    hasAudio.value = false
    thumbnail.value = null
    uploadState.value = 'empty'
    uploadError.value = null
    if (projectId.value) {
      forgetId(sourceIds, projectId.value)
      forgetUpload(projectId.value)
      void idb.deleteScreensaverKeys([idb.screensaverSourceKey(projectId.value)]).catch(() => undefined)
    }
  }

  function resetToDefaults(): void {
    const defaults = defaultProject()
    name.value = defaults.name
    mode.value = defaults.mode
    mediaKind.value = defaults.mediaKind
    serverId.value = defaults.serverId
    fileName.value = defaults.fileName
    sourceFileSize.value = null
    width.value = defaults.width
    height.value = defaults.height
    sourceDuration.value = defaults.sourceDuration
    hasAudio.value = defaults.hasAudio
    thumbnail.value = defaults.thumbnail
    outputWidth.value = defaults.outputWidth
    outputHeight.value = defaults.outputHeight
    fps.value = defaults.fps
    durationSeconds.value = defaults.durationSeconds
    durationPresetKey.value = defaults.durationPresetKey
    fit.value = defaults.fit
    loopType.value = defaults.loopType
    crossfadeSeconds.value = defaults.crossfadeSeconds
    audioMode.value = defaults.audioMode
    audioVolume.value = defaults.audioVolume
    audioFadeIn.value = defaults.audioFadeIn
    audioFadeOut.value = defaults.audioFadeOut
    loopAudio.value = defaults.loopAudio
    backgroundColor.value = defaults.backgroundColor
    audioFileName.value = defaults.audioFileName
    audioFileSize.value = null
    profile.value = 'balanced'
    encoder.value = 'cpu'
    renderingMode.value = DEFAULT_SCREENSAVER_RENDER_MODE
    cfrQuality.value = DEFAULT_SCREENSAVER_CFR_QUALITY
    composition.value = defaultComposition()
    history.value = [cloneComposition(composition.value)]
    historyIndex.value = 0
    uploadProgress.value = 0
    uploadError.value = null
    compareAdjustments.value = false
    cropEditing.value = false
    frameImage.value = null
    autoStill.value = null
    autoMotion.value = null
    subscribeAnimation.value = defaultSubscribeAnimation()
  }

  function isPristineDraft(): boolean {
    if (mediaKind.value || audioFileName.value) return false
    if (projectRender.value.status !== 'draft') return false
    return name.value.trim() === defaultProject().name
  }

  async function newProject(): Promise<void> {
    if (!hydrated.value) return
    await flushPersist()
    if (isPristineDraft()) {
      applyingProject = true
      detachMedia()
      resetToDefaults()
      frameNotice.value = null
      applyingProject = false
      await persistMeta()
      return
    }
    const id = crypto.randomUUID()
    const now = Date.now()
    applyingProject = true
    detachMedia()
    resetToDefaults()
    projectId.value = id
    createdAt.value = now
    updatedAt.value = now
    projectRender.value = draftRender()
    frameNotice.value = null
    applyingProject = false
    await persistMeta()
    await projectLibrary.saveScreensaverRenderState(id, projectRender.value).catch(() => undefined)
  }

  function clearSourceUrls() {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }

  function setDurationPreset(key: string, seconds: number) {
    durationPresetKey.value = key
    durationSeconds.value = seconds
  }

  function setCustomDurationMinutes(minutes: number) {
    durationPresetKey.value = 'custom'
    durationSeconds.value = Math.round(minutes * 60)
  }

  function setResolution(widthValue: number, heightValue: number) {
    outputWidth.value = widthValue
    outputHeight.value = heightValue
  }

  function clearBackgroundAudioInMemory() {
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
    audioFile = null
    audioUrl.value = null
    audioFileName.value = null
    audioFileSize.value = null
  }

  async function setAudioFile(file: File) {
    const problem = validateAudioFile(file)
    if (problem) {
      toast(problem)
      return
    }
    try {
      if (projectId.value) {
        await projectLibrary.saveScreensaverProjectFile(projectId.value, 'audio', file)
        rememberId(audioIds, projectId.value)
      }
    } catch {
      toast('Could not save audio locally. It will work until you refresh.', 'info')
    }
    clearBackgroundAudioInMemory()
    audioFile = file
    audioUrl.value = URL.createObjectURL(file)
    audioFileName.value = file.name
    audioFileSize.value = file.size
    audioMode.value = 'upload'
  }

  function clearAudio() {
    clearBackgroundAudioInMemory()
    if (audioMode.value === 'upload') audioMode.value = 'none'
    if (projectId.value) {
      forgetId(audioIds, projectId.value)
      void idb.deleteScreensaverKeys([idb.screensaverAudioKey(projectId.value)]).catch(() => undefined)
    }
  }

  function placeForSource() {
    const frameId = composition.value.frameId
    composition.value = {
      ...compositionForFit(fit.value, width.value, height.value, outputWidth.value, outputHeight.value, backgroundColor.value),
      frameId,
    }
    history.value = [cloneComposition(composition.value)]
    historyIndex.value = 0
  }

  function replaceComposition(value: ScreensaverComposition) {
    composition.value = clampComposition({ ...composition.value, ...value, adjustments: { ...composition.value.adjustments, ...value.adjustments }, background: { ...composition.value.background, ...value.background }, crop: { ...composition.value.crop, ...value.crop } })
  }

  function replaceSubscribeAnimation(value: Partial<SubscribeAnimationSettings>) {
    subscribeAnimation.value = sanitizeSubscribeAnimation({ ...subscribeAnimation.value, ...value })
  }

  async function fetchSubscribeChannelFromUrl(rawUrl?: string) {
    const target = (rawUrl ?? subscribeAnimation.value.channelUrl).trim()
    if (!target) {
      toast('Paste a YouTube channel or video link first.', 'info')
      return
    }
    subscribeChannelLookupLoading.value = true
    try {
      const result = await api.lookupYoutubeChannel(target)
      await ingestSubscribeChannelAvatar(result.avatarUrl, result.avatarDataUrl)
      replaceSubscribeAnimation({
        channelUrl: result.channelUrl ?? target,
        channelName: result.channelName ?? subscribeAnimation.value.channelName,
        channelAvatarUrl: result.avatarUrl,
        channelSubscriberCount: result.subscriberCount,
      })
      toast(result.channelName ? `Loaded ${result.channelName}.` : 'Channel info updated.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load channel info.')
    } finally {
      subscribeChannelLookupLoading.value = false
    }
  }

  watch(
    () => subscribeAnimation.value.channelAvatarUrl,
    (url) => {
      void preloadSubscribeChannelAvatar(url)
    },
  )

  function commitComposition() {
    const next = cloneComposition(composition.value)
    const stack = history.value.slice(0, historyIndex.value + 1)
    const last = stack[stack.length - 1]
    if (last && JSON.stringify(last) === JSON.stringify(next)) return
    stack.push(next)
    history.value = stack.slice(-50)
    historyIndex.value = history.value.length - 1
  }

  function undo() {
    if (historyIndex.value <= 0) return
    historyIndex.value -= 1
    composition.value = cloneComposition(history.value[historyIndex.value]!)
  }

  function redo() {
    if (historyIndex.value >= history.value.length - 1) return
    historyIndex.value += 1
    composition.value = cloneComposition(history.value[historyIndex.value]!)
  }

  function fitContain() {
    const placement = placementForFit('contain', width.value || 1, height.value || 1, outputWidth.value, outputHeight.value, composition.value.crop)
    fit.value = 'contain'
    replaceComposition({ ...composition.value, ...placement })
    commitComposition()
  }

  function fitCover() {
    const placement = placementForFit('cover', width.value || 1, height.value || 1, outputWidth.value, outputHeight.value, composition.value.crop)
    fit.value = 'cover'
    replaceComposition({ ...composition.value, ...placement, background: { ...composition.value.background, mode: 'color' } })
    commitComposition()
  }

  function centerHorizontal() {
    replaceComposition({ ...composition.value, x: (1 - composition.value.width) / 2 })
    commitComposition()
  }

  function centerVertical() {
    replaceComposition({ ...composition.value, y: (1 - composition.value.height) / 2 })
    commitComposition()
  }

  function resetTransform() {
    replaceComposition({
      ...composition.value,
      ...placementForFit('contain', width.value || 1, height.value || 1, outputWidth.value, outputHeight.value, composition.value.crop),
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
    })
    commitComposition()
  }

  function setCropAspect(aspect: CropAspect, sourceW: number, sourceH: number) {
    if (aspect === 'free') {
      replaceComposition({ ...composition.value, cropAspect: aspect })
      commitComposition()
      return
    }
    const ratio = aspectRatio(aspect, sourceW, sourceH, composition.value.customAspectW, composition.value.customAspectH)
    if (!ratio || sourceW < 1 || sourceH < 1) {
      replaceComposition({ ...composition.value, cropAspect: aspect })
      commitComposition()
      return
    }
    replaceComposition({ ...composition.value, cropAspect: aspect, crop: cropForAspect(ratio * (sourceH / sourceW)) })
    commitComposition()
  }

  function resetCrop() {
    replaceComposition({ ...composition.value, crop: { x: 0, y: 0, w: 1, h: 1 }, cropAspect: 'free' })
    commitComposition()
  }

  function cropRatio(sourceW: number, sourceH: number): number | null {
    return aspectRatio(composition.value.cropAspect, sourceW, sourceH, composition.value.customAspectW, composition.value.customAspectH)
  }

  function setProfile(next: ScreensaverProfile) {
    profile.value = next
    if (renderingMode.value === 'fast-vfr') fps.value = profileFps(next)
  }

  function setRenderingMode(next: ScreensaverRenderMode) {
    renderingMode.value = next
    if (next === 'optimized-cfr') {
      if (!(SCREENSAVER_CFR_FPS as readonly number[]).includes(fps.value)) fps.value = DEFAULT_CFR_FPS
      if (mode.value === 'loop' || mediaKind.value === 'video') {
        // Optimized CFR is static-image only; keep selection but export will require static mode.
      }
    } else if (!(SCREENSAVER_FPS as readonly number[]).includes(fps.value)) {
      fps.value = profileFps(profile.value)
    }
  }

  function setCfrQuality(next: ScreensaverCfrQuality) {
    cfrQuality.value = next
  }

  function resetAdjustments() {
    replaceComposition({ ...composition.value, adjustments: defaultComposition().adjustments })
    commitComposition()
  }

  function setFit(next: ScreensaverFit) {
    fit.value = next
    if (next === 'blur') {
      const placement = placementForFit('contain', width.value || 1, height.value || 1, outputWidth.value, outputHeight.value, composition.value.crop)
      replaceComposition({ ...composition.value, ...placement, background: { ...composition.value.background, mode: 'blur', blur: 100 } })
    } else if (next === 'cover') {
      fitCover()
      return
    } else {
      const placement = placementForFit('contain', width.value || 1, height.value || 1, outputWidth.value, outputHeight.value, composition.value.crop)
      replaceComposition({ ...composition.value, ...placement, background: { ...composition.value.background, mode: 'color' } })
    }
    commitComposition()
  }

  async function loadEncoders() {
    try {
      const catalog = await api.screensaverEncoders()
      encoderOptions.value = catalog.encoders
      autoStill.value = catalog.autoStill
      autoMotion.value = catalog.autoMotion
    } catch {
      encoderOptions.value = []
    }
  }

  async function loadFrameOverlay(): Promise<HTMLImageElement | null> {
    const id = composition.value.frameId
    if (id === 'none') return null
    if (frameImage.value) return frameImage.value
    return loadHtmlImage(frameImageUrl(id))
  }

  function setPreviewRenderer(mode: PreviewRendererMode): void {
    previewRenderer.value = mode
    writePreviewRendererMode(mode)
    if (mode === 'webgl2') {
      try {
        sessionStorage.removeItem('vvr-screensaver-webgl-failed')
      } catch {
        // ignore
      }
    }
  }

  function setPreviewRendererActive(backend: ScreensaverRendererBackend | 'none'): void {
    previewRendererActive.value = backend
  }

  function setPreviewInteracting(active: boolean): void {
    previewInteracting.value = active
    if (active) {
      window.clearTimeout(previewInteractTimer)
      return
    }
    window.clearTimeout(previewInteractTimer)
    previewInteractTimer = window.setTimeout(() => {
      previewInteracting.value = false
    }, 150)
  }

  async function buildExportBlobsForSnapshot(
    snapshot: ScreensaverExportSnapshot,
  ): Promise<{ compositionBlob: Blob | null; frameBlob: Blob | null; maskBlob: Blob | null }> {
    const frame =
      snapshot.frameId !== 'none' ? await loadHtmlImage(frameImageUrl(snapshot.frameId)) : null
    let compositionBlob: Blob | null = null
    if (snapshot.mediaKind === 'image' && snapshot.objectUrl) {
      const image = await loadHtmlImage(snapshot.objectUrl)
      const bitmap = await createImageBitmap(image)
      compositionBlob = await composeExportPng({
        bitmap,
        width: snapshot.outputWidth,
        height: snapshot.outputHeight,
        composition: snapshot.composition,
        frame,
      })
    }
    let frameBlob: Blob | null = null
    if (snapshot.mediaKind === 'video' && snapshot.frameId !== 'none' && isBuiltinFrameId(snapshot.frameId)) {
      const url = resolveBuiltinFrameUrl(snapshot.frameId)
      if (url) {
        const response = await fetch(url)
        if (response.ok) frameBlob = await response.blob()
      }
    }
    return { compositionBlob, frameBlob, maskBlob: null }
  }

  async function startExport() {
    if (exportBlocker.value) return
    if (outputWidth.value >= 3840 && durationSeconds.value >= 2 * 3600) {
      toast('4K exports over two hours can produce very large files and long renders.', 'info')
    }
    const filename = name.value.trim() || 'screensaver'
    const displayName = filename
    const mediaId = serverId.value
    const kind = mediaKind.value
    if (!mediaId || !kind) return

    const snapshot: ScreensaverExportSnapshot = {
      filename,
      mediaId,
      mediaKind: kind,
      objectUrl: objectUrl.value,
      outputWidth: outputWidth.value,
      outputHeight: outputHeight.value,
      composition: cloneComposition(composition.value),
      frameId: composition.value.frameId,
    }
    const animSettings = structuredClone(toRaw(subscribeAnimation.value))
    const projectJson = buildExportProjectJson()
    const snapshotAnimSettings = animSettings
    const snapshotAudioFile = audioMode.value === 'upload' ? audioFile : null

    const capturedProjectId = projectId.value
    if (
      exportQueue.enqueue({
        app: 'screensaver',
        displayName,
        downloadFilename: `${filename}.mp4`,
        projectId: capturedProjectId,
        onTrack: (trackId) => adoptTrack(capturedProjectId, trackId),
        toast,
        onError: (text) => toast(text, 'error'),
        submit: async (signal, onUpdate) => {
          onUpdate({
            phase: 'preparing',
            progress: 0.02,
            message: 'Preparing composition',
            stage: 'Preparing composition',
          })
          const blobs = await buildExportBlobsForSnapshot(snapshot)
          if (signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
          let animationFrameBlobs: Blob[] | null = null
          if (snapshotAnimSettings.enabled && kind === 'image') {
            await preloadSubscribeChannelAvatar(snapshotAnimSettings.channelAvatarUrl)
            animationFrameBlobs = await renderSubscribeAnimationFrames(snapshotAnimSettings, snapshot.outputWidth, (done, total) => {
              onUpdate({
                progress: 0.02 + (done / total) * 0.12,
                message: `Rendering subscribe animation (${done}/${total}).`,
                stage: 'Preparing animation',
              })
            })
            if (signal.aborted) throw new DOMException('The export was cancelled.', 'AbortError')
            const animBytes = animationFrameBlobs.reduce((sum, blob) => sum + blob.size, 0)
            if (animBytes > SUBSCRIBE_ANIMATION_UPLOAD_BUDGET_BYTES) {
              throw new Error('Subscribe animation frames are too large. Lower the size and try again.')
            }
          }
          return submitScreensaverExport({
            ...blobs,
            animationFrameBlobs,
            projectJson,
            audioFile: snapshotAudioFile,
            signal,
            onUpdate,
          })
        },
      })
    ) {
      exportFingerprints.set(capturedProjectId, currentExportFingerprint.value)
    }
  }

  function cancelExport() {
    exportQueue.cancelFrontActive()
  }

  function exportWithCpu() {
    encoder.value = 'cpu'
    void startExport()
  }

  function exportStateFromSaved(render: ScreensaverRenderState): ExportState {
    const base = idleExport()
    if (render.status === 'draft') return base
    const phase =
      render.status === 'queued'
        ? 'queued'
        : render.status === 'rendering'
          ? 'rendering'
          : render.status === 'completed'
            ? 'done'
            : render.status === 'failed'
              ? 'error'
              : 'cancelled'
    return {
      ...base,
      phase,
      progress: render.progress,
      message:
        render.error ||
        (phase === 'done' ? 'Export complete.' : phase === 'error' ? 'Export failed.' : phase === 'cancelled' ? 'Export cancelled.' : 'Rendering…'),
      error: render.status === 'failed' ? render.error : null,
      downloadUrl: render.outputMissing ? null : render.outputUrl,
      jobId: render.jobId,
    }
  }

  async function openProject(id: string): Promise<boolean> {
    consumePendingScreensaverProject(id)
    if (id === projectId.value) {
      if (!projects.value.some((item) => item.id === id)) await persistMeta()
      return true
    }
    if (!projects.value.some((item) => item.id === id)) {
      const saved = await projectLibrary.loadScreensaverProjectRecord(id)
      if (!saved?.id) {
        toast('That screensaver project is no longer available.')
        return false
      }
      const render = (await projectLibrary.loadScreensaverRenderState(id)) ?? draftRender()
      upsertSummary(summaryFrom(saved, render))
    }
    await flushPersist()
    const opened = await loadProjectIntoEditor(id)
    if (!opened) {
      toast('That screensaver project is no longer available.')
      return false
    }
    const summary = projects.value.find((item) => item.id === id)
    if (summary) {
      const next = await refreshRenderRecord(id, summary.render)
      upsertSummary({ ...summary, render: next })
      projectRender.value = next
      void projectLibrary.saveScreensaverRenderState(id, next).catch(() => undefined)
    }
    return true
  }

  async function renameProject(id: string, rawName: string): Promise<void> {
    const nextName = rawName.trim().slice(0, 80)
    if (!nextName) {
      toast('Enter a project name.', 'info')
      return
    }
    if (id === projectId.value) {
      name.value = nextName
      return
    }
    const saved = await projectLibrary.loadScreensaverProjectRecord(id)
    if (!saved?.id) {
      toast('That screensaver project is no longer available.')
      return
    }
    const updated = { ...saved, name: nextName, updatedAt: Date.now() }
    await projectLibrary.saveScreensaverProjectRecord(updated)
    const summary = projects.value.find((item) => item.id === id)
    if (summary) upsertSummary({ ...summary, name: nextName, updatedAt: updated.updatedAt })
  }

  async function duplicateProject(id: string): Promise<void> {
    if (id === projectId.value) await flushPersist()
    const saved = await projectLibrary.loadScreensaverProjectRecord(id)
    if (!saved?.id) {
      toast('That screensaver project is no longer available.')
      return
    }
    const copyId = crypto.randomUUID()
    const now = Date.now()
    const payload: SavedScreensaverProject = {
      ...saved,
      id: copyId,
      name: `Copy of ${saved.name.trim() || 'Screensaver'}`.slice(0, 80),
      createdAt: now,
      updatedAt: now,
    }
    await projectLibrary.saveScreensaverProjectRecord(payload)
    const storedSource = await projectLibrary.loadScreensaverProjectFile(id, 'source')
    if (storedSource) {
      const file = new File([storedSource.blob], storedSource.name, { type: storedSource.type })
      await projectLibrary.saveScreensaverProjectFile(copyId, 'source', file)
      rememberId(sourceIds, copyId)
    }
    const storedAudio = await projectLibrary.loadScreensaverProjectFile(id, 'audio')
    if (storedAudio) {
      const file = new File([storedAudio.blob], storedAudio.name, { type: storedAudio.type })
      await projectLibrary.saveScreensaverProjectFile(copyId, 'audio', file)
      rememberId(audioIds, copyId)
    }
    const render = draftRender()
    await projectLibrary.saveScreensaverRenderState(copyId, render)
    upsertSummary(summaryFrom(payload, render))
    await openProject(copyId)
  }

  async function deleteProject(id: string): Promise<void> {
    const summary = projects.value.find((item) => item.id === id)
    if (summary?.render && isLiveRenderStatus(summary.render.status)) {
      toast('This project is still rendering. Wait until it finishes before deleting it.', 'info')
      return
    }
    await projectLibrary.deleteScreensaverProjectData(id)
    forgetId(sourceIds, id)
    forgetId(audioIds, id)
    forgetUpload(id)
    editStamps.delete(id)
    projects.value = projects.value.filter((item) => item.id !== id)
    exportFingerprints.delete(id)
    if (id !== projectId.value) return
    const next = [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (next) {
      await loadProjectIntoEditor(next.id)
      return
    }
    const now = Date.now()
    applyingProject = true
    detachMedia()
    resetToDefaults()
    projectId.value = crypto.randomUUID()
    createdAt.value = now
    updatedAt.value = now
    projectRender.value = draftRender()
    frameNotice.value = null
    applyingProject = false
    await persistMeta()
    await projectLibrary.saveScreensaverRenderState(projectId.value, projectRender.value).catch(() => undefined)
  }

  async function deleteAllProjects(): Promise<void> {
    const removable = projects.value.filter(
      (item) => (item.mediaKind === 'image' || item.mediaKind === 'video') && !isLiveRenderStatus(item.render.status),
    )
    const keptLive = projects.value.some(
      (item) => (item.mediaKind === 'image' || item.mediaKind === 'video') && isLiveRenderStatus(item.render.status),
    )
    if (removable.length === 0) {
      if (keptLive) toast('Projects that are still rendering were kept.', 'info')
      return
    }
    const removed = new Set(removable.map((item) => item.id))
    for (const item of removable) {
      await projectLibrary.deleteScreensaverProjectData(item.id)
      forgetId(sourceIds, item.id)
      forgetId(audioIds, item.id)
      forgetUpload(item.id)
      editStamps.delete(item.id)
      exportFingerprints.delete(item.id)
    }
    const activeRemoved = removed.has(projectId.value)
    projects.value = projects.value.filter((item) => !removed.has(item.id))
    if (keptLive) toast('Projects that are still rendering were kept.', 'info')
    if (!activeRemoved) return
    const next = [...projects.value]
      .filter((item) => item.mediaKind === 'image' || item.mediaKind === 'video')
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (next) {
      await loadProjectIntoEditor(next.id)
      return
    }
    const now = Date.now()
    applyingProject = true
    detachMedia()
    resetToDefaults()
    projectId.value = crypto.randomUUID()
    createdAt.value = now
    updatedAt.value = now
    projectRender.value = draftRender()
    frameNotice.value = null
    applyingProject = false
    await persistMeta()
    await projectLibrary.saveScreensaverRenderState(projectId.value, projectRender.value).catch(() => undefined)
  }

  async function downloadAllProjectOutputs(): Promise<void> {
    const ready = projectCards.value.filter(
      (item) => item.render.outputUrl && !item.outputMissing && item.render.status === 'completed',
    )
    if (!ready.length) {
      toast('No rendered videos are ready to download.', 'info')
      return
    }
    let count = 0
    for (const item of ready) {
      if (await downloadProjectOutput(item.id)) count++
    }
    if (count > 0) toast(`Downloaded ${count} video${count === 1 ? '' : 's'}.`, 'success')
    else if (ready.length) toast('Could not download any videos.', 'info')
  }

  async function downloadProjectOutput(id: string): Promise<boolean> {
    const summary = projects.value.find((item) => item.id === id)
    const render = id === projectId.value ? projectRender.value : summary?.render
    if (!render?.outputUrl || render.outputMissing) {
      toast('The rendered video is no longer available.')
      return false
    }
    if (render.jobId) {
      try {
        const job = await api.fetchJob(render.jobId)
        if (!job || job.status !== 'done') {
          const missing = { ...render, outputMissing: true }
          if (summary) upsertSummary({ ...summary, render: missing })
          if (id === projectId.value) projectRender.value = missing
          void projectLibrary.saveScreensaverRenderState(id, missing).catch(() => undefined)
          toast('The rendered video is no longer available.')
          return false
        }
      } catch {
        toast('The renderer is offline.', 'info')
        return false
      }
    }
    triggerDownload(render.outputUrl, render.outputFilename || `${summary?.name || name.value || 'screensaver'}.mp4`)
    await markProjectDownloaded(id)
    return true
  }

  async function markProjectDownloaded(id: string): Promise<void> {
    let fingerprint = ''
    if (id === projectId.value) fingerprint = currentExportFingerprint.value
    if (!fingerprint) {
      const saved = await projectLibrary.loadScreensaverProjectRecord(id)
      if (saved?.configFingerprint) fingerprint = saved.configFingerprint
      else if (saved) {
        const stored =
          saved.audioMode === 'upload' ? await projectLibrary.loadScreensaverProjectFile(id, 'audio') : null
        const uploadAudio = stored
          ? new File([stored.blob], stored.name, { type: stored.type || 'audio/mpeg' })
          : null
        fingerprint = fingerprintForSaved(saved, uploadAudio)
      }
    }
    if (!fingerprint) return
    const summary = projects.value.find((item) => item.id === id)
    const renderBase = id === projectId.value ? projectRender.value : summary?.render
    if (!renderBase) return
    const render = { ...renderBase, downloadedFingerprint: fingerprint }
    if (id === projectId.value) projectRender.value = render
    if (summary) upsertSummary({ ...summary, render, configFingerprint: fingerprint })
    void projectLibrary.saveScreensaverRenderState(id, render).catch(() => undefined)
  }

  async function retryProject(id: string): Promise<void> {
    const summary = projects.value.find((item) => item.id === id)
    if (summary && isLiveRenderStatus(summary.render.status)) {
      toast('This project is already rendering.', 'info')
      return
    }
    const opened = await openProject(id)
    if (!opened) return
    if (exportBlocker.value) {
      toast(exportBlocker.value, 'info')
      return
    }
    await startExport()
  }

  function downloadExport() {
    const url = exportState.value.downloadUrl
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${name.value.trim() || 'screensaver'}.mp4`
    anchor.click()
    toast('Download started.', 'info')
    void markProjectDownloaded(projectId.value)
  }

  function getSourceFile(): File | null {
    return sourceFile
  }

  onScreensaverRender((event) => {
    if (!libraryReady) return
    applyRenderEvent(event)
  })

  onScreensaverProjectOpen((id) => {
    if (!libraryReady) return
    void openProject(id)
  })

  return {
    hydrated,
    projectId,
    projects: projectCards,
    activeProjectCard,
    frameNotice,
    name,
    mode,
    mediaKind,
    serverId,
    fileName,
    sourceFileSize,
    width,
    height,
    sourceDuration,
    hasAudio,
    thumbnail,
    objectUrl,
    uploadState,
    uploadProgress,
    uploadError,
    outputWidth,
    outputHeight,
    fps,
    profile,
    encoder,
    renderingMode,
    cfrQuality,
    composition,
    frames,
    frameUploading,
    frameImage,
    compareAdjustments,
    cropEditing,
    previewInteracting,
    setPreviewInteracting,
    previewRenderer,
    previewRendererActive,
    setPreviewRenderer,
    setPreviewRendererActive,
    encoderOptions,
    autoStill,
    autoMotion,
    SCREENSAVER_PROFILES,
    SCREENSAVER_RENDER_MODES,
    SCREENSAVER_CFR_QUALITY_PRESETS,
    SCREENSAVER_CFR_FPS,
    SCREENSAVER_FPS,
    durationSeconds,
    durationPresetKey,
    durationLabel,
    fit,
    loopType,
    crossfadeSeconds,
    audioMode,
    audioVolume,
    audioFadeIn,
    audioFadeOut,
    loopAudio,
    backgroundColor,
    audioUrl,
    audioFileName,
    audioFileSize,
    subscribeAnimation,
    subscribeChannelLookupLoading,
    exportState,
    exporting,
    activeExportCount,
    exportBlocker,
    sizeEstimate,
    DURATION_PRESETS,
    SCREENSAVER_OUTPUTS,
    init,
    newProject,
    addSourceFiles,
    openProject,
    renameProject,
    duplicateProject,
    deleteProject,
    deleteAllProjects,
    downloadProjectOutput,
    downloadAllProjectOutputs,
    retryProject,
    pickSource,
    hasBlockingSource,
    acceptExternalImage,
    removeSource,
    setDurationPreset,
    setCustomDurationMinutes,
    setResolution,
    setProfile,
    setRenderingMode,
    setCfrQuality,
    setFit,
    replaceComposition,
    replaceSubscribeAnimation,
    fetchSubscribeChannelFromUrl,
    commitComposition,
    uploadFrames,
    selectFrame,
    removeFrame,
    undo,
    redo,
    fitContain,
    fitCover,
    centerHorizontal,
    centerVertical,
    resetTransform,
    setCropAspect,
    resetCrop,
    cropRatio,
    resetAdjustments,
    setAudioFile,
    clearAudio,
    startExport,
    cancelExport,
    exportWithCpu,
    downloadExport,
    getSourceFile,
  }
})
