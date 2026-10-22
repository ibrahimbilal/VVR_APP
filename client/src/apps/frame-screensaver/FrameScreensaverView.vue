<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ScreensaverExportBar from './components/ScreensaverExportBar.vue'
import EditorCanvas from './components/EditorCanvas.vue'
import ScreensaverMediaPanel from './components/ScreensaverMediaPanel.vue'
import ScreensaverSettingsPanel from './components/ScreensaverSettingsPanel.vue'
import { useScreensaverStore } from './stores/screensaver'

const store = useScreensaverStore()
const customMinutes = ref(60)

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

onMounted(() => {
  void store.init()
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
    <div class="flex min-h-0 flex-1 flex-col p-4">
      <EditorCanvas class="min-h-0 flex-1" />
      <div class="mt-4 shrink-0">
        <ScreensaverExportBar />
      </div>
    </div>
    <div v-if="!store.hydrated" class="absolute inset-0 z-30 grid place-items-center bg-[#101114]/90 text-sm text-zinc-300">
      Restoring saved project…
    </div>
  </div>
</template>
