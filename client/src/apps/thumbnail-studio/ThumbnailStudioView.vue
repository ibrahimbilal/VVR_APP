<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ThumbnailCanvas from './components/ThumbnailCanvas.vue'
import ThumbnailExportDialog from './components/ThumbnailExportDialog.vue'
import ThumbnailProperties from './components/ThumbnailProperties.vue'
import ThumbnailSidebar from './components/ThumbnailSidebar.vue'
import ThumbnailToolbar from './components/ThumbnailToolbar.vue'
import { renderThumbnail } from './lib/renderThumbnail'
import { useThumbnailStore } from './stores/thumbnail'

const store = useThumbnailStore()
const blankPrompt = ref(false)
const previewUrls = ref<string[]>([])

function onKey(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof HTMLElement) {
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
  }
  const meta = event.ctrlKey || event.metaKey
  if (meta && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) store.redo()
    else store.undo()
    return
  }
  if (meta && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    store.duplicate()
    return
  }
  const step = event.shiftKey ? 0.05 : 0.01
  if (event.key === 'ArrowLeft') store.nudge(-step, 0)
  else if (event.key === 'ArrowRight') store.nudge(step, 0)
  else if (event.key === 'ArrowUp') store.nudge(0, -step)
  else if (event.key === 'ArrowDown') store.nudge(0, step)
  else if (event.key === 'Delete' || event.key === 'Backspace') store.removeSelected()
}

function requestNew(): void {
  if (store.dirty) blankPrompt.value = true
  else void store.createBlank()
}

async function saveAndNew(): Promise<void> {
  await store.saveNow()
  blankPrompt.value = false
  await store.createBlank()
}

async function discardNew(): Promise<void> {
  blankPrompt.value = false
  await store.createBlank()
}

function refreshPreviews(): void {
  for (const url of previewUrls.value) URL.revokeObjectURL(url)
  const widths = [store.project.aspect === '9:16' ? 180 : 320, 160, 120]
  previewUrls.value = widths.map((maxEdge) => {
    const canvas = renderThumbnail(store.project, store.renderAssets(), { maxEdge, checker: false, safeArea: false })
    return canvas.toDataURL('image/jpeg', 0.8)
  })
}

onMounted(() => {
  void store.init().then(() => store.consumeStoredTransfer())
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col overflow-hidden">
    <ThumbnailToolbar @new-project="requestNew" />
    <div class="flex min-h-0 flex-1 flex-col xl:flex-row">
      <ThumbnailSidebar />
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <ThumbnailCanvas />
        <div v-if="store.previewOpen" class="flex shrink-0 gap-3 overflow-x-auto border-t border-zinc-800 p-3">
          <button class="btn btn-ghost cursor-pointer" type="button" @click="refreshPreviews">Refresh sizes</button>
          <figure v-for="(url, index) in previewUrls" :key="url" class="shrink-0">
            <img :src="url" alt="" :class="index === 0 ? 'h-24' : index === 1 ? 'h-16' : 'h-12'" class="rounded border border-zinc-800 object-contain" />
            <figcaption class="mt-1 text-[10px] uppercase text-zinc-500">{{ index === 0 ? 'Desktop' : index === 1 ? 'Mobile' : 'Compact' }}</figcaption>
          </figure>
        </div>
      </div>
      <ThumbnailProperties v-if="store.mode === 'advanced'" />
    </div>
    <div v-if="!store.hydrated" class="absolute inset-0 z-30 grid place-items-center bg-[#101114]/90 text-sm text-zinc-300">
      Restoring saved project…
    </div>
    <ThumbnailExportDialog v-if="store.exportOpen" />
    <div v-if="store.promptOpen" class="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <div class="w-full max-w-md rounded-lg border border-zinc-800 bg-[#14161c] p-4">
        <h2 class="text-lg font-bold">Replace the open thumbnail?</h2>
        <p class="mt-2 text-sm text-zinc-400">A project is already open. The transferred image will not overwrite it unless you choose to.</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn btn-ghost cursor-pointer" type="button" @click="store.acceptTransfer('keep')">Keep current</button>
          <button class="btn btn-ghost cursor-pointer" type="button" @click="store.acceptTransfer('save-new')">Save and start new</button>
          <button class="btn btn-primary cursor-pointer" type="button" @click="store.acceptTransfer('replace')">Replace</button>
        </div>
      </div>
    </div>
    <div v-if="blankPrompt" class="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <div class="w-full max-w-md rounded-lg border border-zinc-800 bg-[#14161c] p-4">
        <h2 class="text-lg font-bold">Save this thumbnail first?</h2>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn btn-ghost cursor-pointer" type="button" @click="blankPrompt = false">Cancel</button>
          <button class="btn btn-ghost cursor-pointer" type="button" @click="discardNew">Discard</button>
          <button class="btn btn-primary cursor-pointer" type="button" @click="saveAndNew">Save</button>
        </div>
      </div>
    </div>
    <div v-if="store.projectsOpen" class="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <div class="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-800 bg-[#14161c] p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold">Open project</h2>
          <button class="btn btn-ghost cursor-pointer" type="button" @click="store.projectsOpen = false">Close</button>
        </div>
        <p v-if="store.catalog.length === 0" class="mt-3 text-sm text-zinc-400">No saved thumbnails yet.</p>
        <article v-for="item in store.catalog" :key="item.id" class="mt-3 flex items-center justify-between gap-3 rounded border border-zinc-800 p-3">
          <div>
            <p class="font-semibold">{{ item.name }}</p>
            <p class="text-xs text-zinc-500">{{ item.width }}×{{ item.height }}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-primary cursor-pointer" type="button" @click="store.openSaved(item.id)">Open</button>
            <button class="btn btn-danger cursor-pointer" type="button" @click="store.deleteSaved(item.id)">Delete</button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
