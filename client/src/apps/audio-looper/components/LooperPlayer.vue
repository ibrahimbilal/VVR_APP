<script setup lang="ts">
import { Pause, Play, Volume2, VolumeX } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BRAND } from '../../../lib/brand'
import { formatClock } from '../../../lib/format'
import {
  playbackProgress,
  resamplePeaks,
  WAVEFORM_PLAYED_OPACITY,
  WAVEFORM_UNPLAYED_OPACITY,
} from '../lib/waveform'
import { useAudioLooperStore } from '../stores/audioLooper'

const store = useAudioLooperStore()
const audioEl = ref<HTMLAudioElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const playing = ref(false)
const muted = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const error = ref<string | null>(null)
const ready = ref(false)

let raf = 0
let seeking = false
let dragHandle: 'start' | 'end' | null = null
let resizeObserver: ResizeObserver | null = null
let displayPeaks: Float32Array | null = null
let lastBarCount = 0

const progress = computed(() => playbackProgress(currentTime.value, duration.value))
const canPlay = computed(() => ready.value && duration.value > 0 && !error.value)

function currentAudioTime(): number {
  const audio = audioEl.value
  if (!audio) return 0
  const time = audio.currentTime
  return Number.isFinite(time) ? Math.max(0, time) : 0
}

function trimBounds(): { start: number; end: number } {
  const total = duration.value || store.sourceDuration || 0
  const start = Math.max(0, Math.min(store.selectedTrimStart, total))
  const endValue = store.selectedTrimEnd == null ? total : store.selectedTrimEnd
  const end = total > 0 ? Math.max(start, Math.min(total, endValue)) : start
  return { start, end }
}

function syncClock(): void {
  currentTime.value = currentAudioTime()
  const audioDuration = audioEl.value?.duration
  if (audioDuration && Number.isFinite(audioDuration) && audioDuration > 0) {
    duration.value = audioDuration
  } else if (store.sourceDuration != null) {
    duration.value = store.sourceDuration
  }
  const audio = audioEl.value
  const { start, end } = trimBounds()
  if (!seeking && audio && end > start && audio.currentTime >= end - 0.02) {
    audio.pause()
    audio.currentTime = Math.max(start, end - 0.03)
    currentTime.value = audio.currentTime
  }
}

function paint(): void {
  const el = canvas.value
  if (!el) return
  const width = Math.max(1, el.clientWidth || 320)
  const height = Math.max(1, el.clientHeight || 96)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const pixelW = Math.round(width * dpr)
  const pixelH = Math.round(height * dpr)
  if (el.width !== pixelW) el.width = pixelW
  if (el.height !== pixelH) el.height = pixelH
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const ratio = playbackProgress(currentAudioTime(), duration.value || store.sourceDuration || 0)
  const progressX = ratio * width
  const peaks = store.waveform?.peaks

  if (peaks && peaks.length > 0) {
    const barCount = Math.max(48, Math.min(peaks.length, Math.floor(width / 2.5)))
    if (!displayPeaks || lastBarCount !== barCount) {
      displayPeaks = resamplePeaks(peaks, barCount)
      lastBarCount = barCount
    }
    drawBars(ctx, width, height, displayPeaks, progressX)
  } else {
    drawFallbackTrack(ctx, width, height, progressX)
  }

  const total = duration.value || store.sourceDuration || 0
  if (total > 0) {
    const { start, end } = trimBounds()
    const startX = (start / total) * width
    const endX = (end / total) * width
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    if (startX > 1) ctx.fillRect(0, 0, startX, height)
    if (endX < width - 1) ctx.fillRect(endX, 0, width - endX, height)
    ctx.fillStyle = '#f4f4f5'
    ctx.fillRect(startX, 0, 2, height)
    ctx.fillRect(Math.max(0, endX - 2), 0, 2, height)
  }

  ctx.fillStyle = '#f4f4f5'
  const head = Math.min(width - 1, Math.max(0, progressX))
  ctx.fillRect(head, 6, 1.5, height - 12)
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaks: Float32Array,
  progressX: number,
): void {
  const paintAt = (opacity: number) => {
    ctx.globalAlpha = opacity
    ctx.fillStyle = BRAND
    const mid = height / 2
    const bar = width / peaks.length
    const maxAmp = height * 0.42
    for (let i = 0; i < peaks.length; i += 1) {
      const amp = Math.max(2, (peaks[i] ?? 0) * maxAmp)
      ctx.fillRect(i * bar, mid - amp, Math.max(1, bar - 0.8), amp * 2)
    }
  }
  paintAt(WAVEFORM_UNPLAYED_OPACITY)
  if (progressX > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, progressX, height)
    ctx.clip()
    paintAt(WAVEFORM_PLAYED_OPACITY)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

function drawFallbackTrack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progressX: number,
): void {
  const y = height / 2 - 1.5
  ctx.globalAlpha = WAVEFORM_UNPLAYED_OPACITY
  ctx.fillStyle = BRAND
  ctx.fillRect(0, y, width, 3)
  if (progressX > 0) {
    ctx.globalAlpha = WAVEFORM_PLAYED_OPACITY
    ctx.fillRect(0, y, progressX, 3)
  }
  ctx.globalAlpha = 1
}

function tick(): void {
  raf = 0
  syncClock()
  paint()
  if (playing.value || seeking) raf = requestAnimationFrame(tick)
}

function startLoop(): void {
  if (!raf) raf = requestAnimationFrame(tick)
}

function stopLoop(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  syncClock()
  paint()
}

function seekToRatio(ratio: number): void {
  const audio = audioEl.value
  const total = duration.value
  if (!audio || !(total > 0)) return
  const { start, end } = trimBounds()
  const next = Math.min(end, Math.max(start, ratio * total))
  audio.currentTime = next
  currentTime.value = next
  if (next < end - 0.02) playing.value = !audio.paused
  paint()
}

function handleHit(event: PointerEvent): 'start' | 'end' | null {
  const el = canvas.value
  const total = duration.value
  if (!el || !(total > 0) || !store.selectedTrack) return null
  const ratio = ratioFromEvent(event)
  const { start, end } = trimBounds()
  const slack = 12 / Math.max(1, el.clientWidth)
  const startDist = Math.abs(ratio - start / total)
  const endDist = Math.abs(ratio - end / total)
  if (startDist <= slack && startDist <= endDist) return 'start'
  if (endDist <= slack) return 'end'
  return null
}

function ratioFromEvent(event: PointerEvent): number {
  const el = canvas.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !canPlay.value) return
  event.preventDefault()
  canvas.value?.setPointerCapture(event.pointerId)
  seeking = true
  dragHandle = handleHit(event)
  if (!dragHandle) seekToRatio(ratioFromEvent(event))
  startLoop()
}

function onPointerMove(event: PointerEvent): void {
  if (!seeking) return
  const track = store.selectedTrack
  if (dragHandle && track && duration.value > 0) {
    const time = ratioFromEvent(event) * duration.value
    if (dragHandle === 'start') store.setTrim(track.id, time, track.trimEnd ?? duration.value)
    else store.setTrim(track.id, track.trimStart, time)
    paint()
    return
  }
  seekToRatio(ratioFromEvent(event))
}

function onPointerUp(event: PointerEvent): void {
  if (!seeking) return
  seeking = false
  dragHandle = null
  try {
    canvas.value?.releasePointerCapture(event.pointerId)
  } catch {
    // already released
  }
  if (!playing.value) stopLoop()
}

async function toggle(): Promise<void> {
  const audio = audioEl.value
  if (!audio || !canPlay.value) return
  if (audio.paused) {
    const { start, end } = trimBounds()
    if (audio.currentTime < start || audio.currentTime >= end - 0.05) audio.currentTime = start
    store.claimPreview('track')
    try {
      await audio.play()
    } catch {
      error.value = 'This browser could not play the audio file.'
    }
  } else {
    audio.pause()
  }
}

function toggleMute(): void {
  const audio = audioEl.value
  if (!audio) return
  audio.muted = !audio.muted
  muted.value = audio.muted
}

function onLoadedMetadata(): void {
  const audio = audioEl.value
  const loaded = audio?.duration
  if (loaded && Number.isFinite(loaded) && loaded > 0) {
    duration.value = loaded
    store.setSourceDuration(loaded)
  }
  ready.value = true
  error.value = null
  syncClock()
  paint()
}

function onPlay(): void {
  playing.value = true
  error.value = null
  startLoop()
}

function onPause(): void {
  playing.value = false
  if (!seeking) stopLoop()
}

function onEnded(): void {
  playing.value = false
  currentTime.value = duration.value
  stopLoop()
}

function onError(): void {
  playing.value = false
  ready.value = false
  error.value = 'This browser could not play the audio file.'
  stopLoop()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || !canPlay.value) return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('button, input, textarea, select, [contenteditable="true"]')) return
  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault()
    void toggle()
    return
  }
  const audio = audioEl.value
  if (!audio || duration.value <= 0) return
  const step = event.shiftKey ? 5 : 1
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekToRatio((audio.currentTime - step) / duration.value)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekToRatio((audio.currentTime + step) / duration.value)
  } else if (event.key === 'Home') {
    event.preventDefault()
    seekToRatio(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    seekToRatio(1)
  }
}

function onPlayerKeydown(event: KeyboardEvent): void {
  if (event.code === 'Space' || event.key === 'Enter') {
    event.preventDefault()
    void toggle()
  }
}

function resetForSource(): void {
  const audio = audioEl.value
  playing.value = false
  seeking = false
  ready.value = false
  error.value = null
  currentTime.value = 0
  duration.value = store.sourceDuration ?? 0
  displayPeaks = null
  lastBarCount = 0
  stopLoop()
  if (audio) {
    audio.pause()
    audio.muted = muted.value
  }
  void nextTick(() => {
    syncClock()
    paint()
  })
}

watch(
  () => store.previewOwner,
  (owner) => {
    if (owner && owner !== 'track') audioEl.value?.pause()
  },
)

watch(
  () => store.objectUrl,
  () => {
    resetForSource()
  },
)

watch(
  () => store.waveform,
  () => {
    displayPeaks = null
    lastBarCount = 0
    paint()
  },
)

watch(
  () => [store.selectedTrimStart, store.selectedTrimEnd],
  () => paint(),
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => paint())
  if (canvas.value) resizeObserver.observe(canvas.value)
  window.addEventListener('keydown', onKeydown)
  paint()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeydown)
  const audio = audioEl.value
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
})
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-zinc-700 bg-black shadow-2xl">
    <audio
      ref="audioEl"
      class="hidden"
      preload="metadata"
      :src="store.objectUrl ?? undefined"
      :muted="muted"
      @loadedmetadata="onLoadedMetadata"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
      @error="onError"
    />
    <div class="px-3 pt-3">
      <canvas
        ref="canvas"
        class="h-24 w-full cursor-pointer touch-none rounded-md sm:h-28"
        role="slider"
        tabindex="0"
        aria-label="Seek"
        :aria-valuemin="0"
        :aria-valuemax="duration || 0"
        :aria-valuenow="currentTime"
        :aria-valuetext="`${formatClock(currentTime)} of ${formatClock(duration)}`"
        :aria-disabled="!canPlay"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onPlayerKeydown"
      />
    </div>
    <div class="w-full px-3 pb-3 pt-2">
      <div class="flex items-center gap-3 text-white">
        <button
          class="cursor-pointer disabled:cursor-default disabled:opacity-40"
          type="button"
          :aria-label="playing ? 'Pause' : 'Play'"
          :title="playing ? 'Pause' : 'Play'"
          :disabled="!canPlay"
          @click="toggle"
        >
          <Pause v-if="playing" :size="18" />
          <Play v-else :size="18" />
        </button>
        <button
          class="cursor-pointer"
          type="button"
          :aria-label="muted ? 'Unmute' : 'Mute'"
          :title="muted ? 'Unmute' : 'Mute'"
          @click="toggleMute"
        >
          <VolumeX v-if="muted" :size="18" />
          <Volume2 v-else :size="18" />
        </button>
        <span class="text-sm tabular-nums">{{ formatClock(currentTime) }} / {{ formatClock(duration) }}</span>
      </div>
      <p v-if="error" class="mt-2 text-xs text-red-300">{{ error }}</p>
    </div>
  </div>
</template>
