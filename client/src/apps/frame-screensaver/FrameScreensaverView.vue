<script setup lang="ts">
import { Image as ImageIcon, MonitorPlay, SlidersHorizontal } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppMobileTabs from '../../components/ui/AppMobileTabs.vue'
import AppStudioExportBar from '../../components/ui/AppStudioExportBar.vue'
import CreateThumbnailAction from '../../components/CreateThumbnailAction.vue'
import { createThumbnailFromScreensaver } from './lib/createThumbnail'
import ScreensaverExportBar from './components/ScreensaverExportBar.vue'
import ScreensaverExportDetails from './components/ScreensaverExportDetails.vue'
import EditorCanvas from './components/EditorCanvas.vue'
import ScreensaverMediaPanel from './components/ScreensaverMediaPanel.vue'
import ScreensaverDiagnostics from './components/ScreensaverDiagnostics.vue'
import ScreensaverSettingsPanel from './components/ScreensaverSettingsPanel.vue'
import { installPreviewBenchHook } from './lib/benchPreview'
import { screensaverDiagnosticsEnabled } from './lib/previewMetrics'
import { useScreensaverStore } from './stores/screensaver'

const store = useScreensaverStore()
const customMinutes = ref(60)
const linkThumbnail = ref(false)
const tab = ref<'source' | 'preview' | 'settings'>('preview')
const tabs = [
  { id: 'source' as const, label: 'Source', icon: ImageIcon },
  { id: 'preview' as const, label: 'Preview', icon: MonitorPlay },
  { id: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
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
  <div class="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
    <AppMobileTabs v-model="tab" :items="tabs" />

    <aside
      class="studio-panel flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto p-4 lg:h-full lg:w-[300px] lg:max-w-[300px] lg:flex-none"
      :class="tab === 'source' ? 'max-h-none flex-1' : 'hidden lg:flex'"
    >
      <label class="block">
        <span class="section-label mb-1 block">Project</span>
        <input v-model="store.name" class="field text-sm font-semibold" type="text" maxlength="80" />
      </label>
      <ScreensaverMediaPanel />
    </aside>

    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
      :class="tab === 'preview' ? 'flex' : 'hidden lg:flex'"
    >
      <div class="studio-stage flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden p-3">
        <EditorCanvas class="flex min-h-0 w-full min-w-0 flex-1 flex-col" />
      </div>
      <AppStudioExportBar :status="`${store.durationLabel} · ${store.outputWidth}×${store.outputHeight}`">
        <template #actions>
          <CreateThumbnailAction
            v-model:link="linkThumbnail"
            :disabled="!canThumbnail"
            @create="createThumbnailFromScreensaver(linkThumbnail ? 'linked' : 'snapshot')"
          />
        </template>
        <ScreensaverExportBar />
      </AppStudioExportBar>
      <ScreensaverExportDetails class="lg:hidden" />
    </div>

    <aside
      class="studio-panel flex min-h-0 w-full shrink-0 flex-col lg:h-full lg:w-[360px] lg:max-w-[360px] lg:flex-none"
      :class="tab === 'settings' ? 'max-h-none flex-1' : 'hidden lg:flex'"
    >
      <ScreensaverSettingsPanel v-model:custom-minutes="customMinutes" class="min-h-0 flex-1" />
    </aside>

    <ScreensaverExportDetails class="hidden lg:flex" />

    <div v-if="!store.hydrated" class="scrim">
      Restoring saved project…
    </div>
    <ScreensaverDiagnostics v-if="showDiagnostics" />
  </div>
</template>
