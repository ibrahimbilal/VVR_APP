<script setup lang="ts">
import { computed, ref } from 'vue'
import { OUTPUTS, FRAME_RATES } from '@shared/frame'
import type { MotionEasing } from '@shared/imageMotion'
import AdvancedAudioControls from '../../../components/audio/AdvancedAudioControls.vue'
import AudioFileField from '../../../components/audio/AudioFileField.vue'
import SettingsAccordion from '../../../components/SettingsAccordion.vue'
import SliderField from '../../../components/SliderField.vue'
import AppSettingsTabs from '../../../components/ui/AppSettingsTabs.vue'
import { useImageMotionStore } from '../stores/imageMotion'

const store = useImageMotionStore()
const tab = ref<'motion' | 'output' | 'sound'>('motion')
const tabs = [
  { id: 'motion' as const, label: 'Motion' },
  { id: 'output' as const, label: 'Output' },
  { id: 'sound' as const, label: 'Sound' },
]

const selectedSegment = computed(() => store.selectedSegment)
const motion = computed(() => selectedSegment.value?.motion)
const slowMode = computed(() => motion.value?.mode === 'slow')

const hardwareEncoders = computed(() => store.encoderOptions.filter((item) => item.hardware && item.listed))
const selectedEncoder = computed(() => store.encoderOptions.find((item) => item.id === store.video.encoder))
const autoEncoderLabel = computed(() => {
  const hint = store.encoderAutoMotion ?? store.encoderAutoStill
  return hint ? ` (${hint})` : ''
})

const zoom = computed({
  get: () => motion.value?.zoom ?? 1,
  set: (value: number) => store.patchSelectedMotion({ zoom: value }),
})
const travel = computed({
  get: () => Math.round((motion.value?.travelDistance ?? 0.3) * 100),
  set: (value: number) => store.patchSelectedMotion({ travelDistance: value / 100 }),
})
const start = computed({
  get: () => Math.round((motion.value?.startPosition ?? 0) * 100),
  set: (value: number) => store.patchSelectedMotion({ startPosition: value / 100 }),
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 border-b border-zinc-800">
      <h2 class="px-4 pt-4 text-sm font-bold text-zinc-100">Settings</h2>
      <AppSettingsTabs v-model="tab" :items="tabs" :cols="3" />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <Transition name="settings-pane" mode="out-in">
        <div :key="tab">
          <div v-if="tab === 'motion' && !selectedSegment" class="px-4 py-8 text-center text-sm text-zinc-500">
            Select an image to edit motion and transitions.
          </div>
          <template v-else-if="tab === 'motion' && motion">
            <SettingsAccordion title="Motion" open>
              <div class="space-y-3">
                <label class="block">
                  <span class="section-label mb-1 block">Mode</span>
                  <select
                    class="field w-full"
                    :value="motion.mode"
                    @change="store.patchSelectedMotion({ mode: ($event.target as HTMLSelectElement).value as 'full' | 'slow' })"
                  >
                    <option value="full">Full pan</option>
                    <option value="slow">Slow cinematic pan</option>
                  </select>
                </label>
                <label class="block">
                  <span class="section-label mb-1 block">Direction</span>
                  <select
                    class="field w-full"
                    :value="motion.direction"
                    @change="store.patchSelectedMotion({ direction: ($event.target as HTMLSelectElement).value as 'rtl' | 'ltr' })"
                  >
                    <option value="rtl">Right to left</option>
                    <option value="ltr">Left to right</option>
                  </select>
                </label>
                <label class="block">
                  <span class="section-label mb-1 block">Easing</span>
                  <select
                    class="field w-full"
                    :value="motion.easing"
                    @change="store.patchSelectedMotion({ easing: ($event.target as HTMLSelectElement).value as MotionEasing })"
                  >
                    <option value="linear">Linear</option>
                    <option value="easeInOut">Ease in-out</option>
                    <option value="easeIn">Ease in</option>
                    <option value="easeOut">Ease out</option>
                  </select>
                </label>
                <SliderField v-model="zoom" label="Zoom" :min="1" :max="2" :step="0.05" suffix="×" />
                <template v-if="slowMode">
                  <SliderField v-model="travel" label="Travel distance" :min="5" :max="100" suffix="%" />
                  <SliderField v-model="start" label="Start position" :min="0" :max="100" suffix="%" />
                </template>
                <button type="button" class="btn btn-ghost w-full cursor-pointer" @click="store.resetMotionDefaults()">Reset to defaults</button>
              </div>
            </SettingsAccordion>
            <SettingsAccordion title="Transition to next" open>
              <div class="space-y-3">
                <label class="block">
                  <span class="section-label mb-1 block">Type</span>
                  <select
                    class="field w-full"
                    :value="selectedSegment!.transitionAfter.type"
                    @change="store.patchSelectedTransition({ type: ($event.target as HTMLSelectElement).value as 'cut' | 'fade' })"
                  >
                    <option value="cut">Cut</option>
                    <option value="fade">Crossfade</option>
                  </select>
                </label>
                <label v-if="selectedSegment!.transitionAfter.type === 'fade'" class="block">
                  <span class="section-label mb-1 block">Crossfade</span>
                  <input
                    class="field w-full"
                    type="number"
                    min="0.1"
                    max="3"
                    step="0.1"
                    :value="selectedSegment!.transitionAfter.fadeDuration"
                    @change="store.patchSelectedTransition({ fadeDuration: Number(($event.target as HTMLInputElement).value) })"
                  />
                </label>
              </div>
            </SettingsAccordion>
          </template>

          <SettingsAccordion v-else-if="tab === 'output'" title="Video" open>
            <div class="space-y-3">
              <label class="block">
                <span class="section-label mb-1 block">Resolution</span>
                <select
                  class="field w-full"
                  :value="`${store.video.width}x${store.video.height}`"
                  @change="(e) => {
                    const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number)
                    store.setResolution(w!, h!)
                  }"
                >
                  <option v-for="out in OUTPUTS" :key="out.label" :value="`${out.width}x${out.height}`">{{ out.label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="section-label mb-1 block">Frame rate</span>
                <select class="field w-full" :value="store.video.fps" @change="store.setFps(Number(($event.target as HTMLSelectElement).value))">
                  <option v-for="fps in FRAME_RATES" :key="fps" :value="fps">{{ fps }} fps</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-zinc-500">Encoding method</span>
                <select v-model="store.video.encoder" class="field w-full">
                  <option value="auto">Auto (recommended){{ autoEncoderLabel }}</option>
                  <option value="cpu">CPU</option>
                  <option v-for="item in hardwareEncoders" :key="item.id" :value="item.id" :disabled="!item.verified">
                    {{ item.label }}{{ item.verified ? '' : ' — unavailable' }}
                  </option>
                </select>
                <p v-if="selectedEncoder && !selectedEncoder.verified" class="mt-1 text-xs text-amber-200">{{ selectedEncoder.detail }}</p>
              </label>
            </div>
          </SettingsAccordion>

          <SettingsAccordion v-else title="Background music" open>
            <div class="space-y-3">
              <AudioFileField
                :file-name="store.musicName"
                :file-size="store.musicFileSize"
                :preview-url="store.musicUrl"
                label="Drop audio here"
                @files="(files) => void store.setMusic(files[0] ?? null)"
                @clear="void store.setMusic(null)"
              />
              <AdvancedAudioControls
                v-model:volume="store.audio.musicVolume"
                v-model:fade-in="store.audio.musicFadeIn"
                v-model:fade-out="store.audio.musicFadeOut"
                v-model:loop="store.audio.loopMusic"
              />
            </div>
          </SettingsAccordion>
        </div>
      </Transition>
    </div>
  </div>
</template>
