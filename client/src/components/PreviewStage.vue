<script setup lang="ts">
import { frameMetrics } from '@shared/frame'
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayback } from '../composables/usePlayback'
import { drawOverlay, ensureFonts } from '../lib/drawOverlay'
import { formatClock, overlayRanks } from '../lib/format'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()
const {
  videoA,
  videoB,
  back,
  playing,
  muted,
  playhead,
  duration,
  activeClip,
  activeIndex,
  segments,
  toggle,
  toggleMute,
  seek,
  onVideoError,
  slotOpacity,
  slotZ,
} = usePlayback()

const root = ref<HTMLElement | null>(null)
const player = ref<HTMLElement | null>(null)
const controlsEl = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const scale = ref(0.3)
const fontsReady = ref(false)
const fullscreen = ref(false)
let resizeObserver: ResizeObserver | null = null

const hasVideo = computed(() => store.clips.some((clip) => Boolean(clip.objectUrl)))
const metrics = computed(() =>
  frameMetrics(
    store.style.video.width,
    store.style.video.height,
    store.style.banner.visible === false ? 0 : store.style.banner.height,
  ),
)
const stageStyle = computed(() => ({
  width: `${metrics.value.width}px`,
  height: `${metrics.value.height}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}))
const scaleBoxStyle = computed(() => ({
  width: `${metrics.value.width * scale.value}px`,
  height: `${metrics.value.height * scale.value}px`,
}))
const videoBoxStyle = computed(() => {
  if (!hasVideo.value) {
    return {
      top: '0px',
      height: `${metrics.value.height}px`,
      background: '#000000',
    }
  }
  return {
    top: `${metrics.value.bannerHeight}px`,
    height: `${metrics.value.videoHeight}px`,
    background: store.style.video.scaleMode === 'crop' ? '#000000' : store.style.video.backgroundColor,
  }
})
const objectFit = computed(() => (store.style.video.scaleMode === 'crop' ? 'cover' : 'contain'))
const progress = computed(() => {
  if (duration.value <= 0) return 0
  return Math.min(100, (Math.min(playhead.value, duration.value) / duration.value) * 100)
})
const playerStyle = computed(() => {
  if (fullscreen.value) return undefined
  return { width: `${Math.max(180, metrics.value.width * scale.value)}px` }
})
const placeholder = computed(() => {
  if (!activeClip.value) return 'Add at least two videos.'
  if (!activeClip.value.objectUrl) return 'This slot needs a video file. Upload one you have permission to use.'
  if (activeClip.value.previewBlocked) return 'This browser cannot play this codec. Export can still try to render it.'
  return ''
})

function measure() {
  const box = fullscreen.value && player.value ? player.value : root.value
  if (!box) return
  if (box.clientWidth < 20 || box.clientHeight < 20) return
  const chrome = controlsEl.value?.offsetHeight ?? 68
  const pad = fullscreen.value ? 0 : 32
  const border = fullscreen.value ? 0 : 2
  const availableW = Math.max(40, box.clientWidth - pad - border)
  const availableH = Math.max(40, box.clientHeight - pad - chrome)
  scale.value = Math.min(availableW / metrics.value.width, availableH / metrics.value.height)
}

function toggleFullscreen() {
  const node = player.value
  if (!node) return
  if (document.fullscreenElement) {
    void document.exitFullscreen()
    return
  }
  void node.requestFullscreen()
}

function onFullscreenChange() {
  fullscreen.value = document.fullscreenElement === player.value
  measure()
  requestAnimationFrame(measure)
}

function paint() {
  const target = canvas.value
  if (!target || !fontsReady.value) return
  const context = target.getContext('2d')
  if (!context) return
  target.width = metrics.value.width
  target.height = metrics.value.height
  if (!hasVideo.value) {
    context.clearRect(0, 0, target.width, target.height)
    return
  }
  const clip = activeClip.value
  const index = activeIndex.value
  drawOverlay(context, {
    width: metrics.value.width,
    height: metrics.value.height,
    bannerHeight: metrics.value.bannerHeight,
    banner: store.style.banner,
    spans: store.spans,
    ranking: store.style.ranking,
    caption: store.style.caption,
    ranks: overlayRanks(
      store.clips,
      index,
      store.style.ranking.format,
      store.style.ranking.color,
      store.style.caption.enabled && Boolean(clip?.objectUrl),
      store.style.ranking.display,
      store.style.caption.color,
      store.style.ranking.pageStyle,
      store.style.ranking.showPreviousTitles,
      store.style.ranking.sort,
    ),
  })
}

onMounted(async () => {
  await ensureFonts()
  fontsReady.value = true
  measure()
  paint()
  resizeObserver = new ResizeObserver(() => measure())
  if (root.value) resizeObserver.observe(root.value)
  if (player.value) resizeObserver.observe(player.value)
  if (controlsEl.value) resizeObserver.observe(controlsEl.value)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  await nextTick()
  measure()
  if (segments.value.length > 0) void seek(0)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (document.fullscreenElement === player.value) void document.exitFullscreen()
})

watch(metrics, () => {
  measure()
  paint()
})
watch(
  () => [
    store.spans,
    store.style.banner,
    store.style.ranking,
    store.style.caption,
    activeIndex.value,
    store.clips.map((clip) => `${clip.title}\n${clip.rankColor ?? ''}\n${clip.titleColor ?? ''}\n${clip.playAtEnd ? '1' : '0'}\n${clip.objectUrl ? '1' : '0'}`).join('\n'),
  ],
  () => paint(),
  { deep: true },
)

function onSeek(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  void seek(Number(target.value))
}
</script>

<template>
  <section ref="root" class="flex min-h-0 flex-1 items-center justify-center bg-[#0b0c0f] p-4">
    <div
      ref="player"
      class="relative flex max-h-full flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-black shadow-2xl"
      :class="fullscreen ? 'h-full w-full items-center justify-center rounded-none border-0' : ''"
      :style="playerStyle"
    >
      <div :style="scaleBoxStyle">
        <div class="relative cursor-pointer bg-black" :style="stageStyle" title="Play or pause" @click="toggle">
          <div class="absolute left-0 z-0 w-full overflow-hidden" :style="videoBoxStyle">
            <div v-if="placeholder" class="absolute inset-0 z-0 flex items-center justify-center px-16 text-center text-[42px] leading-snug text-zinc-400">
              {{ placeholder }}
            </div>
            <video
              ref="back"
              class="absolute inset-0 h-full w-full origin-center scale-110 object-cover blur-2xl"
              :class="store.style.video.scaleMode === 'blur' ? '' : 'hidden'"
              muted
              playsinline
            ></video>
            <video
              ref="videoA"
              class="absolute inset-0 h-full w-full"
              :class="hasVideo ? '' : 'hidden'"
              :style="{ objectFit, opacity: slotOpacity('a'), zIndex: slotZ('a') }"
              playsinline
              @error="onVideoError"
            ></video>
            <video
              ref="videoB"
              class="absolute inset-0 h-full w-full"
              :class="hasVideo ? '' : 'hidden'"
              :style="{ objectFit, opacity: slotOpacity('b'), zIndex: slotZ('b') }"
              playsinline
              @error="onVideoError"
            ></video>
          </div>
          <canvas ref="canvas" class="pointer-events-none absolute inset-0 z-10 h-full w-full"></canvas>
        </div>
      </div>

      <div ref="controlsEl" class="w-full shrink-0 px-3 pb-3 pt-2 absolute bottom-0 left-0 right-0">
        <div class="flex items-center gap-3 text-white">
          <button class="cursor-pointer disabled:cursor-default disabled:opacity-40" type="button" :aria-label="playing ? 'Pause' : 'Play'" :title="playing ? 'Pause' : 'Play'" :disabled="duration <= 0" @click="toggle">
            <Pause v-if="playing" :size="18" />
            <Play v-else :size="18" />
          </button>
          <button class="cursor-pointer" type="button" :aria-label="muted ? 'Unmute' : 'Mute'" :title="muted ? 'Unmute' : 'Mute'" @click="toggleMute">
            <VolumeX v-if="muted" :size="18" />
            <Volume2 v-else :size="18" />
          </button>
          <span class="text-sm tabular-nums">{{ formatClock(playhead) }} / {{ formatClock(duration) }}</span>
          <button class="ml-auto cursor-pointer" type="button" :aria-label="fullscreen ? 'Exit fullscreen' : 'Fullscreen'" :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
            <Minimize v-if="fullscreen" :size="18" />
            <Maximize v-else :size="18" />
          </button>
        </div>
        <input
          class="preview-seek mt-2"
          type="range"
          min="0"
          :max="Math.max(duration, 0.01)"
          step="0.01"
          :value="Math.min(playhead, duration)"
          :disabled="duration <= 0"
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
