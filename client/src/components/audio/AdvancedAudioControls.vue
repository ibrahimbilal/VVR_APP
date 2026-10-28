<script setup lang="ts">
import { computed } from 'vue'
import SliderField from '../SliderField.vue'
import ToggleSwitch from '../ToggleSwitch.vue'

const props = withDefaults(
  defineProps<{
    volumeLabel?: string
    volumeAsPercent?: boolean
    showLoop?: boolean
    showFades?: boolean
    loopLabel?: string
  }>(),
  {
    volumeLabel: 'Volume',
    volumeAsPercent: true,
    showLoop: true,
    showFades: true,
    loopLabel: 'Loop audio',
  },
)

const volume = defineModel<number>('volume', { required: true })
const fadeIn = defineModel<number>('fadeIn')
const fadeOut = defineModel<number>('fadeOut')
const loop = defineModel<boolean>('loop')

const volumeUi = computed({
  get: () => (props.volumeAsPercent ? Math.round(volume.value * 100) : volume.value),
  set: (value: number) => {
    volume.value = props.volumeAsPercent ? value / 100 : value
  },
})
</script>

<template>
  <div class="space-y-3">
    <SliderField
      :model-value="volumeUi"
      :label="volumeLabel"
      :min="0"
      :max="volumeAsPercent ? 100 : 1"
      :step="volumeAsPercent ? 1 : 0.05"
      :suffix="volumeAsPercent ? '%' : undefined"
      @update:model-value="(v) => (volumeUi = v)"
    />
    <div v-if="showLoop && loop !== undefined" class="flex items-center justify-between gap-3 text-sm">
      <span>{{ loopLabel }}</span>
      <ToggleSwitch v-model="loop" :aria-label="loopLabel" />
    </div>
    <SliderField
      v-if="showFades && fadeIn !== undefined"
      :model-value="fadeIn"
      label="Fade in (s)"
      :min="0"
      :max="30"
      :step="0.5"
      @update:model-value="(v) => (fadeIn = v)"
    />
    <SliderField
      v-if="showFades && fadeOut !== undefined"
      :model-value="fadeOut"
      label="Fade out (s)"
      :min="0"
      :max="30"
      :step="0.5"
      @update:model-value="(v) => (fadeOut = v)"
    />
  </div>
</template>
