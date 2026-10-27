<script setup lang="ts">
import { computed } from 'vue'
import SliderField from '../SliderField.vue'

const keepAudio = defineModel<boolean>('keepAudio', { required: true })
const normalize = defineModel<boolean>('normalize', { required: true })
const originalVolume = defineModel<number>('originalVolume', { required: true })

const clipVolumeUi = computed({
  get: () => Math.round(originalVolume.value * 100),
  set: (value: number) => {
    originalVolume.value = value / 100
  },
})
</script>

<template>
  <div class="space-y-3">
    <label class="flex items-center justify-between text-xs text-zinc-300">
      Keep original audio
      <input v-model="keepAudio" type="checkbox" />
    </label>
    <label v-if="keepAudio" class="flex items-center justify-between text-xs text-zinc-300">
      Normalize audio
      <input v-model="normalize" type="checkbox" />
    </label>
    <SliderField
      v-if="keepAudio"
      :model-value="clipVolumeUi"
      label="Clip volume"
      :min="0"
      :max="100"
      suffix="%"
      @update:model-value="(v) => (clipVolumeUi = v)"
    />
  </div>
</template>
