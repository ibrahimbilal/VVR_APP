<script setup lang="ts">
defineProps<{
  label: string
  modelValue: number
  min: number
  max: number
  step?: number
  suffix?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number]; change: [] }>()

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  emit('update:modelValue', Number(target.value))
}
</script>

<template>
  <label class="block">
    <span class="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-400">
      <span>{{ label }}</span>
      <span class="tabular-nums text-zinc-200">{{ modelValue }}{{ suffix }}</span>
    </span>
    <input
      class="w-full cursor-pointer"
      type="range"
      :min="min"
      :max="max"
      :step="step ?? 1"
      :value="modelValue"
      @input="onInput"
      @change="emit('change')"
    />
  </label>
</template>
