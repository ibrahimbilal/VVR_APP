<script setup lang="ts">
import type { ShortsEditorMode } from '../lib/shortsMode'

const model = defineModel<ShortsEditorMode>({ required: true })

const items = [
  { id: 'ranking' as const, label: 'Ranking Shorts' },
  { id: 'image-motion' as const, label: 'Image Motion Shorts' },
]
</script>

<template>
  <div class="settings-tabs grid grid-cols-2 gap-1" role="tablist" aria-label="Shorts editor mode">
    <button
      v-for="item in items"
      :key="item.id"
      class="settings-tab btn cursor-pointer px-1 text-xs"
      :class="model === item.id ? 'btn-primary settings-tab--active' : 'btn-ghost'"
      type="button"
      role="tab"
      :aria-selected="model === item.id"
      @click="model = item.id"
    >
      {{ item.label }}
    </button>
  </div>
</template>
