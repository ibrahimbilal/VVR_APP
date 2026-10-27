<script setup lang="ts">
import { computed } from 'vue'
import SliderField from '../SliderField.vue'
import ToggleSwitch from '../ToggleSwitch.vue'

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
    <div class="flex items-center justify-between text-xs text-zinc-300">
      <span>Keep original audio</span>
      <ToggleSwitch v-model="keepAudio" aria-label="Keep original audio" />
    </div>
    <div v-if="keepAudio" class="flex items-center justify-between text-xs text-zinc-300">
      <span>Normalize audio</span>
      <ToggleSwitch v-model="normalize" aria-label="Normalize audio" />
    </div>
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
