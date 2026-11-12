<script setup lang="ts">
import { Pause, Play, Volume2, VolumeX } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BRAND } from '../../../lib/brand'
import { formatClock } from '../../../lib/format'
import { combineSequencePeaks, playbackProgress, resamplePeaks, WAVEFORM_PLAYED_OPACITY, WAVEFORM_UNPLAYED_OPACITY } from '../lib/waveform'
import { useAudioLooperStore, type LooperTrack } from '../stores/audioLooper'

const store = useAudioLooperStore()
const primary = ref<HTMLAudioElement | null>(null)
const secondary = ref<HTMLAudioElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const playing = ref(false)
const muted = ref(false)
const sequenceTime = ref(0)
const trackIndex = ref(0)
const error = ref<string | null>(null)
const mixTime = ref(0)
const mixDuration = ref(0)

let raf = 0
let fading = false
let advancing = false
let fadeStartedAt = 0
let usingPrimary = true
let resizeObserver: ResizeObserver | null = null
let displayPeaks: Float32Array | null = null
let lastBarCount = 0
let lastSource: Float32Array | null = null

const mixMode = computed(() => store.previewOwner === 'mix' && Boolean(store.mixPreviewUrl))
const tracks = computed(() => store.readyTracks)
const period = computed(() => (store.sequencePeriod > 0 ? store.sequencePeriod : 0))
const crossfade = computed(() => (store.playlistCrossfade && !store.settingsError ? store.playlistCrossfadeSeconds : 0))
const audible = computed(() => tracks.value[trackIndex.value] ?? tracks.value[0] ?? null)
const sequencePeaks = computed(() => combineSequencePeaks(
  tracks.value.map((track) => ({
    peaks: track.waveform?.peaks ?? null,
    duration: track.waveform?.duration || track.duration || 0,
    trimStart: track.trimStart,
    length: lengthOf(track),
  })),
  crossfade.value,
))
const clockNow = computed(() => (mixMode.value ? mixTime.value : sequenceTime.value))
const clockTotal = computed(() => (mixMode.value ? mixDuration.value : period.value))

function lengthOf(track: LooperTrack): number {
  return store.trimmedLength(track)
}

function offsetOf(index: number): number {
  const fade = crossfade.value
  let offset = 0
  for (let cursor = 0; cursor < index; cursor += 1) {
    const track = tracks.value[cursor]
    if (!track) continue
    offset += Math.max(0, lengthOf(track) - fade)
  }
  return Math.max(0, offset)
}

function activeAudio(): HTMLAudioElement | null {
  return usingPrimary ? primary.value : secondary.value
}

function idleAudio(): HTMLAudioElement | null {
  return usingPrimary ? secondary.value : primary.value
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
  const ratio = playbackProgress(clockNow.value, clockTotal.value || 1)
  const progressX = ratio * width
  const peaks = mixMode.value ? null : sequencePeaks.value
  if (peaks && peaks.length > 0) {
    const barCount = Math.max(48, Math.min(peaks.length, Math.floor(width / 2.5)))
    if (!displayPeaks || lastSource !== peaks || lastBarCount !== barCount) {
      displayPeaks = resamplePeaks(peaks, barCount)
      lastBarCount = barCount
      lastSource = peaks
    }
    drawBars(ctx, width, height, displayPeaks, progressX)
  } else {
    ctx.globalAlpha = WAVEFORM_UNPLAYED_OPACITY
    ctx.fillStyle = BRAND
    ctx.fillRect(0, height / 2 - 1.5, width, 3)
    if (progressX > 0) {
      ctx.globalAlpha = WAVEFORM_PLAYED_OPACITY
      ctx.fillRect(0, height / 2 - 1.5, progressX, 3)
    }
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = '#f4f4f5'
  ctx.fillRect(Math.min(width - 1, Math.max(0, progressX)), 6, 1.5, height - 12)
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
    for (let index = 0; index < peaks.length; index += 1) {
      const amp = Math.max(2, (peaks[index] ?? 0) * maxAmp)
      ctx.fillRect(index * bar, mid - amp, Math.max(1, bar - 0.8), amp * 2)
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

function stopLoop(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function tick(): void {
  raf = 0
  if (mixMode.value) {
    const audio = primary.value
    mixTime.value = audio?.currentTime ?? 0
    if (audio?.duration && Number.isFinite(audio.duration)) mixDuration.value = audio.duration
    paint()
    if (playing.value) raf = requestAnimationFrame(tick)
    return
  }
  const audio = activeAudio()
  const track = tracks.value[trackIndex.value]
  if (!audio || !track) return
  const fade = crossfade.value
  const into = Math.max(0, audio.currentTime - track.trimStart)
  sequenceTime.value = Math.min(period.value || into, offsetOf(trackIndex.value) + into)
  if (fading && fade > 0) {
    const ramp = Math.min(1, (performance.now() - fadeStartedAt) / (fade * 1000))
    const outgoing = activeAudio()
    const incoming = idleAudio()
    if (!muted.value && outgoing && incoming) {
      outgoing.volume = Math.cos(ramp * Math.PI / 2)
      incoming.volume = Math.sin(ramp * Math.PI / 2)
    }
  }
  const end = track.trimEnd ?? track.duration ?? 0
  if (playing.value && fade > 0 && !fading && end - audio.currentTime <= fade && end - audio.currentTime > 0.05) {
    void beginCrossfade()
  }
  if (end > 0 && audio.currentTime >= end - 0.04) {
    void advance(fade > 0)
  }
  paint()
  if (playing.value) raf = requestAnimationFrame(tick)
}

function startLoop(): void {
  if (!raf) raf = requestAnimationFrame(tick)
}

async function beginCrossfade(): Promise<void> {
  fading = true
  fadeStartedAt = performance.now()
  const next = tracks.value[(trackIndex.value + 1) % tracks.value.length]
  const idle = idleAudio()
  if (!next || !idle) return
  idle.src = next.objectUrl
  idle.currentTime = next.trimStart
  idle.volume = 0
  try {
    await idle.play()
  } catch {
    error.value = 'This browser could not play the next track.'
  }
}

async function advance(fromFade: boolean): Promise<void> {
  if (advancing) return
  advancing = true
  try {
    const nextIndex = (trackIndex.value + 1) % tracks.value.length
    const next = tracks.value[nextIndex]
    if (!next) return
    if (fromFade) {
      activeAudio()?.pause()
      usingPrimary = !usingPrimary
      fading = false
      const audio = activeAudio()
      if (audio && !muted.value) audio.volume = 1
    } else {
      const audio = activeAudio()
      if (!audio) return
      audio.pause()
      audio.src = next.objectUrl
      audio.currentTime = next.trimStart
      audio.volume = muted.value ? 0 : 1
      try {
        await audio.play()
      } catch {
        error.value = 'This browser could not play the next track.'
        playing.value = false
        return
      }
    }
    trackIndex.value = nextIndex
    store.setSequenceTrack(next.id)
    if (nextIndex === 0) sequenceTime.value = 0
  } finally {
    advancing = false
  }
}

async function toggle(): Promise<void> {
  error.value = null
  if (mixMode.value) {
    const audio = primary.value
    if (!audio) return
    if (audio.paused) {
      store.claimPreview('mix')
      try {
        await audio.play()
        playing.value = true
        startLoop()
      } catch {
        error.value = 'This browser could not play the mix preview.'
      }
    } else {
      audio.pause()
      playing.value = false
      stopLoop()
    }
    return
  }
  if (tracks.value.length === 0) return
  const audio = activeAudio()
  if (!audio) return
  if (playing.value) {
    audio.pause()
    idleAudio()?.pause()
    playing.value = false
    fading = false
    stopLoop()
    return
  }
  const track = tracks.value[trackIndex.value] ?? tracks.value[0]
  if (!track) return
  store.claimPreview('sequence')
  usingPrimary = true
  const start = audio.src.includes(track.objectUrl) ? Math.max(track.trimStart, audio.currentTime || track.trimStart) : track.trimStart
  primary.value!.src = track.objectUrl
  primary.value!.currentTime = start
  primary.value!.volume = muted.value ? 0 : 1
  store.setSequenceTrack(track.id)
  try {
    await primary.value!.play()
    playing.value = true
    startLoop()
  } catch {
    error.value = 'This browser could not play the audio file.'
  }
}

function toggleMute(): void {
  muted.value = !muted.value
  const level = muted.value ? 0 : 1
  if (primary.value && !fading) primary.value.volume = level
  if (secondary.value && !fading) secondary.value.volume = level
  if (muted.value) {
    if (primary.value) primary.value.volume = 0
    if (secondary.value) secondary.value.volume = 0
  }
}

function seekTo(time: number): void {
  if (mixMode.value) {
    const audio = primary.value
    if (!audio || !(mixDuration.value > 0)) return
    audio.currentTime = Math.max(0, Math.min(mixDuration.value, time))
    mixTime.value = audio.currentTime
    paint()
    return
  }
  const list = tracks.value
  if (list.length === 0 || !(period.value > 0)) return
  const target = Math.max(0, Math.min(period.value - 0.01, time))
  let index = 0
  for (let cursor = 0; cursor < list.length; cursor += 1) {
    const start = offsetOf(cursor)
    const span = Math.max(0.05, lengthOf(list[cursor]!) - (cursor === list.length - 1 ? 0 : crossfade.value))
    index = cursor
    if (target < start + span) break
  }
  const track = list[index]
  if (!track) return
  fading = false
  idleAudio()?.pause()
  usingPrimary = true
  const audio = primary.value
  if (!audio) return
  const local = track.trimStart + Math.max(0, target - offsetOf(index))
  audio.src = track.objectUrl
  audio.currentTime = Math.min((track.trimEnd ?? track.duration ?? local) - 0.02, Math.max(track.trimStart, local))
  trackIndex.value = index
  sequenceTime.value = target
  store.setSequenceTrack(track.id)
  if (playing.value) void audio.play()
  paint()
}

function onPointerDown(event: PointerEvent): void {
  const el = canvas.value
  if (!el || event.button !== 0) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  seekTo(ratio * (clockTotal.value || 0))
}

function stopPlayback(): void {
  playing.value = false
  fading = false
  primary.value?.pause()
  secondary.value?.pause()
  stopLoop()
  store.setSequenceTrack(null)
}

watch(
  () => store.previewOwner,
  (owner) => {
    if (owner !== 'sequence' && owner !== 'mix') stopPlayback()
  },
)

watch(
  () => store.mixPreviewUrl,
  (url) => {
    if (!url) return
    stopPlayback()
    const audio = primary.value
    if (!audio) return
    audio.src = url
    audio.currentTime = 0
    mixTime.value = 0
    store.claimPreview('mix')
    void audio.play().then(() => {
      playing.value = true
      startLoop()
    }).catch(() => {
      error.value = 'This browser could not play the mix preview.'
    })
  },
)

watch(
  () => `${crossfade.value}|${tracks.value.map((track) => `${track.id}:${track.trimStart}:${track.trimEnd}`).join('|')}`,
  () => {
    displayPeaks = null
    lastSource = null
    if (playing.value && !mixMode.value) stopPlayback()
    trackIndex.value = 0
    sequenceTime.value = 0
    paint()
  },
)

watch(sequencePeaks, () => {
  displayPeaks = null
  lastSource = null
  paint()
})

onMounted(() => {
  resizeObserver = new ResizeObserver(() => paint())
  if (canvas.value) resizeObserver.observe(canvas.value)
  paint()
})

onBeforeUnmount(() => {
  stopPlayback()
  resizeObserver?.disconnect()
  primary.value?.pause()
  secondary.value?.pause()
})
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-zinc-700 bg-black shadow-2xl">
    <audio ref="primary" class="hidden" preload="auto" />
    <audio ref="secondary" class="hidden" preload="auto" />
    <div class="px-3 pt-3">
      <canvas
        ref="canvas"
        class="h-24 w-full cursor-pointer touch-none rounded-md sm:h-28"
        role="slider"
        tabindex="0"
        aria-label="Seek sequence"
        :aria-valuemin="0"
        :aria-valuemax="clockTotal"
        :aria-valuenow="clockNow"
        :aria-valuetext="`${formatClock(clockNow)} of ${formatClock(clockTotal)}`"
        @pointerdown="onPointerDown"
      />
    </div>
    <div class="w-full px-3 pb-3 pt-2">
      <div class="flex items-center gap-3 text-white">
        <button class="cursor-pointer" type="button" :aria-label="playing ? 'Pause' : 'Play'" @click="toggle">
          <Pause v-if="playing" :size="18" />
          <Play v-else :size="18" />
        </button>
        <button class="cursor-pointer" type="button" :aria-label="muted ? 'Unmute' : 'Mute'" @click="toggleMute">
          <VolumeX v-if="muted" :size="18" />
          <Volume2 v-else :size="18" />
        </button>
        <span class="text-sm tabular-nums">{{ formatClock(clockNow) }} / {{ formatClock(clockTotal) }}</span>
        <span class="truncate text-xs text-zinc-400">{{ mixMode ? 'Server mix' : audible ? store.displayName(audible) : '' }}</span>
      </div>
      <p v-if="error" class="mt-2 text-xs text-red-300">{{ error }}</p>
    </div>
  </div>
</template>
