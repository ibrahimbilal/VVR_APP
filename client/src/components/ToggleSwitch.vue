<script setup lang="ts">
defineProps<{
  disabled?: boolean
  ariaLabel?: string
}>()

const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="toggle-switch" :class="{ 'toggle-switch--disabled': disabled }">
    <input
      v-model="model"
      type="checkbox"
      class="toggle-switch__input"
      :disabled="disabled"
      :aria-label="ariaLabel"
    />
    <span class="toggle-switch__track" aria-hidden="true">
      <span class="toggle-switch__thumb" />
    </span>
  </label>
</template>
