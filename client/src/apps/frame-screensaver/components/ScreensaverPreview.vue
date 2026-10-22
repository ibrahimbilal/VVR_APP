<script setup lang="ts">
import { Pause, Play } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()
const videoRef = ref<HTMLVideoElement | null>(null)
const videoBackRef = ref<HTMLVideoElement | null>(null)
const playing = ref(false)
const audioRef = ref<HTMLAudioElement | null>(null)

const foregroundFit = computed(() => {
  if (store.fit === 'cover') return 'object-cover'
  return 'object-contain'
})

const showBlur = computed(() => store.fit === 'blur')

function syncVideoElements() {
  const main = videoRef.value
  const back = videoBackRef.value
  if (!main || !back || store.mediaKind !== 'video') return
  if (showBlur.value && playing.value && !main.paused) {
    back.currentTime = main.currentTime
  }
}

function togglePlay() {
  const video = videoRef.value
  const back = videoBackRef.value
  if (!video) return
  if (video.paused) {
    void video.play().then(() => {
      playing.value = true
      if (back && showBlur.value) {
        back.currentTime = video.currentTime
        void back.play().catch(() => undefined)
      }
    })
  } else {
    video.pause()
    back?.pause()
    playing.value = false
  }
}

watch(
  () => store.audioUrl,
  (url) => {
    const audio = audioRef.value
    if (!audio) return
    if (url && store.audioMode === 'upload') {
      audio.src = url
      audio.loop = store.loopAudio
      audio.volume = store.audioVolume
    } else {
      audio.removeAttribute('src')
    }
  },
)

watch(
  () => store.objectUrl,
  () => {
    playing.value = false
  },
)
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-1 items-center justify-center">
      <div
        class="relative w-full max-h-full overflow-hidden rounded-lg border border-zinc-800 shadow-lg"
        style="aspect-ratio: 16 / 9"
        :style="{ backgroundColor: store.backgroundColor }"
      >
        <template v-if="store.objectUrl">
          <!-- Blur background -->
          <img
            v-if="store.mediaKind === 'image' && showBlur"
            :src="store.objectUrl"
            alt=""
            class="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
          />
          <video
            v-if="store.mediaKind === 'video' && showBlur"
            ref="videoBackRef"
            :src="store.objectUrl"
            class="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
            muted
            playsinline
          />

          <!-- Foreground -->
          <img
            v-if="store.mediaKind === 'image'"
            :src="store.objectUrl"
            alt=""
            class="absolute inset-0 h-full w-full"
            :class="foregroundFit"
          />
          <video
            v-else
            ref="videoRef"
            :src="store.objectUrl"
            class="absolute inset-0 h-full w-full"
            :class="foregroundFit"
            playsinline
            :loop="store.mode === 'loop'"
            muted
            @timeupdate="syncVideoElements"
            @play="playing = true"
            @pause="playing = false"
          />
        </template>
        <p v-else class="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">Upload media to preview</p>

        <button
          v-if="store.mediaKind === 'video'"
          class="absolute bottom-3 left-3 z-10 btn btn-primary cursor-pointer"
          type="button"
          @click="togglePlay"
        >
          <Play v-if="!playing" :size="16" />
          <Pause v-else :size="16" />
          {{ playing ? 'Pause' : 'Play' }}
        </button>
      </div>
    </div>
    <audio ref="audioRef" class="hidden" />
    <dl class="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500">
      <div>
        <dt class="text-zinc-600">Fit</dt>
        <dd class="text-zinc-300 capitalize">{{ store.fit }}</dd>
      </div>
      <div>
        <dt class="text-zinc-600">Duration</dt>
        <dd class="text-zinc-300">{{ store.durationLabel }}</dd>
      </div>
      <div>
        <dt class="text-zinc-600">Output</dt>
        <dd class="text-zinc-300">{{ store.outputWidth }}×{{ store.outputHeight }} @ {{ store.fps }} fps</dd>
      </div>
    </dl>
  </div>
</template>
