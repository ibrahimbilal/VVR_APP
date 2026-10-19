<script setup lang="ts">
defineProps<{ label: string; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  emit('update:modelValue', target.value)
}
</script>

<template>
  <label class="flex items-center justify-between gap-3 py-1">
    <span class="text-xs text-zinc-400">{{ label }}</span>
    <span class="flex items-center gap-2">
      <span class="text-[11px] uppercase tabular-nums text-zinc-500">{{ modelValue }}</span>
      <input type="color" :value="modelValue" @input="onInput" />
    </span>
  </label>
</template>
