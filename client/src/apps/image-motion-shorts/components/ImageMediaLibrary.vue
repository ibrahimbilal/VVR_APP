<script setup lang="ts">
import { ChevronDown, ChevronUp, GripVertical, Replace, Trash2 } from '@lucide/vue'
import { ref } from 'vue'
import FileDropZone from '../../../components/FileDropZone.vue'
import { formatClock } from '../../../lib/format'
import { useImageMotionStore } from '../stores/imageMotion'

const store = useImageMotionStore()
const dragIndex = ref<number | null>(null)
const replaceInput = ref<HTMLInputElement | null>(null)
const replaceId = ref<string | null>(null)

function onFiles(files: File[]) {
  if (files.length) void store.addFiles(files)
}

function onDragStart(event: DragEvent, index: number) {
  dragIndex.value = index
  event.dataTransfer?.setData('text/plain', String(index))
}

function onDrop(index: number) {
  if (dragIndex.value == null) return
  store.reorder(dragIndex.value, index)
  dragIndex.value = null
}

function pickReplace(id: string) {
  replaceId.value = id
  replaceInput.value?.click()
}

function onReplace(event: Event) {
  const target = event.target
  const id = replaceId.value
  if (!(target instanceof HTMLInputElement) || !target.files?.[0] || !id) return
  void store.replaceSegment(id, target.files[0])
  target.value = ''
}

function aspect(width: number, height: number): string {
  if (!width || !height) return ''
  return `${(width / height).toFixed(2)}:1`
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col bg-sidebar">
    <div class="space-y-3 border-b border-zinc-800 p-4">
      <label class="block">
        <span class="section-label mb-1 block">Project</span>
        <input v-model="store.name" class="field text-sm font-semibold" type="text" maxlength="80" />
      </label>
      <FileDropZone
        compact
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        label="Drop images here"
        formats="JPG, PNG, WebP"
        @files="onFiles"
      />
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <p v-if="store.segments.length === 0" class="px-2 py-8 text-center text-sm text-zinc-500">
        Drop JPG, PNG, or WebP files here. Export stays off until there is at least one image.
      </p>
      <article
        v-for="(segment, index) in store.segments"
        :key="segment.id"
        class="cursor-pointer rounded-lg border bg-inset p-2"
        :class="[
          store.selectedSegmentId === segment.id ? 'border-zinc-200' : 'border-zinc-800',
          dragIndex === index ? 'opacity-50' : '',
        ]"
        @click="store.selectSegment(segment.id)"
        @dragover.prevent
        @drop.prevent="onDrop(index)"
      >
        <div class="flex gap-2">
          <button
            class="mt-1 w-5 shrink-0 cursor-grab text-zinc-500"
            type="button"
            draggable="true"
            aria-label="Drag to reorder"
            @dragstart="onDragStart($event, index)"
            @dragend="dragIndex = null"
          >
            <GripVertical :size="16" />
          </button>
          <div class="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-zinc-900">
            <img v-if="store.objectUrlFor(segment.id)" :src="store.objectUrlFor(segment.id)!" alt="" class="h-full w-full object-cover" />
            <span v-else class="flex h-full items-center justify-center text-[10px] text-zinc-600">{{ index + 1 }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center gap-2 text-xs text-zinc-500">
              <span class="font-semibold text-brand">{{ index + 1 }}</span>
              <span>{{ segment.serverId ? 'Ready' : 'Uploading' }}</span>
              <span class="ml-auto tabular-nums">{{ formatClock(segment.motion.duration) }}</span>
            </div>
            <p class="truncate text-sm font-semibold text-zinc-100" :title="segment.fileName">{{ segment.fileName }}</p>
            <p class="mt-0.5 text-xs text-zinc-500">
              {{ segment.width }}×{{ segment.height }}
              <span v-if="aspect(segment.width, segment.height)"> · {{ aspect(segment.width, segment.height) }}</span>
            </p>
          </div>
        </div>
        <label class="mt-2 flex items-center gap-2 text-xs text-zinc-400" @click.stop>
          Duration
          <input
            class="field w-20 py-1 tabular-nums"
            type="number"
            min="0.3"
            step="0.5"
            :value="segment.motion.duration"
            @change="store.setSegmentDuration(segment.id, Number(($event.target as HTMLInputElement).value))"
          />
          <span>seconds</span>
        </label>
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn cursor-pointer btn-ghost px-2 py-1" type="button" aria-label="Move up" title="Move up" :disabled="index === 0" @click.stop="store.reorder(index, index - 1)">
            <ChevronUp :size="16" />
          </button>
          <button class="btn cursor-pointer btn-ghost px-2 py-1" type="button" aria-label="Move down" title="Move down" :disabled="index === store.segments.length - 1" @click.stop="store.reorder(index, index + 1)">
            <ChevronDown :size="16" />
          </button>
          <button class="btn cursor-pointer btn-ghost px-2 py-1" type="button" aria-label="Replace image" title="Replace image" @click.stop="pickReplace(segment.id)">
            <Replace :size="16" />
          </button>
          <button class="btn cursor-pointer btn-danger ml-auto px-2 py-1" type="button" aria-label="Remove image" title="Remove image" @click.stop="store.removeSegment(segment.id)">
            <Trash2 :size="16" />
          </button>
        </div>
      </article>
      <input ref="replaceInput" class="hidden" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" @change="onReplace" />
    </div>
  </aside>
</template>
