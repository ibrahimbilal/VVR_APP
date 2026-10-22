<script setup lang="ts">
import { ImagePlus, Trash2, Upload } from '@lucide/vue'
import { ref } from 'vue'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()
const fileDrag = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
let dragDepth = 0

const accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm'

function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  return Array.from(types).includes('Files')
}

function onFileDragEnter(event: DragEvent) {
  if (!isFileDrag(event)) return
  dragDepth += 1
  fileDrag.value = true
}

function onFileDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) fileDrag.value = false
}

function onDrop(event: DragEvent) {
  dragDepth = 0
  fileDrag.value = false
  if (!isFileDrag(event)) return
  const file = event.dataTransfer?.files?.[0]
  if (file) void store.pickSource(file)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void store.pickSource(file)
  input.value = ''
}

function openPicker() {
  fileInput.value?.click()
}
</script>

<template>
  <section class="space-y-3">
    <h3 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Visual source</h3>

    <div
      v-if="store.objectUrl"
      class="rounded-lg border border-zinc-800 bg-[#16181d] p-3 transition-shadow"
      @dragenter.prevent="onFileDragEnter"
      @dragover.prevent
      @dragleave.prevent="onFileDragLeave"
      @drop.prevent="onDrop"
    >
      <div class="aspect-video overflow-hidden rounded-md bg-black">
        <img v-if="store.mediaKind === 'image'" :src="store.objectUrl" alt="" class="h-full w-full object-contain" />
        <video v-else :src="store.objectUrl" class="h-full w-full object-contain" muted playsinline />
      </div>
      <p class="mt-2 truncate text-sm font-semibold text-zinc-200">{{ store.fileName }}</p>
      <p class="text-xs text-zinc-500">
        {{ store.width }}×{{ store.height }}
        <span v-if="store.sourceDuration"> · {{ Math.round(store.sourceDuration) }}s</span>
        <span v-if="store.uploadState === 'uploading'"> · Uploading {{ Math.round(store.uploadProgress * 100) }}%</span>
        <span v-if="store.uploadState === 'ready'" class="text-emerald-400"> · Ready</span>
        <span v-if="store.uploadState === 'error'" class="text-red-300"> · {{ store.uploadError }}</span>
      </p>
      <p
        class="mt-3 flex flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center text-sm font-semibold"
        :class="fileDrag ? 'border-amber-300 bg-amber-300/10 text-amber-100' : 'border-zinc-600 bg-[#101114] text-zinc-100'"
      >
        <Upload :size="16" />
        <span>{{ fileDrag ? 'Drop to replace' : 'Drop a new file here' }}</span>
        <span class="text-[11px] font-normal text-zinc-500">or use Replace below</span>
      </p>
      <div class="mt-2 flex gap-2">
        <button class="btn btn-ghost cursor-pointer flex-1" type="button" @click="openPicker">
          <ImagePlus :size="16" />
          Replace
        </button>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="store.removeSource()">
          <Trash2 :size="16" />
          Remove
        </button>
      </div>
    </div>

    <button
      v-else
      class="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-8 text-sm font-semibold transition-shadow"
      :class="fileDrag ? 'border-amber-300 bg-amber-300/10 text-amber-100' : 'border-zinc-600 bg-[#101114] text-zinc-100'"
      type="button"
      @click="openPicker"
      @dragenter.prevent="onFileDragEnter"
      @dragover.prevent
      @dragleave.prevent="onFileDragLeave"
      @drop.prevent="onDrop"
    >
      <Upload :size="18" />
      <span>{{ fileDrag ? 'Drop to upload' : 'Drop image or video here' }}</span>
      <span class="text-[11px] font-normal text-zinc-500">or click to browse</span>
      <span class="mt-1 text-[11px] font-normal text-zinc-600">JPG, PNG, WebP, MP4, MOV, WebM</span>
    </button>

    <input ref="fileInput" class="hidden" type="file" :accept="accept" @change="onFileChange" />
  </section>
</template>
