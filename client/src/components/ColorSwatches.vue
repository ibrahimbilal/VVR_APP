<script setup lang="ts">
import { useProjectStore } from '../stores/project'

defineProps<{ modelValue?: string | null }>()
const emit = defineEmits<{ pick: [color: string] }>()
const store = useProjectStore()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="color in store.activeColors"
      :key="color"
      class="h-7 w-7 cursor-pointer rounded-full border"
      :class="modelValue?.toLowerCase() === color.toLowerCase() ? 'border-white ring-2 ring-white/70' : 'border-white/20'"
      :style="{ background: color }"
      type="button"
      :aria-label="`Use color ${color}`"
      @click="emit('pick', color)"
    ></button>
  </div>
</template>
