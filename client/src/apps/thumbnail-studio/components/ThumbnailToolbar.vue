<script setup lang="ts">
import { ArrowLeft, Eye, FolderOpen, Redo2, Save, Undo2, ZoomIn, ZoomOut } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { createThumbnailFromScreensaver } from '../../frame-screensaver/lib/createThumbnail'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()
const router = useRouter()
const emit = defineEmits<{ newProject: [] }>()

function back(): void {
  const path = store.project.returnPath
  if (path) void router.push(path)
}

async function refreshSource(): Promise<void> {
  if (store.project.sourceApp === 'frame-screensaver') await createThumbnailFromScreensaver('linked')
}
</script>

<template>
  <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
    <input
      class="field w-40 text-sm font-semibold sm:w-56"
      :value="store.project.name"
      aria-label="Project name"
      @focus="store.beginGesture()"
      @input="store.setName(($event.target as HTMLInputElement).value)"
      @blur="store.endGesture()"
    />
    <button class="btn btn-ghost cursor-pointer" type="button" @click="emit('newProject')">New</button>
    <button class="btn btn-ghost cursor-pointer" type="button" @click="store.projectsOpen = true">
      <FolderOpen :size="16" />
      Open
    </button>
    <button class="btn btn-ghost cursor-pointer" type="button" :disabled="!store.dirty && store.persisted" @click="store.saveNow()">
      <Save :size="16" />
      Save
    </button>
    <button class="btn btn-ghost cursor-pointer" type="button" :disabled="!store.canUndoEdit" aria-label="Undo" @click="store.undo()">
      <Undo2 :size="16" />
    </button>
    <button class="btn btn-ghost cursor-pointer" type="button" :disabled="!store.canRedoEdit" aria-label="Redo" @click="store.redo()">
      <Redo2 :size="16" />
    </button>
    <button class="btn btn-ghost cursor-pointer" type="button" aria-label="Zoom out" @click="store.zoom = Math.max(0.4, store.zoom - 0.15)">
      <ZoomOut :size="16" />
    </button>
    <button class="btn btn-ghost cursor-pointer" type="button" @click="store.zoom = 1">Fit</button>
    <button class="btn btn-ghost cursor-pointer" type="button" aria-label="Zoom in" @click="store.zoom = Math.min(3, store.zoom + 0.15)">
      <ZoomIn :size="16" />
    </button>
    <button class="btn cursor-pointer" :class="store.mode === 'quick' ? 'btn-primary' : 'btn-ghost'" type="button" @click="store.mode = 'quick'">Quick</button>
    <button class="btn cursor-pointer" :class="store.mode === 'advanced' ? 'btn-primary' : 'btn-ghost'" type="button" @click="store.mode = 'advanced'">Advanced</button>
    <button class="btn btn-ghost cursor-pointer" type="button" @click="store.previewOpen = !store.previewOpen">
      <Eye :size="16" />
      Preview
    </button>
    <button class="btn btn-primary cursor-pointer" type="button" @click="store.exportOpen = true">Export</button>
    <button v-if="store.project.returnPath" class="btn btn-ghost cursor-pointer" type="button" @click="back">
      <ArrowLeft :size="16" />
      Back
    </button>
    <button
      v-if="store.project.linkMode === 'linked' && store.project.sourceApp === 'frame-screensaver'"
      class="btn btn-ghost cursor-pointer"
      type="button"
      @click="refreshSource"
    >
      Update from source
    </button>
  </div>
</template>
