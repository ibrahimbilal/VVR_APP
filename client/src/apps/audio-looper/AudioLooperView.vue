<script setup lang="ts">
import { AudioLines, MonitorPlay, SlidersHorizontal } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import AppMobileTabs from '../../components/ui/AppMobileTabs.vue'
import AppStudioExportBar from '../../components/ui/AppStudioExportBar.vue'
import LooperExportBar from './components/LooperExportBar.vue'
import LooperPreview from './components/LooperPreview.vue'
import LooperSettings from './components/LooperSettings.vue'
import LooperSourcePanel from './components/LooperSourcePanel.vue'
import { useAudioLooperStore } from './stores/audioLooper'

const store = useAudioLooperStore()
const hasSource = computed(() => store.hasSource)
const tab = ref<'source' | 'preview' | 'settings'>(store.hasSource ? 'preview' : 'source')
const tabs = [
  { id: 'source' as const, label: 'Source', icon: AudioLines },
  { id: 'preview' as const, label: 'Preview', icon: MonitorPlay },
  { id: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
]

watch(hasSource, (has) => {
  if (!has) tab.value = 'source'
  else if (tab.value === 'source') tab.value = 'preview'
})
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
    <AppMobileTabs v-model="tab" :items="tabs" />

    <aside
      class="studio-panel flex min-h-0 w-full shrink-0 flex-col overflow-hidden lg:h-full lg:w-[300px] lg:max-w-[300px] lg:flex-none"
      :class="tab === 'source' ? 'max-h-none flex-1' : 'hidden lg:flex'"
    >
      <LooperSourcePanel class="min-h-0 flex-1" />
    </aside>

    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
      :class="tab === 'preview' ? 'flex' : 'hidden lg:flex'"
    >
      <div class="studio-stage flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden p-3">
        <LooperPreview v-if="hasSource" class="min-h-0 flex-1 overflow-y-auto" />
        <div v-else class="grid min-h-0 flex-1 place-items-center px-6 text-center text-sm text-zinc-500">
          Add audio in the source panel.
        </div>
      </div>
      <AppStudioExportBar
        :status="store.exportStatusLabel"
      >
        <LooperExportBar />
      </AppStudioExportBar>
    </div>

    <aside
      class="studio-panel flex min-h-0 w-full shrink-0 flex-col lg:h-full lg:w-[360px] lg:max-w-[360px] lg:flex-none"
      :class="tab === 'settings' ? 'max-h-none flex-1' : 'hidden lg:flex'"
    >
      <LooperSettings class="min-h-0 flex-1" />
    </aside>
  </div>
</template>
