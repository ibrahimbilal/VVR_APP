<script setup lang="ts">
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatClock } from '../../../lib/format'
import { useImageMotionPlayback } from '../composables/useImageMotionPlayback'
import { useImageMotionStore } from '../stores/imageMotion'

const store = useImageMotionStore()
const playback = useImageMotionPlayback()
const root = ref<HTMLElement | null>(null)
const player = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const controlsEl = ref<HTMLElement | null>(null)
const scale = ref(0.28)
const fullscreen = ref(false)
let paintRaf = 0
let resizeObserver: ResizeObserver | null = null

const progress = computed(() => {
  if (playback.duration.value <= 0) return 0
  return Math.min(100, (Math.min(playback.playhead.value, playback.duration.value) / playback.duration.value) * 100)
})

const stageStyle = computed(() => ({
  width: `${store.video.width}px`,
  height: `${store.video.height}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}))

const scaleBoxStyle = computed(() => ({
  width: `${store.video.width * scale.value}px`,
  height: `${store.video.height * scale.value}px`,
}))

const playerStyle = computed(() => {
  if (fullscreen.value) return undefined
  return { width: `${Math.max(180, store.video.width * scale.value)}px` }
})

function measure() {
  if (!root.value || !player.value || fullscreen.value) return
  const bounds = root.value.getBoundingClientRect()
  const controls = controlsEl.value?.getBoundingClientRect().height ?? 72
  const availableW = Math.max(160, bounds.width - 32)
  const availableH = Math.max(160, bounds.height - controls - 32)
  scale.value = Math.min(availableW / store.video.width, availableH / store.video.height)
}

function loopPaint() {
  playback.paint(canvasRef.value)
  paintRaf = requestAnimationFrame(loopPaint)
}

function onSeek(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  playback.seek(Number(target.value))
}

function toggleFullscreen() {
  if (!player.value) return
  if (document.fullscreenElement === player.value) void document.exitFullscreen()
  else void player.value.requestFullscreen()
}

function onFullscreenChange() {
  fullscreen.value = document.fullscreenElement === player.value
  void nextTick(measure)
}

onMounted(() => {
  void playback.preloadAll()
  paintRaf = requestAnimationFrame(loopPaint)
  measure()
  resizeObserver = new ResizeObserver(() => measure())
  if (root.value) resizeObserver.observe(root.value)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(paintRaf)
  resizeObserver?.disconnect()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})

watch(
  () => [store.video.width, store.video.height],
  () => measure(),
)
</script>

<template>
  <section ref="root" class="flex min-h-0 flex-1 items-center justify-center bg-[#0b0c0f] p-4">
    <div
      ref="player"
      class="relative flex max-h-full flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-black shadow-2xl"
      :class="fullscreen ? 'h-full w-full items-center justify-center rounded-none border-0' : ''"
      :style="playerStyle"
    >
      <div class="relative" :style="scaleBoxStyle">
        <div class="relative cursor-pointer bg-black" :style="stageStyle" title="Play or pause" @click="playback.toggle()">
          <canvas ref="canvasRef" class="block" :style="{ width: `${store.video.width}px`, height: `${store.video.height}px` }" />
        </div>
        <p
          v-if="store.segments.length === 0"
          class="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-400"
        >
          Add an image to preview the pan.
        </p>
      </div>
      <div ref="controlsEl" class="absolute bottom-0 left-0 right-0 w-full shrink-0 px-3 pb-3 pt-2">
        <div class="flex items-center gap-3 text-white">
          <button class="cursor-pointer disabled:cursor-default disabled:opacity-40" type="button" :aria-label="playback.playing.value ? 'Pause' : 'Play'" :disabled="playback.duration.value <= 0" @click="playback.toggle()">
            <Pause v-if="playback.playing.value" :size="18" />
            <Play v-else :size="18" />
          </button>
          <button class="cursor-pointer" type="button" :aria-label="playback.muted.value ? 'Unmute' : 'Mute'" @click="playback.muted.value = !playback.muted.value">
            <VolumeX v-if="playback.muted.value" :size="18" />
            <Volume2 v-else :size="18" />
          </button>
          <span class="text-sm tabular-nums">{{ formatClock(playback.playhead.value) }} / {{ formatClock(playback.duration.value) }}</span>
          <button class="ml-auto cursor-pointer" type="button" :aria-label="fullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
            <Minimize v-if="fullscreen" :size="18" />
            <Maximize v-else :size="18" />
          </button>
        </div>
        <input
          class="preview-seek mt-2"
          type="range"
          min="0"
          :max="Math.max(playback.duration.value, 0.01)"
          step="0.01"
          :value="Math.min(playback.playhead.value, playback.duration.value)"
          :disabled="playback.duration.value <= 0"
          :style="{ '--progress': `${progress}%` }"
          aria-label="Playback position"
          @input="onSeek"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.preview-seek {
  -webkit-appearance: none;
  appearance: none;
  display: block;
  width: 100%;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(to right, #f4f4f5 var(--progress, 0%), #3f3f46 var(--progress, 0%));
  cursor: pointer;
}

.preview-seek:disabled {
  cursor: default;
  opacity: 0.45;
}

.preview-seek::-webkit-slider-runnable-track {
  height: 3px;
  background: transparent;
}

.preview-seek::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  margin-top: -3.5px;
  border: 0;
  border-radius: 999px;
  background: #f4f4f5;
}

.preview-seek::-moz-range-track {
  height: 3px;
  background: transparent;
  border: 0;
}

.preview-seek::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 0;
  border-radius: 999px;
  background: #f4f4f5;
}
</style>
