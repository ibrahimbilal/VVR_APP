<script setup lang="ts">
import { ChevronDown, ChevronUp, FilePlus, GripVertical, Plus, Replace, RotateCcw, Trash2, Undo2, Upload } from '@lucide/vue'
import { ref } from 'vue'
import { formatClock, sourceLabel } from '../lib/format'
import { useProjectStore } from '../stores/project'
import SliderField from './SliderField.vue'

const store = useProjectStore()
const urlInput = ref('')
const dragIndex = ref<number | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const replaceInput = ref<HTMLInputElement | null>(null)

function submitUrl() {
  const value = urlInput.value
  urlInput.value = ''
  void store.addUrl(value)
}

function onFiles(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.files) return
  void store.addFiles(target.files)
  target.value = ''
}

function onReplace(event: Event) {
  const target = event.target
  const id = store.selectedClipId
  if (!(target instanceof HTMLInputElement) || !target.files?.[0] || !id) return
  void store.attachFile(id, target.files[0])
  target.value = ''
}

function onDropFiles(event: DragEvent) {
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    void store.addFiles(files)
    dragIndex.value = null
  }
}

function onDragStart(event: DragEvent, index: number) {
  dragIndex.value = index
  event.dataTransfer?.setData('application/x-vvr-clip', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDropItem(event: DragEvent, index: number) {
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    void store.addFiles(files)
    dragIndex.value = null
    return
  }
  const raw = event.dataTransfer?.getData('application/x-vvr-clip')
  const from = raw ? Number(raw) : dragIndex.value
  if (from == null || Number.isNaN(from)) return
  store.moveClip(from, index)
  dragIndex.value = null
}

function kept(duration: number, start: number, end: number): string {
  if (duration <= 0) return ''
  return formatClock(Math.max(0, end - start))
}
</script>

<template>
  <aside class="flex min-h-0 flex-col border-zinc-800 bg-[#16181d] xl:border-r">
    <div class="space-y-3 border-b border-zinc-800 p-4">
      <label class="block">
        <span class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Project</span>
        <input v-model="store.name" class="field" maxlength="80" />
      </label>
      <form class="flex gap-2" @submit.prevent="submitUrl">
        <input v-model="urlInput" class="field" placeholder="Paste a YouTube, TikTok, or Reel link" />
        <button class="btn btn-ghost shrink-0 px-2" type="submit" aria-label="Add link" title="Add link">
          <Plus :size="16" />
        </button>
      </form>
      <p v-if="store.urlNotice" class="text-xs leading-relaxed text-amber-200/90">{{ store.urlNotice }}</p>
      <button class="btn btn-primary w-full" type="button" @click="fileInput?.click()">
        <Upload :size="16" />
        Upload video
      </button>
      <input ref="fileInput" class="hidden" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" multiple @change="onFiles" />
      <p class="text-[11px] leading-relaxed text-zinc-500">
        Only use videos you own or have permission to use. A link is checked for a title when the platform allows it. It is not downloaded.
      </p>
    </div>

    <div
      class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
      @dragover.prevent
      @drop.prevent="onDropFiles"
    >
      <p v-if="store.clips.length === 0" class="px-2 py-8 text-center text-sm text-zinc-500">
        Drop MP4, MOV, or WebM files here. Export stays off until there are two clips.
      </p>
      <article
        v-for="(clip, index) in store.clips"
        :key="clip.id"
        class="rounded-lg border bg-[#101114] p-2"
        :class="[
          store.selectedClipId === clip.id ? 'border-zinc-200' : 'border-zinc-800',
          dragIndex === index ? 'opacity-50' : '',
        ]"
        @click="store.selectClip(clip.id)"
        @dragover.prevent
        @drop.prevent="onDropItem($event, index)"
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
            <img v-if="clip.thumbnail" :src="clip.thumbnail" alt="" class="h-full w-full object-cover" referrerpolicy="no-referrer" />
            <span v-else class="flex h-full items-center justify-center text-[10px] text-zinc-600">{{ index + 1 }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center gap-2 text-[11px] text-zinc-500">
              <span class="font-semibold text-amber-300">{{ index + 1 }}</span>
              <span>{{ sourceLabel(clip.source) }}</span>
              <span v-if="clip.duration > 0" class="ml-auto tabular-nums">{{ kept(clip.duration, clip.trimStart, clip.trimEnd) }}</span>
            </div>
            <input
              v-model="clip.title"
              class="field py-1"
              maxlength="120"
              @click.stop
            />
          </div>
        </div>
        <div v-if="clip.uploadState === 'uploading'" class="mt-2 h-1 overflow-hidden rounded bg-zinc-800">
          <div class="h-full bg-amber-300" :style="{ width: `${Math.round(clip.uploadProgress * 100)}%` }"></div>
        </div>
        <p v-if="clip.error" class="mt-2 text-xs text-red-300">{{ clip.error }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn btn-ghost px-2 py-1" type="button" aria-label="Move up" title="Move up" :disabled="index === 0" @click.stop="store.moveClip(index, index - 1)">
            <ChevronUp :size="16" />
          </button>
          <button class="btn btn-ghost px-2 py-1" type="button" aria-label="Move down" title="Move down" :disabled="index === store.clips.length - 1" @click.stop="store.moveClip(index, index + 1)">
            <ChevronDown :size="16" />
          </button>
          <button v-if="clip.uploadState === 'error'" class="btn btn-ghost px-2 py-1" type="button" aria-label="Retry upload" title="Retry upload" @click.stop="store.retryUpload(clip.id)">
            <RotateCcw :size="16" />
          </button>
          <button v-if="clip.uploadState === 'empty'" class="btn btn-ghost px-2 py-1" type="button" aria-label="Add file" title="Add file" @click.stop="replaceInput?.click()">
            <FilePlus :size="16" />
          </button>
          <button class="btn btn-danger ml-auto px-2 py-1" type="button" aria-label="Remove clip" title="Remove clip" @click.stop="store.removeClip(clip.id)">
            <Trash2 :size="16" />
          </button>
        </div>
      </article>
    </div>

    <div v-if="store.selectedClip" class="max-h-[46%] space-y-3 overflow-y-auto border-t border-zinc-800 p-4">
      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Selected clip</p>
      <p class="truncate text-sm">{{ store.selectedClip.title }}</p>
      <div v-if="store.selectedClip.duration > 0" class="space-y-2">
        <SliderField
          label="Trim start"
          :model-value="store.selectedClip.trimStart"
          :min="0"
          :max="store.selectedClip.duration"
          :step="0.1"
          suffix="s"
          @update:model-value="store.setTrim(store.selectedClip.id, $event, store.selectedClip.trimEnd)"
        />
        <SliderField
          label="Trim end"
          :model-value="store.selectedClip.trimEnd"
          :min="0"
          :max="store.selectedClip.duration"
          :step="0.1"
          suffix="s"
          @update:model-value="store.setTrim(store.selectedClip.id, store.selectedClip.trimStart, $event)"
        />
        <p class="text-xs text-zinc-500">
          Keeping {{ (store.selectedClip.trimEnd - store.selectedClip.trimStart).toFixed(1) }}s of {{ store.selectedClip.duration.toFixed(1) }}s
        </p>
      </div>
      <div>
        <p class="mb-2 text-xs text-zinc-400">Number color</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="color in ['#ffe14a', '#ff3b3b', '#3ee0ff', '#ffffff']"
            :key="color"
            class="h-7 w-7 rounded-full border border-white/20"
            :style="{ background: color }"
            type="button"
            :aria-label="`Set number color ${color}`"
            @click="store.setRankColor(store.selectedClip.id, color)"
          ></button>
          <button class="btn btn-ghost px-2 py-1" type="button" aria-label="Use default number color" title="Use default number color" @click="store.setRankColor(store.selectedClip.id, null)">
            <Undo2 :size="16" />
          </button>
        </div>
      </div>
      <button class="btn btn-ghost w-full" type="button" @click="replaceInput?.click()">
        <Replace :size="16" />
        Replace video file
      </button>
      <input ref="replaceInput" class="hidden" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" @change="onReplace" />
    </div>
  </aside>
</template>
