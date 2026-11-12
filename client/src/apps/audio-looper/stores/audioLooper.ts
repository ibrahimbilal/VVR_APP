import {
  alignExportTrims,
  AUDIO_LOOPER_DURATION_PRESETS,
  audioLooperDownloadName,
  DEFAULT_PLAYLIST_CROSSFADE_SECONDS,
  defaultAudioLooperSettings,
  estimateOutputBytes,
  formatDurationLabel,
  MAX_AUDIO_LOOPER_TRACKS,
  maxCrossfadeForSource,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  MIN_TRIM_SECONDS,
  normalizeSettings,
  repeatCount,
  SEAMLESS_AVAILABLE,
  type AudioLooperBitrate,
  type AudioLooperExportTrack,
  type AudioLooperFormat,
  type AudioLooperLoopMode,
  type AudioLooperSettings,
} from '@shared/audioLooper'
import { assertPlaylistTimeline, playlistCrossfadeLimit, playlistPeriod, playlistRepeats } from '@shared/audioLooperPlaylist'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { audioFormatLabel } from '../../../lib/media'
import { formatBytes, formatClock } from '../../../lib/format'
import { DUPLICATE_EXPORT_MESSAGE, stableExportFingerprint } from '../../../lib/exportFingerprint'
import { useManagedExportJobs } from '../../../lib/managedExportJobs'
import { usePlatformStore } from '../../../stores/platform'
import { requestAudioLooperPreview, submitAudioLooperExport } from '../lib/audioLooperExport'
import { validateLooperAudioFile } from '../lib/validateLooperAudio'
import { peaksFromAudioFile, type WaveformMeta } from '../lib/waveform'

const SETTINGS_KEY = 'vf-audio-looper-settings'

type PersistedLooperSettings = {
  name: string
  settings: AudioLooperSettings
}

export type LooperTrackStatus = 'reading' | 'ready' | 'error'

export interface LooperTrack {
  id: string
  file: File
  fileName: string
  fileSize: number
  objectUrl: string
  duration: number | null
  channels: number | null
  sampleRate: number | null
  waveform: WaveformMeta | null
  trimStart: number
  trimEnd: number | null
  error: string | null
  status: LooperTrackStatus
}

function loadPersisted(): PersistedLooperSettings {
  const fallback = { name: 'Untitled loop', settings: defaultAudioLooperSettings() }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as PersistedLooperSettings
    if (!parsed || typeof parsed !== 'object') return fallback
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 80) : fallback.name
    return { name, settings: normalizeSettings({ ...fallback.settings, ...parsed.settings }) }
  } catch {
    return fallback
  }
}

function shuffleIds(ids: string[]): string[] {
  const next = ids.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    next[index] = next[swap] ?? ''
    next[swap] = current ?? ''
  }
  return next
}

function durationFromElement(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio()
    const timer = window.setTimeout(() => {
      finish(null)
    }, 8000)
    const finish = (value: number | null) => {
      window.clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
      resolve(value)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const value = audio.duration
      finish(Number.isFinite(value) && value > 0 ? value : null)
    }
    audio.onerror = () => finish(null)
    audio.src = url
  })
}

export const useAudioLooperStore = defineStore('audio-looper', () => {
  const platform = usePlatformStore()
  const persisted = loadPersisted()
  const exportQueue = useManagedExportJobs()
  const tracks = ref<LooperTrack[]>([])
  const manualOrder = ref<string[]>([])
  const playbackOrder = ref<string[]>([])
  const shuffled = ref(false)
  const selectedTrackId = ref<string | null>(null)
  const sequenceTrackId = ref<string | null>(null)
  const previewOwner = ref<'track' | 'sequence' | 'mix' | null>(null)

  const name = ref(persisted.name)
  const targetDurationSeconds = ref(persisted.settings.targetDurationSeconds)
  const loopMode = ref<AudioLooperLoopMode>(SEAMLESS_AVAILABLE ? persisted.settings.loopMode : 'simple')
  const crossfadeSeconds = ref(persisted.settings.crossfadeSeconds)
  const fadeInSeconds = ref(persisted.settings.fadeInSeconds)
  const fadeOutSeconds = ref(persisted.settings.fadeOutSeconds)
  const volumePercent = ref(persisted.settings.volumePercent)
  const format = ref<AudioLooperFormat>(persisted.settings.format)
  const mp3Bitrate = ref<AudioLooperBitrate>(persisted.settings.mp3Bitrate)
  const playlistCrossfade = ref(persisted.settings.playlistCrossfade)
  const playlistCrossfadeSeconds = ref(persisted.settings.playlistCrossfadeSeconds || DEFAULT_PLAYLIST_CROSSFADE_SECONDS)
  const normalizeLoudness = ref(persisted.settings.normalizeLoudness)

  const pickError = ref<string | null>(null)
  const lastEnqueuedExportFingerprint = ref<string | null>(null)
  const mixPreviewUrl = ref<string | null>(null)
  const mixPreviewState = ref<'idle' | 'running' | 'ready' | 'error'>('idle')
  const mixPreviewError = ref<string | null>(null)
  const loadTokens = new Map<string, number>()
  let mixAbort: AbortController | null = null

  const playbackTracks = computed(() =>
    playbackOrder.value
      .map((id) => tracks.value.find((track) => track.id === id))
      .filter((track): track is LooperTrack => Boolean(track)),
  )
  const readyTracks = computed(() =>
    playbackTracks.value.filter((track) => track.status === 'ready' && track.duration != null && trimmedLength(track) >= MIN_TRIM_SECONDS),
  )
  const selectedTrack = computed(
    () => tracks.value.find((track) => track.id === selectedTrackId.value) ?? playbackTracks.value[0] ?? null,
  )
  const trackCount = computed(() => tracks.value.length)
  const isPlaylist = computed(() => readyTracks.value.length >= 2)
  const hasSource = computed(() => tracks.value.length > 0)

  const fileName = computed(() => selectedTrack.value?.fileName ?? null)
  const fileSize = computed(() => selectedTrack.value?.fileSize ?? null)
  const objectUrl = computed(() => selectedTrack.value?.objectUrl ?? null)
  const sourceDuration = computed(() => selectedTrack.value?.duration ?? null)
  const sourceChannels = computed(() => selectedTrack.value?.channels ?? null)
  const sourceSampleRate = computed(() => selectedTrack.value?.sampleRate ?? null)
  const waveform = computed(() => selectedTrack.value?.waveform ?? null)
  const selectedTrimStart = computed(() => selectedTrack.value?.trimStart ?? 0)
  const selectedTrimEnd = computed(() => selectedTrack.value?.trimEnd ?? selectedTrack.value?.duration ?? null)

  const trimmedDurations = computed(() => readyTracks.value.map((track) => trimmedLength(track)))
  const playlistLimit = computed(() => (trimmedDurations.value.length >= 2 ? playlistCrossfadeLimit(trimmedDurations.value) : 0))

  const playlistPlan = computed(() => {
    if (readyTracks.value.length < 2) return { period: trimmedDurations.value[0] ?? 0, error: null as string | null }
    if (readyTracks.value.length !== playbackTracks.value.length) {
      return { period: 0, error: null as string | null }
    }
    try {
      const period = assertPlaylistTimeline(
        trimmedDurations.value,
        playlistCrossfade.value,
        playlistCrossfadeSeconds.value,
      )
      return { period, error: null as string | null }
    } catch (error) {
      return { period: 0, error: error instanceof Error ? error.message : 'Check the crossfade.' }
    }
  })

  const durationPresetKey = computed(() => String(targetDurationSeconds.value))
  const durationLabel = computed(() => formatDurationLabel(targetDurationSeconds.value))

  const currentSettings = computed((): AudioLooperSettings => ({
    targetDurationSeconds: targetDurationSeconds.value,
    loopMode: loopMode.value,
    crossfadeSeconds: crossfadeSeconds.value,
    fadeInSeconds: fadeInSeconds.value,
    fadeOutSeconds: fadeOutSeconds.value,
    volumePercent: volumePercent.value,
    format: format.value,
    mp3Bitrate: mp3Bitrate.value,
    filename: name.value.trim() || 'loop',
    playlistCrossfade: isPlaylist.value && playlistCrossfade.value,
    playlistCrossfadeSeconds: playlistCrossfadeSeconds.value,
    normalizeLoudness: isPlaylist.value && normalizeLoudness.value,
    tracks: exportTracks(),
  }))

  const settingsError = computed(() => {
    try {
      const single = readyTracks.value.length === 1 ? readyTracks.value[0] : null
      normalizeSettings(currentSettings.value, {
        sourceDuration: single ? trimmedLength(single) : undefined,
      })
      if (playlistPlan.value.error) return playlistPlan.value.error
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Check the loop settings.'
    }
  })

  const currentExportFingerprint = computed(() =>
    stableExportFingerprint({
      settings: currentSettings.value,
      order: playbackOrder.value,
      shuffled: shuffled.value,
      files: playbackTracks.value.map((track) => `${track.id}:${track.file.name}:${track.file.size}:${track.file.lastModified}:${track.trimStart}:${track.trimEnd}`),
    }),
  )

  const sequencePeriod = computed(() => (isPlaylist.value ? playlistPlan.value.period : (trimmedDurations.value[0] ?? 0)))

  const willTrim = computed(() => {
    if (isPlaylist.value) return sequencePeriod.value >= targetDurationSeconds.value && sequencePeriod.value > 0
    const duration = trimmedDurations.value[0]
    return duration != null && duration >= targetDurationSeconds.value
  })

  const estimatedRepeats = computed(() => {
    if (isPlaylist.value) return playlistRepeats(sequencePeriod.value, targetDurationSeconds.value)
    const duration = trimmedDurations.value[0]
    if (duration == null || duration <= 0) return 0
    return repeatCount(duration, targetDurationSeconds.value, loopMode.value, crossfadeSeconds.value)
  })

  const estimatedBytes = computed(() =>
    estimateOutputBytes(targetDurationSeconds.value, format.value, {
      bitrate: mp3Bitrate.value,
      sampleRate: isPlaylist.value ? 48000 : (sourceSampleRate.value ?? undefined),
      channels: isPlaylist.value ? 2 : (sourceChannels.value ?? undefined),
    }),
  )

  const maxCrossfade = computed(() => {
    const duration = trimmedDurations.value[0]
    return duration != null ? maxCrossfadeForSource(duration) : 5
  })

  const sourceMetaLabel = computed(() => metaLabel(selectedTrack.value))

  const exportStatusLabel = computed(() => {
    const mode = isPlaylist.value
      ? playlistCrossfade.value
        ? 'Crossfade'
        : 'Playlist'
      : loopMode.value === 'seamless'
        ? 'Seamless'
        : 'Simple'
    return `${durationLabel.value} · ${mode} · ${format.value.toUpperCase()}`
  })

  const exportBlocker = computed(() => {
    if (!platform.serverOnline) return 'The renderer is offline.'
    if (tracks.value.length === 0) return 'Choose an audio file to loop.'
    if (playbackTracks.value.some((track) => track.status === 'reading')) return 'Wait for the audio duration to load.'
    const failed = playbackTracks.value.find((track) => track.status === 'error')
    if (failed) return failed.error ?? 'Remove the track that could not be read.'
    if (readyTracks.value.length === 0) return 'Wait for the audio duration to load.'
    if (settingsError.value) return settingsError.value
    if (
      lastEnqueuedExportFingerprint.value &&
      lastEnqueuedExportFingerprint.value === currentExportFingerprint.value
    ) {
      return DUPLICATE_EXPORT_MESSAGE
    }
    return null
  })

  watch(
    () => ({
      name: name.value,
      settings: {
        ...currentSettings.value,
        tracks: undefined,
        playlistCrossfade: playlistCrossfade.value,
        normalizeLoudness: normalizeLoudness.value,
      },
    }),
    (snapshot) => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot))
      } catch {
        // ignore quota / private mode
      }
    },
    { deep: true },
  )

  watch(currentExportFingerprint, () => {
    clearMixPreview()
  })

  function trimmedLength(track: LooperTrack | null | undefined): number {
    if (!track?.duration || track.duration <= 0) return 0
    const end = Math.min(track.trimEnd ?? track.duration, track.duration)
    const start = Math.max(0, Math.min(track.trimStart, end))
    return Math.max(0, end - start)
  }

  function metaLabel(track: LooperTrack | null): string {
    if (!track) return ''
    const parts: string[] = []
    parts.push(audioFormatLabel(track.fileName))
    parts.push(formatBytes(track.fileSize))
    const length = trimmedLength(track)
    if (length > 0) parts.push(formatClock(length))
    else if (track.duration != null) parts.push(formatClock(track.duration))
    if (track.sampleRate) parts.push(`${Math.round(track.sampleRate / 1000)} kHz`)
    return parts.join(' · ')
  }

  function displayName(track: LooperTrack): string {
    const duplicates = tracks.value.filter((item) => item.fileName === track.fileName).length > 1
    return duplicates ? `${track.fileName} · ${track.id.slice(0, 4)}` : track.fileName
  }

  function exportTracks(): AudioLooperExportTrack[] | undefined {
    if (readyTracks.value.length === 0) return undefined
    return readyTracks.value.map((track) => ({
      id: track.id,
      trimStart: track.trimStart,
      trimEnd: track.trimEnd ?? track.duration ?? 0,
    }))
  }

  function revokeTrack(track: LooperTrack): void {
    URL.revokeObjectURL(track.objectUrl)
    loadTokens.delete(track.id)
  }

  async function addFiles(files: File[]): Promise<void> {
    const messages: string[] = []
    let added = 0
    for (const file of files) {
      if (tracks.value.length >= MAX_AUDIO_LOOPER_TRACKS) {
        messages.push(`Audio Looper holds up to ${MAX_AUDIO_LOOPER_TRACKS} tracks.`)
        break
      }
      const problem = validateLooperAudioFile(file)
      if (problem) {
        messages.push(`${file.name}: ${problem}`)
        continue
      }
      const id = crypto.randomUUID()
      const track: LooperTrack = {
        id,
        file,
        fileName: file.name,
        fileSize: file.size,
        objectUrl: URL.createObjectURL(file),
        duration: null,
        channels: null,
        sampleRate: null,
        waveform: null,
        trimStart: 0,
        trimEnd: null,
        error: null,
        status: 'reading',
      }
      tracks.value = [...tracks.value, track]
      manualOrder.value = [...manualOrder.value, id]
      playbackOrder.value = [...playbackOrder.value, id]
      if (!selectedTrackId.value) selectedTrackId.value = id
      added += 1
      void loadTrack(id)
    }
    pickError.value = messages[0] ?? null
    if (added > 0) lastEnqueuedExportFingerprint.value = null
  }

  async function loadTrack(id: string): Promise<void> {
    const token = (loadTokens.get(id) ?? 0) + 1
    loadTokens.set(id, token)
    const track = tracks.value.find((item) => item.id === id)
    if (!track) return
    const meta = await peaksFromAudioFile(track.file)
    if (loadTokens.get(id) !== token) return
    const current = tracks.value.find((item) => item.id === id)
    if (!current) return
    if (meta) {
      current.waveform = meta
      current.channels = meta.channels
      current.sampleRate = meta.sampleRate
      applyDuration(current, meta.duration)
      current.status = 'ready'
      current.error = null
      return
    }
    const duration = await durationFromElement(current.objectUrl)
    if (loadTokens.get(id) !== token) return
    const again = tracks.value.find((item) => item.id === id)
    if (!again) return
    if (duration != null) {
      applyDuration(again, duration)
      again.status = 'ready'
      again.error = null
      return
    }
    again.status = 'error'
    again.error = 'This file could not be read as audio.'
  }

  function applyDuration(track: LooperTrack, seconds: number): void {
    track.duration = seconds
    if (track.trimEnd == null || track.trimEnd > seconds + 0.001) track.trimEnd = seconds
    if (track.trimStart < 0) track.trimStart = 0
    if (track.trimEnd - track.trimStart < MIN_TRIM_SECONDS) {
      track.trimStart = 0
      track.trimEnd = seconds
    }
  }

  function setSourceDuration(seconds: number | null): void {
    const track = selectedTrack.value
    if (!track || seconds == null || !Number.isFinite(seconds) || seconds <= 0) return
    if (track.duration != null) return
    applyDuration(track, seconds)
    if (track.status === 'reading') track.status = 'ready'
  }

  function selectTrack(id: string): void {
    if (!tracks.value.some((track) => track.id === id)) return
    selectedTrackId.value = id
    previewOwner.value = 'track'
  }

  function removeTrack(id: string): void {
    const track = tracks.value.find((item) => item.id === id)
    if (!track) return
    revokeTrack(track)
    tracks.value = tracks.value.filter((item) => item.id !== id)
    manualOrder.value = manualOrder.value.filter((item) => item !== id)
    playbackOrder.value = playbackOrder.value.filter((item) => item !== id)
    if (playbackOrder.value.length < 2) shuffled.value = false
    if (selectedTrackId.value === id) selectedTrackId.value = playbackOrder.value[0] ?? null
    if (sequenceTrackId.value === id) sequenceTrackId.value = null
    lastEnqueuedExportFingerprint.value = null
    pickError.value = null
  }

  function clearTracks(): void {
    for (const track of tracks.value) revokeTrack(track)
    tracks.value = []
    manualOrder.value = []
    playbackOrder.value = []
    shuffled.value = false
    selectedTrackId.value = null
    sequenceTrackId.value = null
    pickError.value = null
    lastEnqueuedExportFingerprint.value = null
    previewOwner.value = null
  }

  function reorder(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= playbackOrder.value.length || to >= playbackOrder.value.length) return
    const order = playbackOrder.value.slice()
    const [id] = order.splice(from, 1)
    if (!id) return
    order.splice(to, 0, id)
    playbackOrder.value = order
    if (!shuffled.value) manualOrder.value = order.slice()
    lastEnqueuedExportFingerprint.value = null
  }

  function shuffleTracks(): void {
    if (playbackOrder.value.length < 2) return
    let next = shuffleIds(playbackOrder.value)
    const manual = manualOrder.value.join('|')
    if (next.join('|') === manual) next = shuffleIds(next)
    playbackOrder.value = next
    shuffled.value = true
    lastEnqueuedExportFingerprint.value = null
  }

  function restoreOrder(): void {
    playbackOrder.value = manualOrder.value.slice()
    shuffled.value = false
    lastEnqueuedExportFingerprint.value = null
  }

  function setTrim(id: string, start: number, end: number): void {
    const track = tracks.value.find((item) => item.id === id)
    if (!track?.duration) return
    const gap = MIN_TRIM_SECONDS
    const nextStart = Math.max(0, Math.min(start, track.duration - gap))
    const nextEnd = Math.min(track.duration, Math.max(end, nextStart + gap))
    if (nextEnd - nextStart < gap) return
    track.trimStart = nextStart
    track.trimEnd = nextEnd
    lastEnqueuedExportFingerprint.value = null
  }

  function resetTrim(id: string): void {
    const track = tracks.value.find((item) => item.id === id)
    if (!track?.duration) return
    track.trimStart = 0
    track.trimEnd = track.duration
    lastEnqueuedExportFingerprint.value = null
  }

  function claimPreview(owner: 'track' | 'sequence' | 'mix'): void {
    previewOwner.value = owner
  }

  function setSequenceTrack(id: string | null): void {
    sequenceTrackId.value = id
  }

  function setDurationPreset(seconds: number): void {
    const clamped = Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, Math.round(seconds)))
    targetDurationSeconds.value = clamped
  }

  function setCustomDurationMinutes(minutes: number): void {
    if (!Number.isFinite(minutes)) return
    const total = Math.round(minutes * 60)
    targetDurationSeconds.value = Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, total))
  }

  function setLoopMode(mode: AudioLooperLoopMode): void {
    if (mode === 'seamless' && !SEAMLESS_AVAILABLE) return
    loopMode.value = mode
  }

  function setPlaylistCrossfade(enabled: boolean): void {
    playlistCrossfade.value = enabled
    if (enabled && playlistCrossfadeSeconds.value <= 0) {
      playlistCrossfadeSeconds.value = DEFAULT_PLAYLIST_CROSSFADE_SECONDS
    }
  }

  function newProject(): void {
    const defaults = defaultAudioLooperSettings()
    name.value = 'Untitled loop'
    targetDurationSeconds.value = defaults.targetDurationSeconds
    loopMode.value = defaults.loopMode
    crossfadeSeconds.value = defaults.crossfadeSeconds
    fadeInSeconds.value = defaults.fadeInSeconds
    fadeOutSeconds.value = defaults.fadeOutSeconds
    volumePercent.value = defaults.volumePercent
    format.value = defaults.format
    mp3Bitrate.value = defaults.mp3Bitrate
    playlistCrossfade.value = false
    playlistCrossfadeSeconds.value = defaults.playlistCrossfadeSeconds
    normalizeLoudness.value = false
    clearTracks()
  }

  function startExport(): void {
    if (exportBlocker.value) return
    const files = readyTracks.value
    if (files.length === 0) return
    let settings: AudioLooperSettings
    try {
      const single = files.length === 1 ? files[0] : null
      settings = normalizeSettings(currentSettings.value, {
        sourceDuration: single ? trimmedLength(single) : undefined,
      })
      if (files.length >= 2) {
        assertPlaylistTimeline(
          files.map((track) => trimmedLength(track)),
          settings.playlistCrossfade,
          settings.playlistCrossfadeSeconds,
        )
      }
      settings.tracks = alignExportTrims(
        files.map((track) => ({
          id: track.id,
          trimStart: track.trimStart,
          trimEnd: track.trimEnd ?? track.duration ?? 0,
        })),
        files.map((track) => track.duration ?? 0),
      )
    } catch (error) {
      platform.toast(error instanceof Error ? error.message : 'Check the loop settings.', 'error')
      return
    }
    const displayNameText = name.value.trim() || 'Untitled loop'
    const downloadFilename = audioLooperDownloadName(settings.filename, settings.format)
    if (
      exportQueue.enqueue({
        app: 'audio-looper',
        displayName: displayNameText,
        downloadFilename,
        toast: platform.toast,
        onError: (text) => platform.toast(text, 'error'),
        submit: async (signal, onUpdate) =>
          submitAudioLooperExport({
            files: files.map((track) => track.file),
            settings,
            signal,
            onUpdate,
          }),
      })
    ) {
      lastEnqueuedExportFingerprint.value = currentExportFingerprint.value
    }
  }

  async function previewMix(): Promise<void> {
    if (!isPlaylist.value || !normalizeLoudness.value || playlistPlan.value.error) return
    const files = readyTracks.value
    mixAbort?.abort()
    const controller = new AbortController()
    mixAbort = controller
    mixPreviewState.value = 'running'
    mixPreviewError.value = null
    try {
      const settings = normalizeSettings({
        ...currentSettings.value,
        normalizeLoudness: true,
        playlistCrossfade: playlistCrossfade.value,
      })
      settings.tracks = files.map((track) => ({
        id: track.id,
        trimStart: track.trimStart,
        trimEnd: track.trimEnd ?? track.duration ?? 0,
      }))
      const blob = await requestAudioLooperPreview({
        files: files.map((track) => track.file),
        settings,
        signal: controller.signal,
      })
      if (mixAbort !== controller) return
      if (mixPreviewUrl.value) URL.revokeObjectURL(mixPreviewUrl.value)
      mixPreviewUrl.value = URL.createObjectURL(blob)
      mixPreviewState.value = 'ready'
      previewOwner.value = 'mix'
    } catch (error) {
      if (controller.signal.aborted) return
      mixPreviewState.value = 'error'
      mixPreviewError.value = error instanceof Error ? error.message : 'The preview could not be created.'
    }
  }

  function clearMixPreview(): void {
    mixAbort?.abort()
    mixAbort = null
    if (mixPreviewUrl.value) URL.revokeObjectURL(mixPreviewUrl.value)
    mixPreviewUrl.value = null
    if (mixPreviewState.value !== 'idle') mixPreviewState.value = 'idle'
    mixPreviewError.value = null
    if (previewOwner.value === 'mix') previewOwner.value = null
  }

  return {
    name,
    tracks,
    playbackTracks,
    readyTracks,
    selectedTrack,
    selectedTrackId,
    sequenceTrackId,
    previewOwner,
    shuffled,
    trackCount,
    isPlaylist,
    hasSource,
    targetDurationSeconds,
    loopMode,
    crossfadeSeconds,
    fadeInSeconds,
    fadeOutSeconds,
    volumePercent,
    format,
    mp3Bitrate,
    playlistCrossfade,
    playlistCrossfadeSeconds,
    playlistLimit,
    normalizeLoudness,
    fileName,
    fileSize,
    objectUrl,
    sourceDuration,
    sourceChannels,
    sourceSampleRate,
    waveform,
    selectedTrimStart,
    selectedTrimEnd,
    pickError,
    mixPreviewUrl,
    mixPreviewState,
    mixPreviewError,
    durationPresetKey,
    durationLabel,
    presets: AUDIO_LOOPER_DURATION_PRESETS,
    currentSettings,
    settingsError,
    sequencePeriod,
    willTrim,
    estimatedRepeats,
    estimatedBytes,
    maxCrossfade,
    sourceMetaLabel,
    exportStatusLabel,
    exportBlocker,
    exportState: exportQueue.exportState,
    exporting: exportQueue.exporting,
    activeExportCount: exportQueue.activeExportCount,
    seamlessAvailable: SEAMLESS_AVAILABLE,
    trackLimit: MAX_AUDIO_LOOPER_TRACKS,
    addFiles,
    pickFile: (file: File) => addFiles([file]),
    setSourceDuration,
    selectTrack,
    removeTrack,
    clearTracks,
    clearFile: clearTracks,
    reorder,
    shuffleTracks,
    restoreOrder,
    setTrim,
    resetTrim,
    claimPreview,
    setSequenceTrack,
    displayName,
    metaLabel,
    trimmedLength,
    setDurationPreset,
    setCustomDurationMinutes,
    setLoopMode,
    setPlaylistCrossfade,
    newProject,
    startExport,
    previewMix,
    clearMixPreview,
  }
})
