<script setup lang="ts">
import { THUMBNAIL_OUTPUTS, THUMBNAIL_TEMPLATES, YOUTUBE_THUMBNAIL_BYTES, applyTemplate, exactExportSize, sanitizeFilenamePart, setOutputSize, thumbnailFilename, type TemplateId } from '@shared/thumbnailProject'
import { zipStored } from '@shared/thumbnailZip'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ToggleSwitch from '../../../components/ToggleSwitch.vue'
import { formatBytes } from '../../../lib/format'
import { canvasToBlob, exportThumbnailBlob, renderThumbnail } from '../lib/renderThumbnail'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()
const format = ref<'png' | 'jpeg' | 'webp'>('png')
const quality = ref(0.92)
const width = ref(store.project.width)
const height = ref(store.project.height)
const filename = ref('')
const prepared = ref<Blob | null>(null)
const busy = ref(false)
const error = ref('')
const youtube = ref(false)
const batchIds = ref<TemplateId[]>([])
const batch = ref<{ id: TemplateId; name: string; url: string; selected: boolean }[]>([])

const sizeLabel = computed(() => (prepared.value ? formatThumbnailBytes(prepared.value.size) : ''))
const tooLarge = computed(() => youtube.value && prepared.value != null && prepared.value.size > YOUTUBE_THUMBNAIL_BYTES)

watch(
  () => [store.project.width, store.project.height, store.project.name, store.project.templateId, format.value, width.value, height.value],
  () => {
    filename.value = thumbnailFilename(store.project.name, store.project.templateId, width.value, height.value, format.value)
    prepared.value = null
  },
  { immediate: true },
)

watch(quality, () => {
  prepared.value = null
})

function applySize(value: string): void {
  if (value === 'custom') return
  const [w, h] = value.split('x').map(Number)
  width.value = w
  height.value = h
}

function setBatchTemplate(id: TemplateId, selected: boolean): void {
  if (selected) {
    if (!batchIds.value.includes(id)) batchIds.value = [...batchIds.value, id]
    return
  }
  batchIds.value = batchIds.value.filter((entry) => entry !== id)
}

function useYoutube(): void {
  youtube.value = true
  format.value = 'jpeg'
  quality.value = 0.92
  width.value = 1280
  height.value = 720
}

async function prepare(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const sized = setOutputSize(JSON.parse(JSON.stringify(store.project)), width.value, height.value, 'custom')
    const exact = exactExportSize(sized.width, sized.height)
    if (exact.width !== sized.width || exact.height !== sized.height) throw new Error('Export size was not exact.')
    prepared.value = await exportThumbnailBlob(sized, store.renderAssets(), format.value, quality.value)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Export failed.'
  } finally {
    busy.value = false
  }
}

function formatThumbnailBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return formatBytes(bytes)
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function download(): void {
  if (!prepared.value) return
  const safe = filename.value.replace(/[\\/]/g, '') || thumbnailFilename(store.project.name, store.project.templateId, width.value, height.value, format.value)
  downloadBlob(prepared.value, safe)
}

async function generateBatch(): Promise<void> {
  clearBatch()
  busy.value = true
  try {
    for (const id of batchIds.value) {
      const variant = applyTemplate(JSON.parse(JSON.stringify(store.project)), id)
      const canvas = renderThumbnail(variant, store.renderAssets(), { maxEdge: 480, checker: false })
      const blob = await canvasToBlob(canvas, 'image/png')
      batch.value.push({
        id,
        name: THUMBNAIL_TEMPLATES.find((item) => item.id === id)?.name ?? id,
        url: URL.createObjectURL(blob),
        selected: true,
      })
    }
  } finally {
    busy.value = false
  }
}

async function downloadBatch(): Promise<void> {
  busy.value = true
  try {
    const files = []
    for (const item of batch.value.filter((entry) => entry.selected)) {
      const variant = setOutputSize(applyTemplate(JSON.parse(JSON.stringify(store.project)), item.id), width.value, height.value, 'custom')
      const blob = await exportThumbnailBlob(variant, store.renderAssets(), format.value, quality.value)
      files.push({
        name: thumbnailFilename(store.project.name, item.id, variant.width, variant.height, format.value),
        data: new Uint8Array(await blob.arrayBuffer()),
      })
    }
    if (files.length === 0) return
    const zip = zipStored(files)
    const buffer = new ArrayBuffer(zip.byteLength)
    new Uint8Array(buffer).set(zip)
    downloadBlob(new Blob([buffer]), `${sanitizeFilenamePart(store.project.name)}-thumbnails.zip`)
  } finally {
    busy.value = false
  }
}

function clearBatch(): void {
  for (const item of batch.value) URL.revokeObjectURL(item.url)
  batch.value = []
}

onBeforeUnmount(clearBatch)
</script>

<template>
  <div class="absolute inset-0 z-40 overflow-y-auto bg-black/70 p-4">
    <div class="mx-auto w-full max-w-3xl rounded-lg border border-zinc-800 bg-[#14161c] p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold">Export thumbnail</h2>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.exportOpen = false">Close</button>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-zinc-400">Resolution
          <select class="field mt-1" :value="`${width}x${height}`" @change="applySize(($event.target as HTMLSelectElement).value)">
            <option v-for="size in THUMBNAIL_OUTPUTS" :key="size.label" :value="`${size.width}x${size.height}`">{{ size.label }}</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label class="text-xs text-zinc-400">Format
          <select v-model="format" class="field mt-1">
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        <label class="text-xs text-zinc-400">Width
          <input v-model.number="width" class="field mt-1" type="number" min="16" max="7680" />
        </label>
        <label class="text-xs text-zinc-400">Height
          <input v-model.number="height" class="field mt-1" type="number" min="16" max="7680" />
        </label>
        <label v-if="format !== 'png'" class="text-xs text-zinc-400 sm:col-span-2">Quality {{ Math.round(quality * 100) }}%
          <input v-model.number="quality" class="mt-1 w-full" type="range" min="0.5" max="1" step="0.01" />
        </label>
        <label class="text-xs text-zinc-400 sm:col-span-2">Filename
          <input v-model="filename" class="field mt-1" type="text" />
        </label>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="btn btn-ghost cursor-pointer" type="button" @click="useYoutube">YouTube 1280×720 JPEG</button>
        <button class="btn btn-primary cursor-pointer" type="button" :disabled="busy" @click="prepare">Prepare</button>
        <button class="btn btn-success cursor-pointer" type="button" :disabled="!prepared" @click="download">Download</button>
      </div>
      <p v-if="sizeLabel" class="mt-3 text-sm text-zinc-300">File size {{ sizeLabel }}. Export is {{ width }}×{{ height }}.</p>
      <p v-if="tooLarge" class="mt-2 text-sm text-amber-200">This JPEG is over 2 MB. Lower the quality if you need a smaller YouTube file. The dimensions stay the same.</p>
      <p v-if="format === 'png'" class="mt-2 text-xs text-zinc-500">PNG keeps transparency. JPEG flattens it.</p>
      <p v-if="error" class="mt-2 text-sm text-red-300">{{ error }}</p>

      <div class="mt-6 border-t border-zinc-800 pt-4">
        <h3 class="font-semibold">Variations</h3>
        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <div v-for="item in THUMBNAIL_TEMPLATES" :key="item.id" class="flex items-center justify-between gap-2 text-sm">
            <span>{{ item.name }}</span>
            <ToggleSwitch
              :model-value="batchIds.includes(item.id)"
              :aria-label="`Include ${item.name} variation`"
              @update:model-value="setBatchTemplate(item.id, $event)"
            />
          </div>
        </div>
        <div class="mt-3 flex gap-2">
          <button class="btn btn-ghost cursor-pointer" type="button" :disabled="busy || batchIds.length === 0" @click="generateBatch">Generate previews</button>
          <button class="btn btn-primary cursor-pointer" type="button" :disabled="busy || batch.every((item) => !item.selected)" @click="downloadBatch">Download ZIP</button>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label v-for="item in batch" :key="item.id" class="block rounded border border-zinc-800 p-2">
            <img :src="item.url" :alt="item.name" class="aspect-video w-full object-contain bg-black" />
            <span class="mt-2 flex items-center justify-between gap-2 text-xs">
              <span>{{ item.name }}</span>
              <ToggleSwitch v-model="item.selected" :aria-label="`Include ${item.name} in ZIP`" />
            </span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
