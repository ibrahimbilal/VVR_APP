<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { itemInlineUrl, itemPreviewUrl } from '../lib/upscalerApi'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
const viewport = ref<HTMLElement | null>(null)
const split = ref(50)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const viewWidth = ref(1)
const viewHeight = ref(1)
let drag: 'split' | 'pan' | null = null
let startX = 0
let startY = 0
let startPanX = 0
let startPanY = 0
let resizeObserver: ResizeObserver | null = null

const showFull = ref(false)
watch(
  () => store.selected?.localId,
  () => {
    showFull.value = false
  },
)
const fullUrl = computed(() => {
  const item = store.selected
  if (!showFull.value || !item || item.status !== 'completed' || !store.jobId || !item.serverItemId) return ''
  return itemInlineUrl(store.jobId, item.serverItemId)
})

const afterUrl = computed(() => {
  const item = store.selected
  if (!item || item.status !== 'completed' || !store.jobId || !item.serverItemId) return ''
  return itemPreviewUrl(store.jobId, item.serverItemId)
})

const layerStyle = computed(() => ({
  transformOrigin: '0 0',
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
}))

const dividerLeft = computed(() => panX.value + (split.value / 100) * viewWidth.value * zoom.value)

function measure(): void {
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return
  viewWidth.value = rect.width
  viewHeight.value = rect.height
}

function resetView(): void {
  split.value = 50
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

function clampPan(): void {
  const width = viewWidth.value
  const height = viewHeight.value
  const margin = 48
  const scaledWidth = width * zoom.value
  const scaledHeight = height * zoom.value
  panX.value = Math.min(width - margin, Math.max(margin - scaledWidth, panX.value))
  panY.value = Math.min(height - margin, Math.max(margin - scaledHeight, panY.value))
}

/** Keep the viewport point (anchorX, anchorY) on the same image pixel while zoom changes. */
function setZoomAround(next: number, anchorX: number, anchorY: number): void {
  const previous = zoom.value
  const nextZoom = Math.min(4, Math.max(1, next))
  if (Math.abs(nextZoom - previous) < 0.001) return
  const localX = (anchorX - panX.value) / previous
  const localY = (anchorY - panY.value) / previous
  zoom.value = nextZoom
  if (nextZoom === 1) {
    panX.value = 0
    panY.value = 0
    return
  }
  panX.value = anchorX - localX * nextZoom
  panY.value = anchorY - localY * nextZoom
  clampPan()
}

function setZoom(next: number): void {
  measure()
  setZoomAround(next, viewWidth.value / 2, viewHeight.value / 2)
}

function onWheel(event: WheelEvent): void {
  if (!viewport.value) return
  const rect = viewport.value.getBoundingClientRect()
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
  setZoomAround(zoom.value * factor, event.clientX - rect.left, event.clientY - rect.top)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') split.value = Math.max(0, split.value - 2)
  else if (event.key === 'ArrowRight') split.value = Math.min(100, split.value + 2)
  else if (event.key === '+' || event.key === '=') setZoom(zoom.value + 0.25)
  else if (event.key === '-' || event.key === '_') setZoom(zoom.value - 0.25)
  else if (event.key === 'Home' || event.key === '0') resetView()
  else return
  event.preventDefault()
}

function onPointerDown(event: PointerEvent): void {
  if (!viewport.value) return
  const target = event.target instanceof Element ? event.target.closest('[data-divider]') : null
  drag = target ? 'split' : zoom.value > 1 ? 'pan' : null
  if (!drag) return
  startX = event.clientX
  startY = event.clientY
  startPanX = panX.value
  startPanY = panY.value
  viewport.value.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!drag || !viewport.value) return
  measure()
  if (drag === 'split') {
    const rect = viewport.value.getBoundingClientRect()
    const localX = (event.clientX - rect.left - panX.value) / zoom.value
    split.value = Math.min(100, Math.max(0, (localX / viewWidth.value) * 100))
    return
  }
  panX.value = startPanX + (event.clientX - startX)
  panY.value = startPanY + (event.clientY - startY)
  clampPan()
}

function onPointerUp(): void {
  drag = null
}

onMounted(() => {
  void nextTick().then(() => {
    measure()
    if (!viewport.value) return
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(viewport.value)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div class="flex h-full min-h-[280px] flex-col gap-3">
    <div
      ref="viewport"
      class="relative min-h-0 flex-1 touch-none overflow-hidden rounded-xl border border-zinc-800 bg-black"
      :class="zoom > 1 ? 'cursor-grab' : ''"
      tabindex="0"
      role="application"
      aria-label="Before and after comparison. Arrow keys move the divider. Plus and minus change zoom. Scroll to zoom toward the pointer."
      @keydown="onKeydown"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="absolute inset-0 bg-black select-none" :style="layerStyle">
        <img :src="store.selected?.previewUrl" alt="Before" class="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        <img
          :src="afterUrl"
          alt="After"
          class="pointer-events-none absolute inset-0 h-full w-full object-contain"
          :style="{ clipPath: `inset(0 ${100 - split}% 0 0)` }"
        />
      </div>
      <div
        class="absolute inset-y-0 z-10 w-10 -translate-x-1/2 cursor-ew-resize bg-white/0"
        :style="{ left: `${dividerLeft}px` }"
        data-divider
        role="slider"
        tabindex="0"
        aria-label="Comparison divider"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(split)"
        @keydown="onKeydown"
      >
        <div class="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white"></div>
        <div class="pointer-events-none absolute top-1/2 left-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-black/70 text-[10px] font-bold text-white">
          ||
        </div>
      </div>
      <span v-show="dividerLeft > 72" class="pointer-events-none absolute top-3 left-3 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold">Before</span>
      <span v-show="viewWidth - dividerLeft > 72" class="pointer-events-none absolute top-3 right-3 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold">After</span>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex min-w-[10rem] flex-1 items-center gap-2 text-xs text-zinc-400">
        Zoom {{ zoom.toFixed(2) }}×
        <input :value="zoom" class="w-full" type="range" min="1" max="4" step="0.05" aria-label="Zoom" @input="setZoom(Number(($event.target as HTMLInputElement).value))" />
      </label>
      <button class="btn btn-ghost cursor-pointer" type="button" @click="resetView">Reset view</button>
      <button class="btn btn-ghost cursor-pointer" type="button" @click="showFull = !showFull">
        {{ showFull ? 'Hide full resolution' : 'Inspect full resolution' }}
      </button>
    </div>
    <p class="text-[11px] leading-relaxed text-zinc-500">
      Both sides use the same preview size. Scroll or use the slider to zoom, then drag the picture to pan. The original is not blurred. This preview is not the downloaded file.
    </p>
    <div v-if="showFull && fullUrl" class="max-h-80 overflow-auto rounded-xl border border-zinc-800 bg-black">
      <p class="sticky top-0 z-10 bg-black/80 px-3 py-2 text-[11px] leading-relaxed text-zinc-300">
        Full-resolution output at 100%. This is the processed file, not the comparison preview.
      </p>
      <img :src="fullUrl" alt="Full resolution output" class="max-w-none" />
    </div>
  </div>
</template>
