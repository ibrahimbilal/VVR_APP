<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue'

export interface MobileTabItem<Id extends string = string> {
  id: Id
  label: string
  icon: Component
}

withDefaults(
  defineProps<{
    items: MobileTabItem<T>[]
    hideFrom?: 'lg' | 'xl'
  }>(),
  { hideFrom: 'lg' },
)

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="flex shrink-0 gap-2 border-b border-zinc-800 p-2"
    :class="hideFrom === 'xl' ? 'xl:hidden' : 'lg:hidden'"
    role="tablist"
  >
    <button
      v-for="item in items"
      :key="item.id"
      class="settings-tab btn flex-1 cursor-pointer"
      :class="model === item.id ? 'btn-primary settings-tab--active' : 'btn-ghost'"
      type="button"
      role="tab"
      :aria-selected="model === item.id"
      @click="model = item.id"
    >
      <component :is="item.icon" :size="16" />
      {{ item.label }}
    </button>
  </div>
</template>
