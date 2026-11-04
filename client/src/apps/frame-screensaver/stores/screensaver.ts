import { aspectRatio, clampComposition, compositionForFit, cropForAspect, defaultComposition, placementForFit, type CropAspect, type ScreensaverComposition } from '@shared/screensaverComposition'
import { FRAME_FILE_LIMIT, isBuiltinFrameId } from '@shared/screensaverFrames'
import {
  DEFAULT_DURATION_PRESET_KEY,
  DEFAULT_DURATION_SECONDS,
  DEFAULT_SCREENSAVER_OUTPUT,
  DURATION_PRESETS,
  estimateOutputBytes,
  formatDurationLabel,
  isEncoderChoice,
  isScreensaverProfile,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  profileFps,
  SCREENSAVER_OUTPUTS,
  SCREENSAVER_PROFILES,
  type EncoderChoice,
  type ScreensaverAudioMode,
  type ScreensaverFit,
  type ScreensaverLoop,
  type ScreensaverMode,
  type ScreensaverProfile,
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
import { readImageFile, readVideoFile, validateAudioFile, validateImageFile, validateScreensaverVideoFile } from '../../../lib/media'
import { useManagedExportJobs } from '../../../lib/managedExportJobs'
import { pageWasReloaded } from '../../../lib/pageNavigation'
import { usePlatformStore } from '../../../stores/platform'
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
import { preloadSubscribeChannelAvatar } from '../lib/subscribeAnimation/subscribeAnimationChannelAvatar'
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
    fps: 1,
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
  }
}

function cloneComposition(value: ScreensaverComposition): ScreensaverComposition {
  return structuredClone(toRaw(value))
}

export const useScreensaverStore = defineStore('screensaver', () => {
  const platform = usePlatformStore()
  const { serverOnline } = storeToRefs(platform)
  const exportQueue = useManagedExportJobs()
  const lastEnqueuedExportFingerprint = ref<string | null>(null)

  const hydrated = ref(false)
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

  const outputWidth = ref<number>(DEFAULT_SCREENSAVER_OUTPUT.width)
  const outputHeight = ref<number>(DEFAULT_SCREENSAVER_OUTPUT.height)
  const fps = ref(1)
  const profile = ref<ScreensaverProfile>('static-fast')
  const encoder = ref<EncoderChoice>('cpu')
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

  const exportState = exportQueue.exportState
  const exporting = exportQueue.exporting
  const activeExportCount = exportQueue.activeExportCount

  const durationLabel = computed(() => formatDurationLabel(durationSeconds.value))

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
    if (
      lastEnqueuedExportFingerprint.value !== null &&
      currentExportFingerprint.value !== '' &&
      currentExportFingerprint.value === lastEnqueuedExportFingerprint.value
    ) {
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
      composition,
      subscribeAnimation,
    ],
    () => {
      if (!hydrated.value) return
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
    if (exportState.value.phase === 'done') exportQueue.clearFinished()
  }

  function resetPreviewAfterReload() {
    clearSourceUrls()
    sourceFile = null
    serverId.value = null
    fileName.value = ''
    sourceFileSize.value = null
    mediaKind.value = null
    width.value = 0
    height.value = 0
    thumbnail.value = null
    sourceDuration.value = null
    hasAudio.value = false
    uploadState.value = 'empty'
    uploadProgress.value = 0
    uploadError.value = null
    frameImage.value = null
    if (composition.value.frameId !== 'none') {
      replaceComposition({ ...composition.value, frameId: 'none' })
      commitComposition()
    }
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
    audioFile = null
    audioUrl.value = null
    audioFileName.value = null
    audioFileSize.value = null
    audioMode.value = 'none'
  }

  async function init() {
    if (hydrated.value) return
    const reload = pageWasReloaded()
    if (reload) {
      exportQueue.cancelAll()
      exportQueue.clearFinished()
    }
    await platform.refreshServer()
    void loadEncoders()
    if (reload) {
      await idb.clearScreensaverPreviewCache().catch(() => undefined)
    }
    try {
      const saved = await idb.loadScreensaverProject<SavedScreensaverProject>()
      if (saved && (saved.version === 1 || saved.version === 2)) {
        applySaved(saved)
        if (reload) {
          resetPreviewAfterReload()
          void persistMeta()
        } else {
          const stored = await idb.loadScreensaverSource()
          if (stored) {
            sourceFile = new File([stored.blob], stored.name, { type: stored.type })
            objectUrl.value = URL.createObjectURL(sourceFile)
            fileName.value = stored.name
            sourceFileSize.value = sourceFile.size
            uploadState.value = 'uploading'
            void resumeUpload()
          }
          await restoreBackgroundAudio()
        }
      }
    } catch {
      toast('The saved screensaver project could not be restored.')
    } finally {
      hydrated.value = true
      ensureServerUploadCleanupOnClose()
      void loadFrames()
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
        replaceComposition({ ...composition.value, frameId: 'none' })
        commitComposition()
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
    composition.value =
      saved.version === 2 && saved.composition
        ? clampComposition(saved.composition)
        : compositionForFit(saved.fit, saved.width, saved.height, saved.outputWidth, saved.outputHeight, saved.backgroundColor)
    subscribeAnimation.value = defaultSubscribeAnimation()
    history.value = [cloneComposition(composition.value)]
    historyIndex.value = 0
    uploadState.value = saved.serverId ? 'uploading' : saved.mediaKind ? 'error' : 'empty'
  }

  async function persistMeta() {
    const payload: SavedScreensaverProject = {
      version: 2,
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
      composition: cloneComposition(composition.value),
    }
    await idb.saveScreensaverProject(payload).catch(() => undefined)
  }

  async function pickSource(file: File) {
    const videoErr = validateScreensaverVideoFile(file)
    const imageErr = await validateImageFile(file)
    let kind: 'image' | 'video'
    if (!videoErr) kind = 'video'
    else if (!imageErr) kind = 'image'
    else {
      toast(videoErr || imageErr || 'This file type is not supported.')
      return
    }

    clearSourceUrls()
    sourceFile = file
    fileName.value = file.name
    sourceFileSize.value = file.size
    mediaKind.value = kind
    mode.value = kind === 'image' ? 'static' : 'loop'
    if (kind === 'image') {
      profile.value = 'static-fast'
      fps.value = 1
    } else {
      profile.value = 'animated'
      fps.value = 30
    }
    objectUrl.value = URL.createObjectURL(file)
    uploadState.value = 'uploading'
    uploadProgress.value = 0
    uploadError.value = null
    serverId.value = null
    void idb.saveScreensaverSource(file).catch(() => {
      toast('Could not save a local copy of this file.', 'info')
    })
    if (kind === 'image') {
      const meta = await readImageFile(objectUrl.value)
      if (meta) {
        width.value = meta.width
        height.value = meta.height
        thumbnail.value = meta.thumbnail
        sourceDuration.value = null
        hasAudio.value = false
        placeForSource()
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
      }
    }
    void uploadSource()
  }

  async function hasBlockingSource(): Promise<boolean> {
    if (hydrated.value) return mediaKind.value === 'image' || mediaKind.value === 'video'
    const stored = await idb.loadScreensaverSource()
    if (stored?.blob) return true
    const saved = await idb.loadScreensaverProject<SavedScreensaverProject>()
    return saved?.mediaKind === 'image' || saved?.mediaKind === 'video'
  }

  async function acceptExternalImage(file: File): Promise<void> {
    if (!hydrated.value) await init()
    await pickSource(file)
  }

  async function uploadSource() {
    if (!sourceFile) return
    uploadState.value = 'uploading'
    try {
      if (!serverOnline.value) await platform.refreshServer()
      if (!serverOnline.value) throw new Error('The renderer is offline.')
      const result = await api.uploadScreensaverMedia(sourceFile, (fraction) => {
        uploadProgress.value = fraction
      })
      serverId.value = result.id
      mediaKind.value = result.kind
      width.value = result.width
      height.value = result.height
      sourceDuration.value = result.duration
      hasAudio.value = result.hasAudio
      uploadState.value = 'ready'
      uploadProgress.value = 1
    } catch (error) {
      uploadState.value = 'error'
      uploadError.value = error instanceof Error ? error.message : 'Upload failed.'
      toast(uploadError.value)
    }
  }

  async function resumeUpload() {
    if (!sourceFile) {
      uploadState.value = 'error'
      return
    }
    if (serverId.value && (await api.clipExists(serverId.value))) {
      uploadState.value = 'ready'
      uploadProgress.value = 1
      return
    }
    serverId.value = null
    await uploadSource()
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
    void idb.clearScreensaverSource().catch(() => undefined)
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
    profile.value = 'static-fast'
    encoder.value = 'cpu'
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

  async function newProject(): Promise<void> {
    const hasWork = mediaKind.value !== null || audioFileName.value !== null
    if (hasWork && !window.confirm('Start a new project? The current source and settings will be cleared.')) return
    removeSource()
    clearAudio()
    resetToDefaults()
    lastEnqueuedExportFingerprint.value = null
    await idb.clearScreensaverProject().catch(() => undefined)
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

  async function restoreBackgroundAudio(): Promise<void> {
    const wantsUpload = audioMode.value === 'upload' || Boolean(audioFileName.value)
    const audio = await idb.loadScreensaverAudio()
    if (audio && wantsUpload) {
      clearBackgroundAudioInMemory()
      audioFile = new File([audio.blob], audio.name, { type: audio.type || 'audio/mpeg' })
      audioUrl.value = URL.createObjectURL(audioFile)
      audioFileName.value = audio.name
      audioFileSize.value = audioFile.size
      audioMode.value = 'upload'
      return
    }
    if (audio && !wantsUpload) {
      void idb.clearScreensaverAudio().catch(() => undefined)
    }
    clearBackgroundAudioInMemory()
    if (audioMode.value === 'upload') audioMode.value = 'none'
  }

  async function setAudioFile(file: File) {
    const problem = validateAudioFile(file)
    if (problem) {
      toast(problem)
      return
    }
    try {
      await idb.saveScreensaverAudio(file)
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
    void idb.clearScreensaverAudio().catch(() => undefined)
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
      replaceSubscribeAnimation({
        channelUrl: result.channelUrl ?? target,
        channelName: result.channelName ?? subscribeAnimation.value.channelName,
        channelAvatarUrl: result.avatarUrl,
        channelSubscriberCount: result.subscriberCount,
      })
      await preloadSubscribeChannelAvatar(result.avatarUrl)
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
    fps.value = profileFps(next)
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

    if (
      exportQueue.enqueue({
        app: 'screensaver',
        displayName,
        downloadFilename: `${filename}.mp4`,
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
      lastEnqueuedExportFingerprint.value = currentExportFingerprint.value
    }
  }

  function cancelExport() {
    exportQueue.cancelFrontActive()
  }

  function exportWithCpu() {
    encoder.value = 'cpu'
    void startExport()
  }

  function downloadExport() {
    const url = exportState.value.downloadUrl
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${name.value.trim() || 'screensaver'}.mp4`
    anchor.click()
    toast('Download started.', 'info')
  }

  return {
    hydrated,
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
    pickSource,
    hasBlockingSource,
    acceptExternalImage,
    removeSource,
    setDurationPreset,
    setCustomDurationMinutes,
    setResolution,
    setProfile,
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
  }
})
