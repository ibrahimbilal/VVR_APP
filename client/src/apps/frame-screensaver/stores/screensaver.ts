import { aspectRatio, clampComposition, compositionForFit, cropForAspect, defaultComposition, placementForFit, type CropAspect, type ScreensaverComposition } from '@shared/screensaverComposition'
import { FRAME_FILE_LIMIT } from '@shared/screensaverFrames'
import {
  DEFAULT_DURATION_SECONDS,
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
import { defineStore } from 'pinia'
import { storeToRefs } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'
import * as api from '../../../lib/api'
import * as idb from '../../../lib/idb'
import { readImageFile, readVideoFile, validateAudioFile, validateImageFile, validateScreensaverVideoFile } from '../../../lib/media'
import { usePlatformStore } from '../../../stores/platform'
import type { ExportState } from '../../../types'
import { bakePlacement, canvasToPng, paintComposition } from '../lib/composeCanvas'
import { ensureServerUploadCleanupOnClose } from '../../../lib/serverUploadCleanup'
import { runScreensaverExport } from '../lib/screensaverExport'
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
let exportAbort: AbortController | null = null
let metaTimer = 0

function idleExport(): ExportState {
  return {
    phase: 'idle',
    progress: 0,
    message: '',
    error: null,
    warning: null,
    downloadUrl: null,
    bytes: null,
    jobId: null,
    encoder: null,
    hardware: null,
    encodeFps: null,
    encodeSpeed: null,
    elapsedSec: null,
    etaSec: null,
    stage: null,
  }
}

function defaultProject(): Omit<SavedScreensaverProject, 'version'> {
  const output = SCREENSAVER_OUTPUTS[0]
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
    durationPresetKey: '3600',
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

  const hydrated = ref(false)
  const name = ref(defaultProject().name)
  const mode = ref<ScreensaverMode>('static')
  const mediaKind = ref<'image' | 'video' | null>(null)
  const serverId = ref<string | null>(null)
  const fileName = ref('')
  const width = ref(0)
  const height = ref(0)
  const sourceDuration = ref<number | null>(null)
  const hasAudio = ref(false)
  const thumbnail = ref<string | null>(null)
  const objectUrl = ref<string | null>(null)
  const uploadState = ref<'empty' | 'uploading' | 'ready' | 'error'>('empty')
  const uploadProgress = ref(0)
  const uploadError = ref<string | null>(null)

  const outputWidth = ref<number>(SCREENSAVER_OUTPUTS[0].width)
  const outputHeight = ref<number>(SCREENSAVER_OUTPUTS[0].height)
  const fps = ref(1)
  const profile = ref<ScreensaverProfile>('static-fast')
  const encoder = ref<EncoderChoice>('auto')
  const composition = ref<ScreensaverComposition>(defaultComposition())
  const frames = ref<api.ScreensaverFrame[]>([])
  const framesLoaded = ref(false)
  const frameUploading = ref(false)
  const frameImage = ref<HTMLImageElement | null>(null)
  let frameImageToken = 0
  const compareAdjustments = ref(false)
  const cropEditing = ref(false)
  const encoderOptions = ref<Awaited<ReturnType<typeof api.screensaverEncoders>>['encoders']>([])
  const autoStill = ref<string | null>(null)
  const autoMotion = ref<string | null>(null)
  const history = ref<ScreensaverComposition[]>([defaultComposition()])
  const historyIndex = ref(0)
  const durationSeconds = ref(DEFAULT_DURATION_SECONDS)
  const durationPresetKey = ref('3600')
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

  const exportState = ref<ExportState>(idleExport())

  const exporting = computed(() =>
    ['uploading', 'queued', 'preparing', 'rendering', 'verifying'].includes(exportState.value.phase),
  )

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

  const exportBlocker = computed(() => {
    if (!serverOnline.value) return 'The renderer is offline.'
    if (exporting.value) return ''
    if (uploadState.value !== 'ready' || !serverId.value) return 'Upload an image or video first.'
    if (mode.value === 'loop' && mediaKind.value !== 'video') return 'Looping mode needs a video source.'
    if (mode.value === 'static' && mediaKind.value !== 'image') return 'Static art mode needs an image source.'
    if (durationSeconds.value < MIN_DURATION_SECONDS || durationSeconds.value > MAX_DURATION_SECONDS) {
      return `Duration must be between ${formatDurationLabel(MIN_DURATION_SECONDS)} and ${formatDurationLabel(MAX_DURATION_SECONDS)}.`
    }
    if (audioMode.value === 'upload' && !audioFile) return 'Upload background audio or choose another audio option.'
    if (audioMode.value === 'source' && !hasAudio.value) return 'This video has no audio. Choose another audio option.'
    if (
      composition.value.frameId !== 'none' &&
      framesLoaded.value &&
      !frames.value.some((frame) => frame.id === composition.value.frameId)
    ) {
      return 'That frame is no longer on the server. Choose another frame.'
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

  function toast(text: string, tone: 'info' | 'error' = 'error') {
    platform.toast(text, tone)
  }

  function invalidateCompletedExport() {
    if (!hydrated.value || exporting.value) return
    if (exportState.value.phase === 'done') exportState.value = idleExport()
  }

  async function init() {
    if (hydrated.value) return
    await platform.refreshServer()
    void loadEncoders()
    try {
      const saved = await idb.loadScreensaverProject<SavedScreensaverProject>()
      if (saved && (saved.version === 1 || saved.version === 2)) {
        applySaved(saved)
        const stored = await idb.loadScreensaverSource()
        if (stored) {
          sourceFile = new File([stored.blob], stored.name, { type: stored.type })
          objectUrl.value = URL.createObjectURL(sourceFile)
          fileName.value = stored.name
          uploadState.value = 'uploading'
          void resumeUpload()
        }
        const audio = await idb.loadScreensaverAudio()
        if (audio) {
          audioFile = new File([audio.blob], audio.name, { type: audio.type || 'audio/mpeg' })
          audioUrl.value = URL.createObjectURL(audioFile)
          audioFileName.value = audio.name
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
      if (composition.value.frameId !== 'none' && !saved.some((frame) => frame.id === composition.value.frameId)) {
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
      const image = await loadHtmlImage(api.screensaverFrameUrl(id))
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
    encoder.value = isEncoderChoice(saved.encoder) ? saved.encoder : 'auto'
    composition.value =
      saved.version === 2 && saved.composition
        ? clampComposition(saved.composition)
        : compositionForFit(saved.fit, saved.width, saved.height, saved.outputWidth, saved.outputHeight, saved.backgroundColor)
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
    width.value = 0
    height.value = 0
    sourceDuration.value = null
    hasAudio.value = false
    thumbnail.value = null
    uploadState.value = 'empty'
    void idb.clearScreensaverSource().catch(() => undefined)
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

  async function setAudioFile(file: File) {
    const problem = validateAudioFile(file)
    if (problem) {
      toast(problem)
      return
    }
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
    audioFile = file
    audioUrl.value = URL.createObjectURL(file)
    audioFileName.value = file.name
    audioMode.value = 'upload'
    void idb.saveScreensaverAudio(file).catch(() => {
      toast('Audio will work until refresh but could not be saved locally.', 'info')
    })
  }

  function clearAudio() {
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
    audioFile = null
    audioUrl.value = null
    audioFileName.value = null
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
    return loadHtmlImage(api.screensaverFrameUrl(id))
  }

  async function buildExportBlobs(): Promise<{ compositionBlob: Blob | null; frameBlob: Blob | null; maskBlob: Blob | null }> {
    const frame = await loadFrameOverlay()
    let compositionBlob: Blob | null = null
    if (mediaKind.value === 'image' && objectUrl.value) {
      const image = await loadHtmlImage(objectUrl.value)
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth.value
      canvas.height = outputHeight.value
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not prepare the composition.')
      const baked = bakePlacement(image, image.naturalWidth, image.naturalHeight, composition.value, canvas.width, canvas.height, false)
      paintComposition(ctx, baked, image, image.naturalWidth, image.naturalHeight, composition.value, { flatten: true, checker: false, frame })
      compositionBlob = await canvasToPng(canvas)
    }
    return { compositionBlob, frameBlob: null, maskBlob: null }
  }

  async function startExport() {
    if (exportBlocker.value || exporting.value) return
    if (outputWidth.value >= 3840 && durationSeconds.value >= 2 * 3600) {
      toast('4K exports over two hours can produce very large files and long renders.', 'info')
    }
    exportAbort = new AbortController()
    const signal = exportAbort.signal
    const filename = name.value.trim() || 'screensaver'
    try {
      exportState.value = { ...idleExport(), phase: 'preparing', progress: 0.02, message: 'Preparing composition', stage: 'Preparing composition' }
      const blobs = await buildExportBlobs()
      if (signal.aborted) return
      await runScreensaverExport({
        ...blobs,
        projectJson: {
          filename,
          mediaId: serverId.value,
          kind: mediaKind.value,
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
        },
        audioFile: audioMode.value === 'upload' ? audioFile : null,
        signal,
        onUpdate: (patch) => {
          exportState.value = { ...exportState.value, ...patch }
        },
      })
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        exportState.value = idleExport()
        toast('Export cancelled.', 'info')
        return
      }
      const text = error instanceof Error ? error.message : 'Export failed.'
      exportState.value = { ...exportState.value, phase: 'error', error: text, message: text }
    }
  }

  function cancelExport() {
    exportAbort?.abort()
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
    exportState,
    exporting,
    exportBlocker,
    sizeEstimate,
    DURATION_PRESETS,
    SCREENSAVER_OUTPUTS,
    init,
    pickSource,
    removeSource,
    setDurationPreset,
    setCustomDurationMinutes,
    setResolution,
    setProfile,
    setFit,
    replaceComposition,
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
