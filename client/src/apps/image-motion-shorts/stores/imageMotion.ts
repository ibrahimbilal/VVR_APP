import {
  MAX_IMAGE_MOTION_SEGMENTS,
  MAX_SEQUENCE_SECONDS,
  defaultImageMotionProject,
  defaultMotionSettings,
  defaultTransitionAfter,
  normalizeImageMotionProject,
  normalizeMotionSettings,
  normalizeTransitionAfter,
  type ImageMotionSegment,
  type ImageMotionSettings,
} from '@shared/imageMotion'
import { timelineDuration } from '@shared/imageMotionTimeline'
import { OUTPUTS, FRAME_RATES } from '@shared/frame'
import { isEncoderChoice } from '@shared/screensaver'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { usePlatformStore } from '../../../stores/platform'
import * as api from '../../../lib/api'
import { DUPLICATE_EXPORT_MESSAGE } from '../../../lib/exportFingerprint'
import { useManagedExportJobs } from '../../../lib/managedExportJobs'
import { triggerDownload } from '../../../lib/triggerDownload'
import * as idb from '../../../lib/idb'
import { readImageFile, validateAudioFile, validateImageFile } from '../../../lib/media'
import { imageMotionExportFingerprint } from '../lib/imageMotionExportFingerprint'
import { submitImageMotionExport } from '../lib/imageMotionExport'

const fileMap = new Map<string, File>()
let musicFile: File | null = null
let metaTimer = 0
const previewUrlMap = new Map<string, string>()
const lastEnqueuedExportFingerprint = ref<string | null>(null)

function blankSegment(fileName: string, width: number, height: number, thumb: string | null): ImageMotionSegment {
  return {
    id: crypto.randomUUID(),
    fileName,
    width,
    height,
    serverId: null,
    duration: defaultMotionSettings().duration,
    motion: defaultMotionSettings(),
    transitionAfter: defaultTransitionAfter(),
  }
}

export const useImageMotionStore = defineStore('image-motion', () => {
  const platform = usePlatformStore()
  const exportQueue = useManagedExportJobs()
  const defaults = defaultImageMotionProject()
  const hydrated = ref(false)
  const name = ref(defaults.name)
  const segments = ref<ImageMotionSegment[]>([])
  const selectedSegmentId = ref<string | null>(null)
  const video = ref({ ...defaults.video })
  const audio = ref({ ...defaults.audio })
  const musicUrl = ref<string | null>(null)
  const musicName = ref<string | null>(null)
  const musicFileSize = ref<number | null>(null)
  const muted = ref(false)
  const encoderOptions = ref<Awaited<ReturnType<typeof api.fetchEncoders>>['encoders']>([])
  const encoderAutoStill = ref<string | null>(null)
  const encoderAutoMotion = ref<string | null>(null)

  const selectedSegment = computed(() => segments.value.find((s) => s.id === selectedSegmentId.value) ?? null)

  const duration = computed(() => timelineDuration(segments.value))

  const exportBlocker = computed((): string | null => {
    if (!platform.serverOnline) return 'The renderer is offline.'
    if (segments.value.length === 0) return 'Add at least one image.'
    if (segments.value.some((s) => !s.serverId || !fileMap.has(s.id))) return 'Wait for every image to finish uploading.'
    if (duration.value > MAX_SEQUENCE_SECONDS) return 'The timeline is longer than 30 minutes.'
    if (duration.value < 0.3) return 'The timeline is too short.'
    return null
  })

  const exportState = computed(() => exportQueue.exportState.value)
  const exporting = computed(() => exportQueue.exporting.value)
  const activeExportCount = computed(() => exportQueue.activeExportCount.value)

  async function init() {
    if (hydrated.value) return
    const saved = await idb.loadImageMotionProject()
    if (saved) {
      name.value = saved.name
      video.value = { ...saved.video }
      audio.value = { ...saved.audio }
      segments.value = saved.segments.map((s) => ({
        ...s,
        motion: normalizeMotionSettings(s.motion),
        transitionAfter: normalizeTransitionAfter(s.transitionAfter),
      }))
      selectedSegmentId.value = saved.selectedSegmentId
      musicName.value = saved.musicName
      for (const segment of segments.value) {
        const stored = await idb.loadImageMotionFile(segment.id)
        if (!stored?.blob) continue
        const file = new File([stored.blob], stored.name, { type: stored.type })
        fileMap.set(segment.id, file)
        previewUrlMap.set(segment.id, URL.createObjectURL(file))
        if (segment.serverId && !(await api.imageMotionMediaExists(segment.serverId))) {
          segment.serverId = null
          void uploadSegment(segment.id)
        }
      }
      const musicStored = await idb.loadImageMotionMusicFile()
      if (musicStored?.blob) {
        musicFile = new File([musicStored.blob], musicStored.name, { type: musicStored.type })
        musicUrl.value = URL.createObjectURL(musicFile)
        musicFileSize.value = musicFile.size
      }
    }
    hydrated.value = true
    void loadEncoders()
    scheduleSave()
  }

  async function loadEncoders() {
    try {
      const catalog = await api.fetchEncoders()
      encoderOptions.value = catalog.encoders
      encoderAutoStill.value = catalog.autoStill
      encoderAutoMotion.value = catalog.autoMotion
    } catch {
      encoderOptions.value = []
    }
  }

  function scheduleSave() {
    if (!hydrated.value) return
    clearTimeout(metaTimer)
    metaTimer = window.setTimeout(() => {
      void idb
        .saveImageMotionProject({
          version: 1,
          name: name.value,
          segments: segments.value,
          video: video.value,
          audio: audio.value,
          selectedSegmentId: selectedSegmentId.value,
          musicName: musicName.value,
        })
        .catch(() => undefined)
    }, 400)
  }

  watch([name, segments, video, audio, selectedSegmentId, musicName], scheduleSave, { deep: true })
  watch(
    () => platform.serverOnline,
    (online) => {
      if (online) void loadEncoders()
    },
  )

  function toast(text: string, tone: 'info' | 'error' | 'success' = 'info') {
    platform.toast(text, tone)
  }

  function objectUrlFor(segmentId: string): string | null {
    return previewUrlMap.get(segmentId) ?? null
  }

  function fileFor(segmentId: string): File | undefined {
    return fileMap.get(segmentId)
  }

  async function addFiles(files: File[]) {
    const room = MAX_IMAGE_MOTION_SEGMENTS - segments.value.length
    if (room <= 0) {
      toast(`You can add up to ${MAX_IMAGE_MOTION_SEGMENTS} images.`)
      return
    }
    for (const file of files.slice(0, room)) {
      const problem = await validateImageFile(file)
      if (problem) {
        toast(problem, 'error')
        continue
      }
      const url = URL.createObjectURL(file)
      const meta = await readImageFile(url)
      if (!meta) {
        URL.revokeObjectURL(url)
        toast(`${file.name} could not be decoded.`, 'error')
        continue
      }
      const segment = blankSegment(file.name, meta.width, meta.height, meta.thumbnail)
      fileMap.set(segment.id, file)
      previewUrlMap.set(segment.id, url)
      segments.value.push(segment)
      selectedSegmentId.value = segment.id
      void idb.saveImageMotionFile(segment.id, file).catch(() => {
        toast('This image will work until you refresh, but it could not be saved locally.', 'info')
      })
      void uploadSegment(segment.id)
    }
    scheduleSave()
  }

  async function uploadSegment(id: string) {
    const file = fileMap.get(id)
    const segment = segments.value.find((s) => s.id === id)
    if (!file || !segment) return
    try {
      const uploaded = await api.uploadImageMotionMedia(file, () => undefined)
      segment.serverId = uploaded.id
      segment.width = uploaded.width
      segment.height = uploaded.height
      scheduleSave()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Image upload failed.', 'error')
    }
  }

  function removeSegment(id: string) {
    const existing = segments.value.find((s) => s.id === id)
    const url = previewUrlMap.get(id)
    if (url) URL.revokeObjectURL(url)
    previewUrlMap.delete(id)
    fileMap.delete(id)
    if (existing?.serverId) void api.deleteClip(existing.serverId).catch(() => undefined)
    segments.value = segments.value.filter((s) => s.id !== id)
    if (selectedSegmentId.value === id) {
      selectedSegmentId.value = segments.value[0]?.id ?? null
    }
    void idb.deleteImageMotionFile(id).catch(() => undefined)
    scheduleSave()
  }

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= segments.value.length || to >= segments.value.length) return
    const list = [...segments.value]
    const [item] = list.splice(from, 1)
    if (!item) return
    list.splice(to, 0, item)
    segments.value = list
    scheduleSave()
  }

  function selectSegment(id: string | null) {
    selectedSegmentId.value = id
  }

  function patchSelectedMotion(patch: Partial<ImageMotionSettings>) {
    const segment = selectedSegment.value
    if (!segment) return
    const mode = patch.mode ?? segment.motion.mode
    segment.motion = normalizeMotionSettings({ ...segment.motion, ...patch, mode })
    if (patch.mode && patch.mode !== mode) {
      segment.motion.easing = patch.mode === 'full' ? 'linear' : 'easeInOut'
    }
    scheduleSave()
  }

  function patchSelectedTransition(patch: Partial<ImageMotionSegment['transitionAfter']>) {
    const segment = selectedSegment.value
    if (!segment) return
    segment.transitionAfter = normalizeTransitionAfter({ ...segment.transitionAfter, ...patch })
    scheduleSave()
  }

  function setSegmentDuration(id: string, seconds: number) {
    const segment = segments.value.find((s) => s.id === id)
    if (!segment) return
    segment.motion.duration = normalizeMotionSettings({ duration: seconds }).duration
    segment.duration = segment.motion.duration
    scheduleSave()
  }

  function resetMotionDefaults() {
    patchSelectedMotion(defaultMotionSettings(selectedSegment.value?.motion.mode ?? 'full'))
  }

  function setResolution(width: number, height: number) {
    if (!OUTPUTS.some((o) => o.width === width && o.height === height)) return
    video.value.width = width
    video.value.height = height
    scheduleSave()
  }

  function setFps(fps: number) {
    if (!FRAME_RATES.includes(fps as (typeof FRAME_RATES)[number])) return
    video.value.fps = fps
    scheduleSave()
  }

  function setEncoder(encoder: string) {
    if (!isEncoderChoice(encoder)) return
    video.value.encoder = encoder
    scheduleSave()
  }

  async function setMusic(file: File | null) {
    if (musicUrl.value) URL.revokeObjectURL(musicUrl.value)
    if (!file) {
      musicFile = null
      musicUrl.value = null
      musicName.value = null
      musicFileSize.value = null
      await idb.clearImageMotionMusicFile().catch(() => undefined)
      scheduleSave()
      return
    }
    const problem = validateAudioFile(file)
    if (problem) {
      toast(problem, 'error')
      return
    }
    musicFile = file
    musicUrl.value = URL.createObjectURL(file)
    musicName.value = file.name
    musicFileSize.value = file.size
    void idb.saveImageMotionMusicFile(file).catch(() => undefined)
    scheduleSave()
  }

  async function newProject() {
    if (segments.value.length > 0 && !window.confirm('Start a new image motion project?')) return
    for (const url of previewUrlMap.values()) URL.revokeObjectURL(url)
    previewUrlMap.clear()
    fileMap.clear()
    if (musicUrl.value) URL.revokeObjectURL(musicUrl.value)
    musicFile = null
    musicUrl.value = null
    musicName.value = null
    musicFileSize.value = null
    const fresh = defaultImageMotionProject()
    name.value = fresh.name
    video.value = { ...fresh.video }
    audio.value = { ...fresh.audio }
    segments.value = []
    selectedSegmentId.value = null
    muted.value = false
    lastEnqueuedExportFingerprint.value = null
    await idb.clearImageMotionProject().catch(() => undefined)
    scheduleSave()
  }

  async function startExport() {
    if (exportBlocker.value) return
    const fingerprint = imageMotionExportFingerprint(
      normalizeImageMotionProject({
        name: name.value,
        segments: segments.value,
        video: video.value,
        audio: audio.value,
      }),
      segments.value,
      musicName.value,
    )
    if (fingerprint === lastEnqueuedExportFingerprint.value) {
      toast(DUPLICATE_EXPORT_MESSAGE, 'info')
      return
    }
    const filename =
      name.value.trim() && name.value !== defaultImageMotionProject().name
        ? name.value.trim()
        : 'image-motion'
    const displayName = filename
    const snapshot = segments.value.map((s) => ({ ...s, motion: { ...s.motion }, transitionAfter: { ...s.transitionAfter } }))
    const project = normalizeImageMotionProject({
      name: name.value,
      segments: snapshot,
      video: video.value,
      audio: audio.value,
    })
    const snapMusic = musicFile
    exportQueue.enqueue({
      app: 'image-motion',
      displayName,
      downloadFilename: `${filename}.mp4`,
      toast,
      onError: (text) => toast(text, 'error'),
      submit: (signal, onUpdate) =>
        submitImageMotionExport({
          filename,
          project,
          segments: snapshot,
          musicFile: snapMusic,
          signal,
          onUpdate,
        }),
    })
    lastEnqueuedExportFingerprint.value = fingerprint
  }

  function downloadExport(url: string, filename: string) {
    triggerDownload(url, filename)
  }

  return {
    hydrated,
    name,
    segments,
    selectedSegmentId,
    selectedSegment,
    video,
    audio,
    musicUrl,
    musicName,
    musicFileSize,
    muted,
    encoderOptions,
    encoderAutoStill,
    encoderAutoMotion,
    duration,
    exportBlocker,
    exportState,
    exporting,
    activeExportCount,
    init,
    addFiles,
    removeSegment,
    reorder,
    selectSegment,
    patchSelectedMotion,
    patchSelectedTransition,
    setSegmentDuration,
    resetMotionDefaults,
    setResolution,
    setFps,
    setEncoder,
    setMusic,
    newProject,
    startExport,
    downloadExport,
    objectUrlFor,
    fileFor,
    toast,
  }
})
