<script setup lang="ts">
import { AudioLines, SlidersHorizontal } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import AppMobileTabs from '../../components/ui/AppMobileTabs.vue'
import LooperExportBar from './components/LooperExportBar.vue'
import LooperPreview from './components/LooperPreview.vue'
import LooperSettings from './components/LooperSettings.vue'
import LooperSourcePanel from './components/LooperSourcePanel.vue'
import { useAudioLooperStore } from './stores/audioLooper'

const store = useAudioLooperStore()
const tab = ref<'settings' | 'preview'>('settings')
const hasSource = computed(() => Boolean(store.objectUrl))
const tabs = [
  { id: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
  { id: 'preview' as const, label: 'Preview', icon: AudioLines },
]

watch(hasSource, (loaded) => {
  tab.value = loaded ? 'preview' : 'settings'
})
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
    <AppMobileTabs v-model="tab" :items="tabs" />

    <aside
      class="min-h-0 shrink-0 overflow-y-auto border-b border-zinc-800 p-4 lg:h-full lg:w-[360px] lg:border-b-0 lg:border-r"
      :class="tab === 'settings' ? 'flex max-h-none flex-col' : 'hidden lg:flex lg:max-h-none lg:flex-col'"
    >
      <label class="mb-4 block">
        <span class="section-label mb-1 block">Project</span>
        <input v-model="store.name" class="field text-sm font-semibold" type="text" maxlength="80" />
      </label>
      <LooperSourcePanel />
      <div class="mt-6">
        <LooperSettings />
      </div>
    </aside>

    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      :class="tab === 'preview' ? 'flex' : 'hidden lg:flex'"
    >
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
        <LooperPreview v-if="hasSource" class="min-h-0 flex-1" />
        <div class="shrink-0 mt-auto" :class="hasSource ? 'mt-4' : ''">
          <LooperExportBar />
        </div>
      </div>
    </div>
  </div>
</template>
