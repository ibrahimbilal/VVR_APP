<script setup lang="ts" generic="T extends string">
export interface SettingsTabItem<Id extends string = string> {
  id: Id
  label: string
}

defineProps<{
  items: SettingsTabItem<T>[]
  cols?: 3 | 4
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="settings-tabs grid gap-1 px-3 py-3"
    :class="cols === 4 ? 'grid-cols-4' : 'grid-cols-3'"
    role="tablist"
  >
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
