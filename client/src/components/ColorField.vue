<script setup lang="ts">
import ColorSwatches from './ColorSwatches.vue'

defineProps<{ label: string; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="space-y-2 py-1">
    <label class="flex items-center justify-between gap-3">
      <span class="text-xs text-zinc-400">{{ label }}</span>
      <span class="flex items-center gap-2">
        <span class="text-[11px] uppercase tabular-nums text-zinc-500">{{ modelValue }}</span>
        <input type="color" :value="modelValue" :aria-label="`${label} custom color`" @input="onInput" />
      </span>
    </label>
    <ColorSwatches :model-value="modelValue" @pick="emit('update:modelValue', $event)" />
  </div>
</template>
