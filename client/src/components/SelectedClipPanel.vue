<script setup lang="ts">
import { Undo2, X } from '@lucide/vue'
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import ColorSwatches from './ColorSwatches.vue'
import FileDropZone from './FileDropZone.vue'
import SliderField from './SliderField.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const store = useProjectStore()

const keptLabel = computed(() => {
  const clip = store.selectedClip
  if (!clip) return '0'
  return secondsLabel(clip.trimEnd - clip.trimStart)
})
const totalLabel = computed(() => {
  const clip = store.selectedClip
  if (!clip) return '0'
  return secondsLabel(clip.duration)
})

function secondsLabel(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < 0.05) return String(rounded)
  return value.toFixed(1)
}

function onReplaceFiles(files: File[]) {
  const id = store.selectedClipId
  const file = files[0]
  if (!id || !file) return
  void store.attachFile(id, file)
}

function onCustomColor(event: Event) {
  const target = event.target
  const id = store.selectedClipId
  if (!(target instanceof HTMLInputElement) || !id) return
  store.setRankColor(id, target.value)
}

function onTitleColor(event: Event) {
  const target = event.target
  const id = store.selectedClipId
  if (!(target instanceof HTMLInputElement) || !id) return
  store.setTitleColor(id, target.value)
}
</script>

<template>
  <aside v-if="store.selectedClip" class="flex min-h-0 flex-col border-zinc-800 bg-[#16181d] xl:border-r">
    <div class="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Selected clip</p>
      <button class="text-zinc-400 cursor-pointer" type="button" aria-label="Close selected clip" title="Close" @click="store.closeSelectedPanel">
        <X :size="16" />
      </button>
    </div>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <p class="truncate text-sm">{{ store.selectedClip.title }}</p>
      <label class="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-[#101114] px-3 py-2 text-xs text-zinc-200">
        <span>
          <span class="block font-semibold">Play at the end</span>
          <span class="mt-1 block text-[11px] leading-relaxed text-zinc-500">This clip stays in the list, but the video and the ranking play it last. Only one clip can be last.</span>
        </span>
        <ToggleSwitch
          :model-value="store.selectedClip.playAtEnd"
          aria-label="Play at the end"
          @update:model-value="store.setPlayAtEnd(store.selectedClip.id, $event)"
        />
      </label>
      <div v-if="store.selectedClip.duration > 0" class="space-y-2">
        <SliderField
          label="Trim start"
          :model-value="store.selectedClip.trimStart"
          :min="0"
          :max="store.selectedClip.duration"
          :step="1"
          suffix="s"
          @update:model-value="store.setTrim(store.selectedClip.id, $event, store.selectedClip.trimEnd)"
        />
        <SliderField
          label="Trim end"
          :model-value="store.selectedClip.trimEnd"
          :min="0"
          :max="store.selectedClip.duration"
          :step="1"
          suffix="s"
          @update:model-value="store.setTrim(store.selectedClip.id, store.selectedClip.trimStart, $event)"
        />
        <p class="text-xs text-zinc-500">Keeping {{ keptLabel }}s of {{ totalLabel }}s</p>
      </div>
      <div class="space-y-2">
        <p class="text-xs text-zinc-400">Number color</p>
        <ColorSwatches :model-value="store.selectedClip.rankColor" @pick="store.setRankColor(store.selectedClip.id, $event)" />
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn cursor-pointer btn-ghost px-2 py-1">
            Custom
            <input
              type="color"
              :value="store.selectedClip.rankColor || store.style.ranking.color"
              aria-label="Custom number color"
              @input="onCustomColor"
            />
          </label>
          <button class="btn cursor-pointer btn-ghost px-2 py-1" type="button" aria-label="Use default number color" title="Use default number color" @click="store.setRankColor(store.selectedClip.id, null)">
            <Undo2 :size="16" />
          </button>
        </div>
      </div>
      <div class="space-y-2">
        <p class="text-xs text-zinc-400">Title color</p>
        <ColorSwatches :model-value="store.selectedClip.titleColor" @pick="store.setTitleColor(store.selectedClip.id, $event)" />
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn cursor-pointer btn-ghost px-2 py-1">
            Custom
            <input
              type="color"
              :value="store.selectedClip.titleColor || store.style.caption.color"
              aria-label="Custom title color"
              @input="onTitleColor"
            />
          </label>
          <button class="btn cursor-pointer btn-ghost px-2 py-1" type="button" aria-label="Use default title color" title="Use default title color" @click="store.setTitleColor(store.selectedClip.id, null)">
            <Undo2 :size="16" />
          </button>
        </div>
      </div>
      <FileDropZone
        compact
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
        label="Drop a video to replace"
        drop-label="Drop to replace"
        formats="MP4, MOV, WebM"
        @files="onReplaceFiles"
      />
    </div>
  </aside>
</template>
