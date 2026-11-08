<script setup lang="ts">
import { MonitorPlay, SlidersHorizontal } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppMobileTabs from '../../components/ui/AppMobileTabs.vue'
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
const tab = ref<'settings' | 'preview'>('preview')
const tabs = [
  { id: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
  { id: 'preview' as const, label: 'Preview', icon: MonitorPlay },
]
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
    <AppMobileTabs v-model="tab" :items="tabs" />

    <aside
      class="min-h-0 shrink-0 overflow-y-auto border-b border-zinc-800 p-4 lg:h-full lg:w-[360px] lg:border-b-0 lg:border-r"
      :class="tab === 'settings' ? 'flex max-h-none flex-1 flex-col' : 'hidden lg:flex lg:max-h-none lg:flex-none lg:flex-col'"
    >
      <label class="mb-4 block">
        <span class="mb-1 block section-label">Project</span>
        <input v-model="store.name" class="field text-sm font-semibold" type="text" maxlength="80" />
      </label>
      <ScreensaverMediaPanel />
      <div class="mt-6">
        <ScreensaverSettingsPanel v-model:custom-minutes="customMinutes" />
      </div>
    </aside>

    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      :class="tab === 'preview' ? 'flex' : 'hidden lg:flex'"
    >
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 lg:overflow-hidden">
        <EditorCanvas class="mb-3 flex min-h-0 w-full min-w-0 flex-1 flex-col lg:mb-2" />
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
      <ScreensaverExportDetails class="lg:hidden" />
    </div>

    <ScreensaverExportDetails class="hidden lg:flex" />

    <div v-if="!store.hydrated" class="scrim">
      Restoring saved project…
    </div>
    <ScreensaverDiagnostics v-if="showDiagnostics" />
  </div>
</template>
