import {
  DEFAULT_UPSCALE_LIMITS,
  defaultUpscaleOptions,
  formatBytes,
  normalizeOptions,
  presetById,
  screensaverTransferAction,
  type OutputFormat,
  type PublicUpscaleJob,
  type ResolutionPresetId,
  type UpscaleEngineId,
  type UpscaleOptions,
  type UpscalerCapabilities,
} from '@shared/imageUpscaler'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { sniffImageMime } from '../../../lib/media'
import { usePlatformStore } from '../../../stores/platform'
import { useScreensaverStore } from '../../frame-screensaver/stores/screensaver'
import { readLocalImage } from '../lib/localPreview'
import { sendFileToScreensaver } from '../lib/sendToScreensaver'
import { cancelUpscaleJob, fetchUpscaledBlob, fetchUpscalerCapabilities, getUpscaleJob, startUpscale, zipDownloadUrl } from '../lib/upscalerApi'
import type { LocalUpscaleItem } from '../types'

export const useImageUpscalerStore = defineStore('image-upscaler', () => {
  const platform = usePlatformStore()
  const items = ref<LocalUpscaleItem[]>([])
  const selectedId = ref<string | null>(null)
  const settings = ref<UpscaleOptions>(defaultUpscaleOptions())
  const capabilities = ref<UpscalerCapabilities | null>(null)
  const jobEngine = ref<UpscaleEngineId>('lanczos3')
  const jobId = ref<string | null>(null)
  const busy = ref(false)
  const confirmSendId = ref<string | null>(null)
  let pollTimer = 0

  const selected = computed(() => items.value.find((item) => item.localId === selectedId.value) ?? null)
  const completedCount = computed(() => items.value.filter((item) => item.status === 'completed').length)
  const processing = computed(() => busy.value || items.value.some((item) => item.status === 'pending' || item.status === 'processing'))

  function toast(error: unknown, fallback: string): void {
    platform.toast(error instanceof Error ? error.message : fallback)
  }

  async function addFiles(files: File[]): Promise<void> {
    const room = DEFAULT_UPSCALE_LIMITS.maxBatch - items.value.length
    if (room <= 0) {
      platform.toast(`You can add up to ${DEFAULT_UPSCALE_LIMITS.maxBatch} images at a time.`, 'info')
      return
    }
    const batch = files.slice(0, room)
    if (files.length > batch.length) {
      platform.toast(`Only ${room} more image${room === 1 ? '' : 's'} can be added.`, 'info')
    }
    for (const file of batch) {
      const sniffed = await sniffImageMime(file)
      if (!sniffed) {
        platform.toast(`${file.name} is not a PNG, JPEG, or WebP image.`)
        continue
      }
      if (file.size > DEFAULT_UPSCALE_LIMITS.maxFileBytes) {
        platform.toast(`${file.name} is larger than ${formatBytes(DEFAULT_UPSCALE_LIMITS.maxFileBytes)}.`)
        continue
      }
      try {
        const preview = await readLocalImage(file, 960)
        const localId = crypto.randomUUID()
        items.value.push({
          localId,
          file,
          name: file.name,
          previewUrl: preview.previewUrl,
          width: preview.width,
          height: preview.height,
          bytes: file.size,
          status: 'ready',
          error: null,
          warning: null,
          serverItemId: null,
          outputName: null,
          outputBytes: null,
          outputWidth: null,
          outputHeight: null,
          skippedResize: false,
        })
        if (!selectedId.value) selectedId.value = localId
      } catch {
        platform.toast(`${file.name} could not be read.`)
      }
    }
  }

  function removeItem(localId: string): void {
    if (processing.value) return
    const index = items.value.findIndex((item) => item.localId === localId)
    const item = items.value[index]
    if (!item) return
    URL.revokeObjectURL(item.previewUrl)
    items.value.splice(index, 1)
    if (selectedId.value === localId) selectedId.value = items.value[0]?.localId ?? null
  }

  function clearItems(): void {
    for (const item of items.value) URL.revokeObjectURL(item.previewUrl)
    items.value = []
    selectedId.value = null
    jobId.value = null
    jobEngine.value = 'lanczos3'
    confirmSendId.value = null
    window.clearTimeout(pollTimer)
  }

  function selectItem(localId: string): void {
    if (items.value.some((item) => item.localId === localId)) selectedId.value = localId
  }

  function setPreset(id: ResolutionPresetId): void {
    const preset = presetById(id)
    if (!preset) return
    settings.value = {
      ...settings.value,
      preset: preset.id,
      width: preset.width ?? settings.value.width,
      height: preset.height ?? settings.value.height,
    }
  }

  function setEngine(engine: UpscaleEngineId): void {
    if (engine === 'realesrgan-lite' && capabilities.value?.engines['realesrgan-lite'].available !== true) return
    settings.value = { ...settings.value, engine }
  }

  async function loadCapabilities(): Promise<void> {
    const report = await fetchUpscalerCapabilities()
    capabilities.value = report ?? {
      engines: {
        lanczos3: { available: true, model: null, scale: null, matchesUpscaylLite: false, reason: null },
        'realesrgan-lite': {
          available: false,
          model: null,
          scale: null,
          matchesUpscaylLite: false,
          reason: 'AI Lite is not available from this server.',
        },
      },
    }
    if (settings.value.engine === 'realesrgan-lite' && !capabilities.value.engines['realesrgan-lite'].available) {
      settings.value = { ...settings.value, engine: 'lanczos3' }
    }
  }

  function setFormat(format: OutputFormat): void {
    settings.value = {
      ...settings.value,
      format,
      padding: format === 'jpeg' && settings.value.padding === 'transparent' ? 'black' : settings.value.padding,
    }
  }

  async function upscale(): Promise<void> {
    if (processing.value || items.value.length === 0) return
    let normalized: ReturnType<typeof normalizeOptions>
    try {
      normalized = normalizeOptions(settings.value)
    } catch (error) {
      toast(error, 'Check the output settings.')
      return
    }
    settings.value = normalized.options
    jobEngine.value = normalized.options.engine
    busy.value = true
    for (const item of items.value) {
      item.status = 'pending'
      item.error = null
      item.warning = normalized.warnings[0] ?? null
      item.serverItemId = null
      item.outputName = null
      item.outputBytes = null
      item.outputWidth = null
      item.outputHeight = null
      item.skippedResize = false
    }
    try {
      const job = await startUpscale(
        items.value.map((item) => item.file),
        normalized.options,
      )
      jobId.value = job.id
      if (job.engine) jobEngine.value = job.engine
      applyJob(job)
      schedulePoll()
    } catch (error) {
      busy.value = false
      for (const item of items.value) {
        if (item.status === 'pending') item.status = 'ready'
      }
      toast(error, 'The images could not be sent.')
    }
  }

  function schedulePoll(): void {
    window.clearTimeout(pollTimer)
    pollTimer = window.setTimeout(() => {
      void poll()
    }, 700)
  }

  async function poll(): Promise<void> {
    const id = jobId.value
    if (!id) {
      busy.value = false
      return
    }
    try {
      const job = await getUpscaleJob(id)
      applyJob(job)
      if (job.status === 'queued' || job.status === 'running') schedulePoll()
      else busy.value = false
    } catch (error) {
      busy.value = false
      toast(error, 'The upscale status could not be read.')
    }
  }

  function applyJob(job: PublicUpscaleJob): void {
    if (job.engine) jobEngine.value = job.engine
    job.items.forEach((serverItem, index) => {
      const local = items.value[index]
      if (!local) return
      local.serverItemId = serverItem.id
      local.status = serverItem.status
      local.error = serverItem.error
      local.warning = serverItem.warning
      local.outputName = serverItem.outputName
      local.outputBytes = serverItem.outputBytes
      local.outputWidth = serverItem.width
      local.outputHeight = serverItem.height
      local.skippedResize = serverItem.skippedResize
    })
  }

  async function cancel(): Promise<void> {
    const id = jobId.value
    if (!id) return
    try {
      await cancelUpscaleJob(id)
      await poll()
    } catch (error) {
      toast(error, 'The upscale could not be cancelled.')
    }
  }

  function downloadItem(localId: string): void {
    const item = items.value.find((entry) => entry.localId === localId)
    if (!jobId.value || !item?.serverItemId || !item.outputName) return
    const anchor = document.createElement('a')
    anchor.href = `/api/image-upscaler/jobs/${jobId.value}/items/${item.serverItemId}/download`
    anchor.download = item.outputName
    anchor.click()
  }

  function downloadZip(): void {
    if (!jobId.value || completedCount.value === 0) return
    const anchor = document.createElement('a')
    anchor.href = zipDownloadUrl(jobId.value)
    anchor.download = 'upscaled-images.zip'
    anchor.click()
  }

  async function requestSend(localId: string): Promise<void> {
    const item = items.value.find((entry) => entry.localId === localId)
    if (!item || item.status !== 'completed' || !jobId.value || !item.serverItemId) return
    const screensaver = useScreensaverStore()
    const hasSource = await screensaver.hasBlockingSource()
    if (screensaverTransferAction(hasSource, null) === 'ask') {
      confirmSendId.value = localId
      return
    }
    await commitSend(localId)
  }

  async function resolveSend(choice: 'replace' | 'cancel'): Promise<void> {
    const localId = confirmSendId.value
    confirmSendId.value = null
    if (!localId || screensaverTransferAction(true, choice) !== 'send') return
    await commitSend(localId)
  }

  async function commitSend(localId: string): Promise<void> {
    const item = items.value.find((entry) => entry.localId === localId)
    if (!item || !jobId.value || !item.serverItemId || !item.outputName) return
    try {
      const blob = await fetchUpscaledBlob(jobId.value, item.serverItemId)
      const file = new File([blob], item.outputName, { type: blob.type || 'image/png' })
      await sendFileToScreensaver(file)
      platform.toast('Screensaver is using the upscaled image.', 'info')
    } catch (error) {
      toast(error, 'The image could not be sent to Screensaver.')
    }
  }

  async function clearFiles(): Promise<void> {
    if (processing.value || items.value.length === 0) return
    if (!window.confirm('Remove all images from this list?')) return
    const id = jobId.value
    clearItems()
    busy.value = false
    if (id) await cancelUpscaleJob(id, true).catch(() => undefined)
  }

  async function newProject(): Promise<void> {
    if (items.value.length === 0 && !jobId.value) {
      settings.value = defaultUpscaleOptions()
      return
    }
    if (!window.confirm('Clear the Image Upscaler queue? Images in this list will be removed.')) return
    const id = jobId.value
    clearItems()
    busy.value = false
    settings.value = defaultUpscaleOptions()
    jobEngine.value = 'lanczos3'
    if (id) await cancelUpscaleJob(id, true).catch(() => undefined)
  }

  void loadCapabilities()

  return {
    items,
    selectedId,
    selected,
    settings,
    capabilities,
    jobEngine,
    jobId,
    busy,
    processing,
    completedCount,
    confirmSendId,
    limits: DEFAULT_UPSCALE_LIMITS,
    addFiles,
    removeItem,
    clearFiles,
    selectItem,
    setPreset,
    setEngine,
    loadCapabilities,
    setFormat,
    upscale,
    cancel,
    downloadItem,
    downloadZip,
    requestSend,
    resolveSend,
    newProject,
  }
})
