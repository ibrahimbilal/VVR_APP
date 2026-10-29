import { isEncoderChoice } from '@shared/screensaver'
import { frameMetrics } from '@shared/frame'
import { clipDuration, resolveFade, sequenceDuration } from '@shared/timeline'
import { parseVideoUrl } from '@shared/urls'
import { defineStore } from 'pinia'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { usePlatformStore } from './platform'
import { OUTPUTS } from '@shared/frame'
import * as api from '../lib/api'
import { runExport } from '../lib/exportJob'
import { beginTrackedRender, endTrackedRender, syncTrackedRender } from '../lib/renderJobTracking'
import { pageWasReloaded } from '../lib/pageNavigation'
import { notifyRenderReady } from '../lib/renderNotifications'
import { triggerDownload } from '../lib/triggerDownload'
import { ensureServerUploadCleanupOnClose } from '../lib/serverUploadCleanup'
import { formatRank, sourceLabel, titleFromFileName } from '../lib/format'
import * as idb from '../lib/idb'
import { readVideoFile, validateAudioFile, validateVideoFile } from '../lib/media'
import { defaultColorSets, loadColorSets, saveColorSets, type ColorSet } from '../lib/colorSets'
import { playbackOrder } from '../lib/order'
import { RANK_COLORS, createDefaultVideo, materializePreset } from '../lib/presets'
import { retokenize } from '../lib/title'
import type { Clip, ExportState, PersistedClip, PresetId, ProjectStyle, Source, TitleSpan } from '../types'

const initial = materializePreset('classic', createDefaultVideo())
const fileMap = new Map<string, File>()
let musicFile: File | null = null
let applying = false
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
  }
}

function blankClip(partial: Partial<Clip>): Clip {
  return {
    id: crypto.randomUUID(),
    title: 'Untitled clip',
    fileName: '',
    source: 'local',
    sourceUrl: null,
    duration: 0,
    trimStart: 0,
    trimEnd: 0,
    serverId: null,
    objectUrl: null,
    thumbnail: null,
    rankColor: null,
    titleColor: null,
    playAtEnd: false,
    width: 0,
    height: 0,
    hasAudio: true,
    uploadState: 'empty',
    uploadProgress: 0,
    error: null,
    previewBlocked: false,
    ...partial,
  }
}

export const useProjectStore = defineStore('project', () => {
  const platform = usePlatformStore()
  const { serverOnline } = storeToRefs(platform)
  const name = ref('Untitled ranking')
  const titleText = ref(initial.titleText)
  const spans = ref<TitleSpan[]>(initial.spans)
  const style = ref<ProjectStyle>(initial.style)
  const activePreset = ref<PresetId>('classic')
  const clips = ref<Clip[]>([])
  const selectedClipId = ref<string | null>(null)
  const selectedPanelOpen = ref(false)
  const storedColors = loadColorSets()
  const colorSets = ref<ColorSet[]>(storedColors.sets)
  const activeColorSetId = ref(storedColors.activeId)
  const musicUrl = ref<string | null>(null)
  const musicName = ref<string | null>(null)
  const hydrated = ref(false)
  const exportState = ref<ExportState>(idleExport())
  const urlNotice = ref('')
  const encoderOptions = ref<Awaited<ReturnType<typeof api.fetchEncoders>>['encoders']>([])
  const encoderAutoStill = ref<string | null>(null)
  const encoderAutoMotion = ref<string | null>(null)

  const selectedClip = computed(() => clips.value.find((clip) => clip.id === selectedClipId.value) ?? null)
  const activeColorSet = computed(() => colorSets.value.find((set) => set.id === activeColorSetId.value) ?? colorSets.value[0] ?? null)
  const activeColors = computed(() => activeColorSet.value?.colors ?? [])
  const exporting = computed(() =>
    ['overlays', 'uploading', 'queued', 'preparing', 'rendering', 'verifying'].includes(exportState.value.phase),
  )
  const exportBlocker = computed(() => {
    if (!serverOnline.value) return 'The renderer is offline.'
    if (exporting.value) return ''
    if (clips.value.length < 2) return 'Add at least two clips.'
    if (clips.value.some((clip) => clip.uploadState === 'uploading')) return 'Wait for uploads to finish.'
    if (clips.value.some((clip) => clip.uploadState === 'empty')) return 'Upload a video file for each linked clip.'
    if (clips.value.some((clip) => clip.uploadState === 'error')) return 'Retry or remove clips that failed.'
    if (clips.value.some((clip) => clip.trimEnd - clip.trimStart < 0.3)) return 'Each clip must keep at least 0.3 seconds.'
    return ''
  })
  const timeline = computed(() => {
    const ordered = playbackOrder(clips.value)
    const durations = ordered.map((clip) => (clip.objectUrl ? clipDuration(clip) : 0))
    const fade = resolveFade(
      durations.filter((duration) => duration > 0),
      style.value.video.transition,
      style.value.video.fadeDuration,
    )
    const playable = ordered
      .map((clip, index) => ({ clip, index, duration: clip.objectUrl ? clipDuration(clip) : 0 }))
      .filter((item) => item.duration >= 0.05)
    return {
      fade: resolveFade(
        playable.map((item) => item.duration),
        style.value.video.transition,
        style.value.video.fadeDuration,
      ),
      total: sequenceDuration(
        playable.map((item) => item.duration),
        resolveFade(playable.map((item) => item.duration), style.value.video.transition, style.value.video.fadeDuration),
      ),
      unusedFade: fade,
    }
  })

  watch(
    [style, spans],
    () => {
      if (!hydrated.value || applying) return
      if (activePreset.value !== 'custom') activePreset.value = 'custom'
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    [colorSets, activeColorSetId],
    () => {
      saveColorSets(colorSets.value, activeColorSetId.value)
    },
    { deep: true },
  )

  watch(
    [name, titleText, spans, style, clips, activePreset, musicName],
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

  function toast(text: string, tone: 'info' | 'error' | 'success' = 'error') {
    platform.toast(text, tone)
  }

  function invalidateCompletedExport() {
    if (!hydrated.value || exporting.value) return
    if (exportState.value.phase === 'done') exportState.value = idleExport()
  }

  async function loadEncoders() {
    if (!serverOnline.value) return
    try {
      const catalog = await api.fetchEncoders()
      encoderOptions.value = catalog.encoders
      encoderAutoStill.value = catalog.autoStill
      encoderAutoMotion.value = catalog.autoMotion
    } catch {
      encoderOptions.value = []
    }
  }

  async function init() {
    if (hydrated.value) return
    if (pageWasReloaded()) {
      exportAbort?.abort()
      exportAbort = null
      exportState.value = idleExport()
    }
    applying = true
    try {
      const saved = await idb.loadRankingProject()
      await platform.refreshServer()
      void loadEncoders()
      if (saved?.version === 1 && saved.style && saved.spans) {
        name.value = saved.name || 'Untitled ranking'
        titleText.value = saved.titleText || ''
        spans.value = saved.spans
        style.value = saved.style
        if (style.value.ranking.display !== 'page' && style.value.ranking.display !== 'stack') {
          style.value.ranking.display = 'stack'
        }
        if (style.value.ranking.pageStyle !== 'fraction' && style.value.ranking.pageStyle !== 'number') {
          style.value.ranking.pageStyle = 'fraction'
        }
        if (!Number.isFinite(style.value.ranking.itemSpacing)) {
          style.value.ranking.itemSpacing = 8
        }
        normalizeStyle(style.value)
        activePreset.value = saved.activePreset || 'custom'
        musicName.value = saved.musicName
        const music = await idb.loadMusicFile()
        if (music) {
          musicFile = new File([music.blob], music.name, { type: music.type || 'audio/mpeg' })
          musicUrl.value = URL.createObjectURL(musicFile)
          musicName.value = music.name
        }
        for (const meta of saved.clips ?? []) {
          const clip = clipFromMeta(meta)
          const media = await idb.loadClipFile(clip.id)
          if (media) {
            const file = new File([media.blob], media.name, { type: media.type || 'video/mp4' })
            fileMap.set(clip.id, file)
            clip.objectUrl = URL.createObjectURL(file)
            clip.fileName = media.name
            clip.uploadState = 'uploading'
            clips.value.push(clip)
            void resumeUpload(clip)
          } else if (clip.source !== 'local') {
            clip.uploadState = 'empty'
            clips.value.push(clip)
          } else {
            clip.uploadState = 'error'
            clip.error = 'The video file is no longer saved in this browser. Upload it again.'
            clips.value.push(clip)
          }
        }
        let finaleSeen = false
        for (const clip of clips.value) {
          if (clip.playAtEnd && !finaleSeen) finaleSeen = true
          else clip.playAtEnd = false
        }
        selectedClipId.value = clips.value[0]?.id ?? null
      }
    } catch {
      toast('The saved project could not be restored.')
    } finally {
      applying = false
      hydrated.value = true
      ensureServerUploadCleanupOnClose()
    }
  }

  async function refreshServer() {
    await platform.refreshServer()
    if (!serverOnline.value) return
    for (const clip of clips.value) {
      if (clip.uploadState === 'error' && fileMap.has(clip.id)) void upload(clip.id)
    }
  }

  async function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      if (clips.value.length >= 30) {
        toast('You can add up to 30 clips.')
        break
      }
      const problem = validateVideoFile(file)
      if (problem) {
        toast(problem)
        continue
      }
      if (file.size > 250 * 1024 * 1024) toast('Large file. Export may take several minutes.', 'info')
      const clip = blankClip({
        title: titleFromFileName(file.name),
        fileName: file.name,
        source: 'local',
        objectUrl: URL.createObjectURL(file),
        uploadState: 'uploading',
      })
      fileMap.set(clip.id, file)
      clips.value.push(clip)
      selectedClipId.value = clip.id
      void idb.saveClipFile(clip.id, file).catch(() => {
        toast('This browser could not keep a local copy. The clip still works until you refresh.', 'info')
      })
      await applyMetadata(clip.id)
      const saved = clips.value.find((item) => item.id === clip.id)
      if (saved && saved.duration > 20 * 60) {
        saved.uploadState = 'error'
        saved.error = 'Clips must be 20 minutes or shorter.'
        continue
      }
      void upload(clip.id)
    }
  }

  async function attachFile(id: string, file: File) {
    const clip = clips.value.find((item) => item.id === id)
    if (!clip) return
    const problem = validateVideoFile(file)
    if (problem) {
      toast(problem)
      return
    }
    if (clip.objectUrl) URL.revokeObjectURL(clip.objectUrl)
    fileMap.set(clip.id, file)
    clip.fileName = file.name
    clip.objectUrl = URL.createObjectURL(file)
    clip.uploadState = 'uploading'
    clip.error = null
    clip.previewBlocked = false
    clip.uploadProgress = 0
    void idb.saveClipFile(clip.id, file).catch(() => undefined)
    await applyMetadata(clip.id)
    const saved = clips.value.find((item) => item.id === clip.id)
    if (saved && saved.duration > 20 * 60) {
      saved.uploadState = 'error'
      saved.error = 'Clips must be 20 minutes or shorter.'
      return
    }
    await upload(clip.id)
  }

  async function addUrl(raw: string) {
    urlNotice.value = ''
    const parsed = parseVideoUrl(raw)
    if (!parsed.ok) {
      toast(parsed.error)
      return
    }
    if (clips.value.length >= 30) {
      toast('You can add up to 30 clips.')
      return
    }
    try {
      const info = await api.importUrl(parsed.normalizedUrl)
      const clip = blankClip({
        title: info.title || `${sourceLabel(info.platform)} clip`,
        source: info.platform,
        sourceUrl: info.url,
        thumbnail: info.thumbnail,
        uploadState: 'empty',
      })
      clips.value.push(clip)
      selectedClipId.value = clip.id
      urlNotice.value = info.message
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The link could not be checked.')
    }
  }

  async function removeClip(id: string) {
    const clip = clips.value.find((item) => item.id === id)
    if (!clip) return
    if (clip.serverId) {
      const result = await api.deleteClip(clip.serverId)
      if (!result.ok && !result.error.includes('already gone') && !result.error.includes('no longer')) {
        toast(result.error)
        if (result.error.includes('still running')) return
      }
    }
    if (clip.objectUrl) URL.revokeObjectURL(clip.objectUrl)
    fileMap.delete(id)
    clips.value = clips.value.filter((item) => item.id !== id)
    if (selectedClipId.value === id) {
      selectedClipId.value = clips.value[0]?.id ?? null
      if (!selectedClipId.value) selectedPanelOpen.value = false
    }
    void idb.deleteClipFile(id).catch(() => undefined)
  }

  function moveClip(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= clips.value.length || to >= clips.value.length) return
    const next = clips.value.slice()
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    clips.value = next
  }

  function selectClip(id: string) {
    if (!clips.value.some((clip) => clip.id === id)) return
    selectedClipId.value = id
    selectedPanelOpen.value = true
  }

  function closeSelectedPanel() {
    selectedPanelOpen.value = false
  }

  function setTrim(id: string, start: number, end: number) {
    const clip = clips.value.find((item) => item.id === id)
    if (!clip || clip.duration <= 0) return
    let nextStart = clamp(start, 0, clip.duration)
    let nextEnd = clamp(end, 0, clip.duration)
    if (nextEnd - nextStart < 0.3) {
      if (Math.abs(start - clip.trimStart) > Math.abs(end - clip.trimEnd)) nextStart = Math.max(0, nextEnd - 0.3)
      else nextEnd = Math.min(clip.duration, nextStart + 0.3)
    }
    if (nextEnd - nextStart < 0.3) {
      nextStart = 0
      nextEnd = Math.min(clip.duration, Math.max(nextStart + 0.3, clip.duration))
    }
    clip.trimStart = round2(nextStart)
    clip.trimEnd = round2(Math.max(clip.trimStart + 0.3, nextEnd))
    if (clip.trimEnd > clip.duration) clip.trimEnd = round2(clip.duration)
  }

  function setTitleText(value: string) {
    titleText.value = value
    spans.value = retokenize(value, spans.value)
  }

  function setSpanColor(index: number, color: string) {
    const span = spans.value[index]
    if (!span) return
    spans.value[index] = { ...span, color }
    spans.value = spans.value.slice()
  }

  function palette(): string[] {
    return paletteFrom(activeColors.value)
  }

  function applyPreset(id: 'classic' | 'tier' | 'minimal') {
    applying = true
    const next = materializePreset(id, style.value.video)
    style.value = next.style
    titleText.value = next.titleText
    spans.value = next.spans
    activePreset.value = id
    const colors = palette()
    clips.value.forEach((clip, index) => {
      clip.rankColor = next.cycleRanks ? (colors[index % colors.length] ?? null) : null
    })
    applying = false
  }

  function setResolution(width: number, height: number) {
    const allowed = OUTPUTS.find((output) => output.width === width && output.height === height)
    if (!allowed || (style.value.video.width === width && style.value.video.height === height)) return
    const factor = width / style.value.video.width
    const scale = (value: number) => Math.max(0, Math.round(value * factor))
    const outline = (value: number) => (value === 0 ? 0 : Math.max(1, scale(value)))
    applying = true
    style.value.video.width = allowed.width
    style.value.video.height = allowed.height
    style.value.banner.height = Math.max(80, scale(style.value.banner.height))
    style.value.banner.fontSize = Math.max(28, scale(style.value.banner.fontSize))
    style.value.banner.outlineWidth = outline(style.value.banner.outlineWidth)
    style.value.ranking.fontSize = Math.max(36, scale(style.value.ranking.fontSize))
    style.value.ranking.positionX = scale(style.value.ranking.positionX)
    style.value.ranking.positionY = scale(style.value.ranking.positionY)
    style.value.ranking.outlineWidth = outline(style.value.ranking.outlineWidth)
    style.value.caption.fontSize = Math.max(18, scale(style.value.caption.fontSize))
    style.value.caption.bottom = Math.max(16, scale(style.value.caption.bottom))
    style.value.caption.outlineWidth = outline(style.value.caption.outlineWidth)
    applying = false
  }

  function cycleRankColors() {
    const colors = palette()
    clips.value.forEach((clip, index) => {
      clip.rankColor = colors[index % colors.length] ?? '#ffffff'
    })
  }

  function setActiveColorSet(id: string) {
    if (colorSets.value.some((set) => set.id === id)) activeColorSetId.value = id
  }

  function renameColorSet(name: string) {
    const set = colorSets.value.find((item) => item.id === activeColorSetId.value)
    if (!set) return
    set.name = name.slice(0, 40)
  }

  function addColorSet() {
    const id = crypto.randomUUID()
    colorSets.value = [...colorSets.value, { id, name: 'Custom', colors: ['#ffffff', '#ffe14a', '#ff3b3b', '#3ee0ff'] }]
    activeColorSetId.value = id
  }

  function removeColorSet(id: string) {
    if (colorSets.value.length <= 1) return
    colorSets.value = colorSets.value.filter((set) => set.id !== id)
    if (!colorSets.value.some((set) => set.id === activeColorSetId.value)) {
      activeColorSetId.value = colorSets.value[0]?.id ?? 'classic'
    }
  }

  function addPaletteColor(color: string) {
    const set = colorSets.value.find((item) => item.id === activeColorSetId.value)
    if (!set || !/^#[0-9a-fA-F]{6}$/.test(color)) return
    const normalized = color.toLowerCase()
    if (set.colors.some((item) => item.toLowerCase() === normalized)) return
    if (set.colors.length >= 12) {
      toast('A color set can hold 12 colors.')
      return
    }
    set.colors = [...set.colors, normalized]
  }

  function removePaletteColor(color: string) {
    const set = colorSets.value.find((item) => item.id === activeColorSetId.value)
    if (!set || set.colors.length <= 1) return
    set.colors = set.colors.filter((item) => item.toLowerCase() !== color.toLowerCase())
  }

  function resetColorSets() {
    colorSets.value = defaultColorSets()
    activeColorSetId.value = 'classic'
  }

  function setRankColor(id: string, color: string | null) {
    const clip = clips.value.find((item) => item.id === id)
    if (clip) clip.rankColor = color
  }

  function setTitleColor(id: string, color: string | null) {
    const clip = clips.value.find((item) => item.id === id)
    if (clip) clip.titleColor = color
  }

  function setPlayAtEnd(id: string, enabled: boolean) {
    for (const clip of clips.value) clip.playAtEnd = enabled && clip.id === id
  }

  async function setMusic(file: File | null) {
    if (musicUrl.value) URL.revokeObjectURL(musicUrl.value)
    if (!file) {
      musicFile = null
      musicUrl.value = null
      musicName.value = null
      await idb.clearMusicFile().catch(() => undefined)
      return
    }
    const problem = validateAudioFile(file)
    if (problem) {
      toast(problem)
      return
    }
    musicFile = file
    musicUrl.value = URL.createObjectURL(file)
    musicName.value = file.name
    void idb.saveMusicFile(file).catch(() => {
      toast('The music will play until you refresh, but it could not be saved in this browser.', 'info')
    })
  }

  async function newProject() {
    if (clips.value.length > 0 && !window.confirm('Start a new project? The current clips will be removed from the editor.')) return
    cancelExport()
    for (const clip of clips.value) {
      if (clip.objectUrl) URL.revokeObjectURL(clip.objectUrl)
      if (clip.serverId) void api.deleteClip(clip.serverId).catch(() => undefined)
    }
    fileMap.clear()
    if (musicUrl.value) URL.revokeObjectURL(musicUrl.value)
    musicFile = null
    musicUrl.value = null
    musicName.value = null
    const fresh = materializePreset('classic', createDefaultVideo())
    applying = true
    name.value = 'Untitled ranking'
    titleText.value = fresh.titleText
    spans.value = fresh.spans
    style.value = fresh.style
    activePreset.value = 'classic'
    clips.value = []
    selectedClipId.value = null
    selectedPanelOpen.value = false
    exportState.value = idleExport()
    urlNotice.value = ''
    applying = false
    await idb.clearRankingProject().catch(() => undefined)
  }

  function retryUpload(id: string) {
    if (!fileMap.has(id)) {
      toast('Choose the video file again.')
      return
    }
    void upload(id)
  }

  async function startExport() {
    if (exportBlocker.value || exporting.value) return
    const metrics = frameMetrics(
      style.value.video.width,
      style.value.video.height,
      style.value.banner.visible === false ? 0 : style.value.banner.height,
    )
    const durations = playbackOrder(clips.value).map((clip) => clipDuration(clip))
    const total = sequenceDuration(
      durations,
      resolveFade(durations, style.value.video.transition, style.value.video.fadeDuration),
    )
    if (total > 5 * 60) toast('This compilation is long. Rendering may take several minutes.', 'info')
    exportAbort = new AbortController()
    const signal = exportAbort.signal
    const filename = name.value.trim() && name.value !== 'Untitled ranking' ? name.value : titleText.value.replace(/\s+/g, ' ').trim()
    const displayName =
      name.value.trim() && name.value !== 'Untitled ranking'
        ? name.value
        : titleText.value.replace(/\s+/g, ' ').trim() || 'Untitled ranking'
    const trackId = beginTrackedRender('ranking', displayName)
    try {
      await runExport({
        filename: filename || 'ranking',
        clips: clips.value.map((clip) => ({ ...clip })),
        style: {
          ...style.value,
          banner: { ...style.value.banner, height: metrics.bannerHeight },
          video: { ...style.value.video, width: metrics.width, height: metrics.height },
        },
        spans: spans.value.map((span) => ({ ...span })),
        musicFile,
        signal,
        onUpdate: (patch) => {
          exportState.value = { ...exportState.value, ...patch }
          syncTrackedRender(trackId, exportState.value)
        },
      })
      if (exportState.value.phase === 'done' && exportState.value.downloadUrl) {
        notifyRenderReady('ranking', displayName, exportState.value.downloadUrl, downloadName())
      }
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        exportState.value = idleExport()
        toast('Export cancelled.', 'info')
        return
      }
      const text = error instanceof Error ? error.message : 'Export failed.'
      exportState.value = { ...exportState.value, phase: 'error', error: text, message: text }
    } finally {
      endTrackedRender(trackId)
    }
  }

  function cancelExport() {
    exportAbort?.abort()
  }

  function downloadExport() {
    const url = exportState.value.downloadUrl
    if (exportState.value.phase !== 'done' || !url) return
    triggerDownload(url, downloadName())
    toast('Download started.', 'info')
  }

  function downloadName(): string {
    const fromJob = exportState.value.jobId ? '' : ''
    void fromJob
    const base = name.value.trim() && name.value !== 'Untitled ranking' ? name.value : titleText.value.replace(/\s+/g, ' ').trim()
    return `${base || 'ranking'}.mp4`
  }

  async function upload(id: string) {
    const clip = clips.value.find((item) => item.id === id)
    const file = fileMap.get(id)
    if (!clip || !file) return
    if (!serverOnline.value) await platform.refreshServer()
    if (!serverOnline.value) {
      clip.uploadState = 'error'
      clip.error = 'The renderer is offline, so this clip is not uploaded yet.'
      return
    }
    const previousServerId = clip.serverId
    clip.uploadState = 'uploading'
    clip.error = null
    clip.uploadProgress = 0
    try {
      const result = await api.uploadClip(file, (fraction) => {
        clip.uploadProgress = fraction
      })
      const previousDuration = clip.duration
      const userTrimmed = clip.trimStart > 0.01 || (previousDuration > 0 && Math.abs(clip.trimEnd - previousDuration) > 0.05)
      clip.serverId = result.id
      clip.duration = result.duration
      clip.width = result.width
      clip.height = result.height
      clip.hasAudio = result.hasAudio
      if (!userTrimmed || clip.trimEnd <= 0) {
        clip.trimStart = 0
        clip.trimEnd = result.duration
      } else {
        clip.trimStart = clamp(clip.trimStart, 0, Math.max(0, result.duration - 0.3))
        clip.trimEnd = clamp(clip.trimEnd, clip.trimStart + 0.3, result.duration)
      }
      clip.uploadState = 'ready'
      clip.uploadProgress = 1
      if (previousServerId && previousServerId !== result.id) void api.deleteClip(previousServerId).catch(() => undefined)
    } catch (error) {
      clip.uploadState = 'error'
      clip.error = error instanceof Error ? error.message : 'Upload failed.'
    }
  }

  async function resumeUpload(clip: Clip) {
    if (!serverOnline.value) {
      clip.uploadState = 'error'
      clip.error = 'Saved on this computer. The renderer is offline, so this clip is not uploaded yet.'
      return
    }
    if (clip.serverId && (await api.clipExists(clip.serverId).catch(() => false))) {
      clip.uploadState = 'ready'
      clip.uploadProgress = 1
      return
    }
    clip.serverId = null
    await upload(clip.id)
  }

  async function applyMetadata(id: string) {
    const clip = clips.value.find((item) => item.id === id)
    if (!clip?.objectUrl) return
    const meta = await readVideoFile(clip.objectUrl)
    if (!meta) return
    clip.duration = meta.duration
    clip.width = meta.width
    clip.height = meta.height
    clip.trimStart = 0
    clip.trimEnd = meta.duration
    if (meta.thumbnail) clip.thumbnail = meta.thumbnail
  }

  async function persistMeta() {
    const payload = {
      version: 1 as const,
      name: name.value,
      titleText: titleText.value,
      spans: spans.value,
      style: style.value,
      activePreset: activePreset.value,
      musicName: musicName.value,
      clips: clips.value.map(persistableClip),
    }
    await idb.saveRankingProject(payload).catch(() => undefined)
  }

  return {
    name,
    titleText,
    spans,
    style,
    activePreset,
    clips,
    selectedClipId,
    selectedClip,
    selectedPanelOpen,
    colorSets,
    activeColorSetId,
    activeColorSet,
    activeColors,
    musicUrl,
    musicName,
    serverOnline,
    hydrated,
    exportState,
    exporting,
    exportBlocker,
    encoderOptions,
    encoderAutoStill,
    encoderAutoMotion,
    loadEncoders,
    timeline,
    urlNotice,
    init,
    refreshServer,
    addFiles,
    attachFile,
    addUrl,
    removeClip,
    moveClip,
    selectClip,
    closeSelectedPanel,
    setTrim,
    setTitleText,
    setSpanColor,
    applyPreset,
    setResolution,
    cycleRankColors,
    setActiveColorSet,
    renameColorSet,
    addColorSet,
    removeColorSet,
    addPaletteColor,
    removePaletteColor,
    resetColorSets,
    setRankColor,
    setTitleColor,
    setPlayAtEnd,
    setMusic,
    newProject,
    retryUpload,
    startExport,
    cancelExport,
    downloadExport,
    downloadName,
    toast,
    formatRank,
  }
})

function clipFromMeta(meta: PersistedClip): Clip {
  return blankClip({
    id: meta.id,
    title: meta.title,
    fileName: meta.fileName,
    source: meta.source as Source,
    sourceUrl: meta.sourceUrl,
    duration: meta.duration,
    trimStart: meta.trimStart,
    trimEnd: meta.trimEnd,
    serverId: meta.serverId,
    thumbnail: meta.thumbnail,
    rankColor: meta.rankColor,
    titleColor: meta.titleColor ?? null,
    playAtEnd: meta.playAtEnd === true,
    width: meta.width,
    height: meta.height,
    hasAudio: meta.hasAudio,
    uploadState: 'empty',
  })
}

function persistableClip(clip: Clip): PersistedClip {
  return {
    id: clip.id,
    title: clip.title,
    fileName: clip.fileName,
    source: clip.source,
    sourceUrl: clip.sourceUrl,
    duration: clip.duration,
    trimStart: clip.trimStart,
    trimEnd: clip.trimEnd,
    serverId: clip.serverId,
    thumbnail: clip.thumbnail,
    rankColor: clip.rankColor,
    titleColor: clip.titleColor,
    playAtEnd: clip.playAtEnd === true,
    width: clip.width,
    height: clip.height,
    hasAudio: clip.hasAudio,
  }
}

function normalizeStyle(value: ProjectStyle) {
  value.banner.visible = value.banner.visible !== false
  if (!isEncoderChoice(value.video.encoder)) value.video.encoder = 'auto'
  if (!Number.isFinite(value.video.musicFadeIn)) value.video.musicFadeIn = 0.25
  if (!Number.isFinite(value.video.musicFadeOut)) value.video.musicFadeOut = 0.3
  value.video.musicFadeIn = Math.max(0, Math.min(30, value.video.musicFadeIn))
  value.video.musicFadeOut = Math.max(0, Math.min(30, value.video.musicFadeOut))
  value.ranking.showPreviousTitles = value.ranking.showPreviousTitles === true
  if (value.ranking.sort !== 'reverse' && value.ranking.sort !== 'title' && value.ranking.sort !== 'titleDesc') {
    value.ranking.sort = 'list'
  }
}

function paletteFrom(colors: string[]): string[] {
  return colors.length > 0 ? colors : RANK_COLORS
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
