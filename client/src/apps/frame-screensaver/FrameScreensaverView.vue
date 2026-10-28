<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createThumbnailFromScreensaver } from './lib/createThumbnail'
import ScreensaverExportBar from './components/ScreensaverExportBar.vue'
import ScreensaverExportDetails from './components/ScreensaverExportDetails.vue'
import EditorCanvas from './components/EditorCanvas.vue'
import ScreensaverMediaPanel from './components/ScreensaverMediaPanel.vue'
import ScreensaverDiagnostics from './components/ScreensaverDiagnostics.vue'
import ScreensaverSettingsPanel from './components/ScreensaverSettingsPanel.vue'
import { installPreviewBenchHook } from './lib/benchPreview'
import { screensaverDiagnosticsEnabled } from './lib/previewMetrics'
import ToggleSwitch from '../../components/ToggleSwitch.vue'
import { useScreensaverStore } from './stores/screensaver'

const store = useScreensaverStore()
const customMinutes = ref(60)
const linkThumbnail = ref(false)
const canThumbnail = computed(() => (store.mediaKind === 'image' && Boolean(store.objectUrl)) || Boolean(store.thumbnail?.startsWith('data:')))

function onKey(event: KeyboardEvent) {
  const target = event.target
  if (target instanceof HTMLElement) {
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
  }
  const meta = event.ctrlKey || event.metaKey
  if (!meta || event.key.toLowerCase() !== 'z') return
  event.preventDefault()
  if (event.shiftKey) store.redo()
  else store.undo()
}

const showDiagnostics = screensaverDiagnosticsEnabled()

onMounted(() => {
  void store.init()
  installPreviewBenchHook()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
    <aside class="h-full max-h-[45vh] shrink-0 overflow-y-auto border-b border-zinc-800 p-4 lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r">
      <input v-model="store.name" class="field mb-4 text-sm font-semibold" type="text" aria-label="Project name" />
      <ScreensaverMediaPanel />
      <div class="mt-6">
        <ScreensaverSettingsPanel v-model:custom-minutes="customMinutes" />
      </div>
    </aside>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 lg:overflow-hidden">
      <EditorCanvas class="mb-3 flex min-h-0 w-full flex-1 flex-col lg:mb-2" />
      <div class="shrink-0 space-y-3">
        <ScreensaverExportBar />
        <div class="flex flex-wrap items-center gap-3">
          <button
            class="btn btn-ghost cursor-pointer"
            type="button"
            :disabled="!canThumbnail"
            @click="createThumbnailFromScreensaver(linkThumbnail ? 'linked' : 'snapshot')"
          >
            Create Thumbnail
          </button>
          <div class="flex items-center gap-2 text-xs text-zinc-400">
            <ToggleSwitch v-model="linkThumbnail" aria-label="Link to source" />
            <span>Link to source</span>
          </div>
        </div>
      </div>
    </div>
    <ScreensaverExportDetails />
    <div v-if="!store.hydrated" class="absolute inset-0 z-30 grid place-items-center bg-[#101114]/90 text-sm text-zinc-300">
      Restoring saved project…
    </div>
    <ScreensaverDiagnostics v-if="showDiagnostics" />
  </div>
</template>
