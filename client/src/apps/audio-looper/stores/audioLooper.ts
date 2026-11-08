import {
  AUDIO_LOOPER_DURATION_PRESETS,
  audioLooperDownloadName,
  defaultAudioLooperSettings,
  estimateOutputBytes,
  formatDurationLabel,
  maxCrossfadeForSource,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  normalizeSettings,
  repeatCount,
  SEAMLESS_AVAILABLE,
  type AudioLooperBitrate,
  type AudioLooperFormat,
  type AudioLooperLoopMode,
  type AudioLooperSettings,
} from '@shared/audioLooper'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { audioFormatLabel } from '../../../lib/media'
import { formatBytes, formatClock } from '../../../lib/format'
import { DUPLICATE_EXPORT_MESSAGE, stableExportFingerprint } from '../../../lib/exportFingerprint'
import { useManagedExportJobs } from '../../../lib/managedExportJobs'
import { usePlatformStore } from '../../../stores/platform'
import { submitAudioLooperExport } from '../lib/audioLooperExport'
import { validateLooperAudioFile } from '../lib/validateLooperAudio'
import { peaksFromAudioFile, type WaveformMeta } from '../lib/waveform'

const SETTINGS_KEY = 'vf-audio-looper-settings'

type PersistedLooperSettings = {
  name: string
  settings: AudioLooperSettings
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

export const useAudioLooperStore = defineStore('audio-looper', () => {
  const platform = usePlatformStore()
  const persisted = loadPersisted()
  const exportQueue = useManagedExportJobs()
  const sourceFile = ref<File | null>(null)

  const name = ref(persisted.name)
  const targetDurationSeconds = ref(persisted.settings.targetDurationSeconds)
  const loopMode = ref<AudioLooperLoopMode>(SEAMLESS_AVAILABLE ? persisted.settings.loopMode : 'simple')
  const crossfadeSeconds = ref(persisted.settings.crossfadeSeconds)
  const fadeInSeconds = ref(persisted.settings.fadeInSeconds)
  const fadeOutSeconds = ref(persisted.settings.fadeOutSeconds)
  const volumePercent = ref(persisted.settings.volumePercent)
  const format = ref<AudioLooperFormat>(persisted.settings.format)
  const mp3Bitrate = ref<AudioLooperBitrate>(persisted.settings.mp3Bitrate)

  const fileName = ref<string | null>(null)
  const fileSize = ref<number | null>(null)
  const objectUrl = ref<string | null>(null)
  const sourceDuration = ref<number | null>(null)
  const sourceCodec = ref<string | null>(null)
  const sourceChannels = ref<number | null>(null)
  const sourceSampleRate = ref<number | null>(null)
  const waveform = ref<WaveformMeta | null>(null)
  const pickError = ref<string | null>(null)
  const lastEnqueuedExportFingerprint = ref<string | null>(null)
  let waveformToken = 0

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
  }))

  const settingsError = computed(() => {
    try {
      normalizeSettings(currentSettings.value, {
        sourceDuration: sourceDuration.value ?? undefined,
      })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Check the loop settings.'
    }
  })

  const currentExportFingerprint = computed(() =>
    stableExportFingerprint({
      settings: currentSettings.value,
      file: sourceFile.value ? `${sourceFile.value.name}:${sourceFile.value.size}:${sourceFile.value.lastModified}` : null,
    }),
  )

  const willTrim = computed(
    () => sourceDuration.value != null && sourceDuration.value >= targetDurationSeconds.value,
  )

  const estimatedRepeats = computed(() => {
    if (sourceDuration.value == null || sourceDuration.value <= 0) return 0
    return repeatCount(sourceDuration.value, targetDurationSeconds.value, loopMode.value, crossfadeSeconds.value)
  })

  const estimatedBytes = computed(() =>
    estimateOutputBytes(targetDurationSeconds.value, format.value, {
      bitrate: mp3Bitrate.value,
      sampleRate: sourceSampleRate.value ?? undefined,
      channels: sourceChannels.value ?? undefined,
    }),
  )

  const maxCrossfade = computed(() =>
    sourceDuration.value != null ? maxCrossfadeForSource(sourceDuration.value) : 5,
  )

  const sourceMetaLabel = computed(() => {
    const parts: string[] = []
    if (fileName.value) parts.push(audioFormatLabel(fileName.value))
    if (fileSize.value != null) parts.push(formatBytes(fileSize.value))
    if (sourceDuration.value != null) parts.push(formatClock(sourceDuration.value))
    if (sourceChannels.value) parts.push(sourceChannels.value === 1 ? 'Mono' : `${sourceChannels.value} ch`)
    if (sourceSampleRate.value) parts.push(`${Math.round(sourceSampleRate.value / 1000)} kHz`)
    return parts.join(' · ')
  })

  const exportBlocker = computed(() => {
    if (!platform.serverOnline) return 'The renderer is offline.'
    if (!sourceFile.value) return 'Choose an audio file to loop.'
    if (sourceDuration.value == null || sourceDuration.value <= 0) return 'Wait for the audio duration to load.'
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
      settings: currentSettings.value,
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

  function revokePreview(): void {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }

  async function pickFile(file: File): Promise<void> {
    const problem = validateLooperAudioFile(file)
    if (problem) {
      pickError.value = problem
      return
    }
    pickError.value = null
    sourceFile.value = file
    revokePreview()
    fileName.value = file.name
    fileSize.value = file.size
    objectUrl.value = URL.createObjectURL(file)
    sourceDuration.value = null
    sourceCodec.value = audioFormatLabel(file.name)
    sourceChannels.value = null
    sourceSampleRate.value = null
    waveform.value = null
    lastEnqueuedExportFingerprint.value = null

    const token = ++waveformToken
    const meta = await peaksFromAudioFile(file)
    if (token !== waveformToken) return
    if (meta) {
      waveform.value = meta
      sourceChannels.value = meta.channels
      sourceSampleRate.value = meta.sampleRate
      if (sourceDuration.value == null) sourceDuration.value = meta.duration
    }
  }

  function setSourceDuration(seconds: number | null): void {
    if (seconds != null && Number.isFinite(seconds) && seconds > 0) {
      sourceDuration.value = seconds
    }
  }

  function clearFile(): void {
    waveformToken += 1
    sourceFile.value = null
    revokePreview()
    fileName.value = null
    fileSize.value = null
    sourceDuration.value = null
    sourceCodec.value = null
    sourceChannels.value = null
    sourceSampleRate.value = null
    waveform.value = null
    pickError.value = null
    lastEnqueuedExportFingerprint.value = null
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
    clearFile()
  }

  function startExport(): void {
    if (exportBlocker.value) return
    const file = sourceFile.value
    if (!file) return
    let settings: AudioLooperSettings
    try {
      settings = normalizeSettings(currentSettings.value, { sourceDuration: sourceDuration.value ?? undefined })
    } catch (error) {
      platform.toast(error instanceof Error ? error.message : 'Check the loop settings.', 'error')
      return
    }
    const displayName = name.value.trim() || 'Untitled loop'
    const downloadFilename = audioLooperDownloadName(settings.filename, settings.format)
    if (
      exportQueue.enqueue({
        app: 'audio-looper',
        displayName,
        downloadFilename,
        toast: platform.toast,
        onError: (text) => platform.toast(text, 'error'),
        submit: async (signal, onUpdate) =>
          submitAudioLooperExport({
            file,
            settings,
            signal,
            onUpdate,
          }),
      })
    ) {
      lastEnqueuedExportFingerprint.value = currentExportFingerprint.value
    }
  }

  return {
    name,
    targetDurationSeconds,
    loopMode,
    crossfadeSeconds,
    fadeInSeconds,
    fadeOutSeconds,
    volumePercent,
    format,
    mp3Bitrate,
    fileName,
    fileSize,
    objectUrl,
    sourceDuration,
    sourceCodec,
    sourceChannels,
    sourceSampleRate,
    waveform,
    pickError,
    durationPresetKey,
    durationLabel,
    presets: AUDIO_LOOPER_DURATION_PRESETS,
    currentSettings,
    settingsError,
    willTrim,
    estimatedRepeats,
    estimatedBytes,
    maxCrossfade,
    sourceMetaLabel,
    exportBlocker,
    exportState: exportQueue.exportState,
    exporting: exportQueue.exporting,
    activeExportCount: exportQueue.activeExportCount,
    seamlessAvailable: SEAMLESS_AVAILABLE,
    pickFile,
    setSourceDuration,
    clearFile,
    setDurationPreset,
    setCustomDurationMinutes,
    setLoopMode,
    newProject,
    startExport,
  }
})
