<script setup lang="ts">
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Check,
  Crop,
  Expand,
  Pause,
  Play,
  Redo2,
  RefreshCw,
  RotateCcw,
  Scan,
  Shrink,
  Undo2,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useScreensaverDrawScheduler } from '../composables/useScreensaverDrawScheduler'
import { imageContains } from '../lib/composeCanvas'
import { createCanvas2DScreensaverRenderer, createScreensaverRenderer } from '../lib/render/createScreensaverRenderer'
import { createWebGL2ScreensaverRenderer } from '../lib/render/createWebGL2ScreensaverRenderer'
import type { ScreensaverImageRenderer, ScreensaverRenderInput } from '../lib/render/types'
import { useScreensaverStore } from '../stores/screensaver'

const store = useScreensaverStore()
const { previewRenderer } = storeToRefs(store)
const shell = ref<HTMLElement | null>(null)
const shellHeight = ref(180)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
/** New DOM canvas per backend switch (WebGL and 2D cannot share one canvas). */
const previewCanvasKey = ref(0)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const media = ref<CanvasImageSource | null>(null)
const mediaWidth = ref(0)
const mediaHeight = ref(0)
const selected = ref(false)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
let renderer: ScreensaverImageRenderer | null = null
const scheduler = useScreensaverDrawScheduler(() => renderer)
function webGlBlockedBySession(): boolean {
  try {
    return sessionStorage.getItem('vvr-screensaver-webgl-failed') === '1'
  } catch {
    return false
  }
}

function rendererLifecycleOptions() {
  return {
    onRestoreFailed: () => {
      if (store.previewRenderer === 'auto') {
        try {
          sessionStorage.setItem('vvr-screensaver-webgl-failed', '1')
        } catch {
          // ignore
        }
      }
      void remountPreviewRenderer()
    },
  }
}

async function remountPreviewRenderer(): Promise<void> {
  scheduler.cancel()
  renderer?.dispose()
  renderer = null
  previewCanvasKey.value += 1
  await nextTick()
  await mountRenderer()
  resize()
}

async function mountRenderer(): Promise<void> {
  const preview = previewCanvas.value
  if (!preview) return
  const mode = store.previewRenderer
  const lifecycle = rendererLifecycleOptions()
  if (mode === 'canvas2d') {
    renderer = await createCanvas2DScreensaverRenderer(preview)
  } else if (mode === 'webgl2') {
    try {
      renderer = await createWebGL2ScreensaverRenderer(preview, lifecycle)
    } catch {
      renderer = await createCanvas2DScreensaverRenderer(preview)
    }
  } else if (webGlBlockedBySession()) {
    renderer = await createCanvas2DScreensaverRenderer(preview)
  } else {
    renderer = await createScreensaverRenderer(preview, lifecycle)
  }
  if (shell.value) {
    const width = Math.max(320, shell.value.clientWidth)
    const height = Math.round((width * 9) / 16)
    shellHeight.value = height
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    renderer.resize(width, height, Math.round(width * ratio), Math.round(height * ratio))
  }
  store.setPreviewRendererActive(renderer.backend)
  draw()
}
let gesture: null | { kind: 'move' | 'scale' | 'rotate'; startX: number; startY: number; originX: number; originY: number; originW: number; originH: number; originRot: number; startAngle: number } = null
let cropGesture: null | { kind: 'move' | 'resize'; handle: string; start: { x: number; y: number; w: number; h: number }; pointer: { x: number; y: number } } = null
let pointers = new Map<number, { x: number; y: number }>()
let pinch: { dist: number; zoom: number } | null = null

const cropAspects = [
  ['free', 'Free'],
  ['16:9', '16:9'],
  ['4:3', '4:3'],
  ['3:2', '3:2'],
  ['1:1', '1:1'],
  ['original', 'Original'],
  ['custom', 'Custom'],
] as const

const viewLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const playing = ref(false)
const audioRef = ref<HTMLAudioElement | null>(null)

function togglePlay() {
  const video = media.value
  if (!(video instanceof HTMLVideoElement)) return
  if (video.paused) void video.play().then(() => (playing.value = true))
  else {
    video.pause()
    playing.value = false
  }
}

function loadMedia(url: string | null, kind: 'image' | 'video' | null) {
  media.value = null
  mediaWidth.value = 0
  mediaHeight.value = 0
  if (!url || !kind) {
    media.value = null
    draw()
    return
  }
  if (kind === 'image') {
    const image = new Image()
    image.onload = () => {
      media.value = image
      mediaWidth.value = image.naturalWidth
      mediaHeight.value = image.naturalHeight
      draw()
    }
    image.src = url
    return
  }
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.loop = true
  video.preload = 'auto'
  video.onloadeddata = () => {
    media.value = video
    mediaWidth.value = video.videoWidth
    mediaHeight.value = video.videoHeight
    draw()
  }
  video.onplay = () => {
    const tick = () => {
      if (video.paused) return
      draw()
      requestAnimationFrame(tick)
    }
    tick()
  }
  video.src = url
}

function resize() {
  const preview = previewCanvas.value
  const overlay = overlayCanvas.value
  const host = shell.value
  if (!preview || !overlay || !host) return
  const width = Math.max(320, host.clientWidth)
  const height = Math.round((width * 9) / 16)
  shellHeight.value = height
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  for (const element of [preview, overlay]) {
    element.style.width = `${width}px`
    element.style.height = `${height}px`
    element.width = pixelWidth
    element.height = pixelHeight
  }
  renderer?.resize(width, height, pixelWidth, pixelHeight)
  draw()
}

function buildRenderInput(): ScreensaverRenderInput {
  return {
    composition: store.composition,
    compareAdjustments: store.compareAdjustments,
    frame: store.frameImage,
    source: media.value,
    sourceWidth: mediaWidth.value,
    sourceHeight: mediaHeight.value,
    view: { panX: panX.value, panY: panY.value, zoom: zoom.value },
    previewReducedQuality: store.previewInteracting,
  }
}

function draw() {
  const preview = previewCanvas.value
  const overlay = overlayCanvas.value
  if (!preview || !overlay) return
  const octx = overlay.getContext('2d')
  if (!octx) return
  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.clearRect(0, 0, overlay.width, overlay.height)
  if (store.cropEditing && media.value) {
    const pctx = preview.getContext('2d')
    pctx?.clearRect(0, 0, preview.width, preview.height)
    drawCrop(octx, overlay)
    return
  }
  scheduler.scheduleDraw(() => buildRenderInput(), () => {
    if (selected.value && media.value) {
      const ctx = overlay.getContext('2d')
      if (ctx) drawHandles(ctx, overlay)
    }
  })
}

function drawCrop(ctx: CanvasRenderingContext2D, element: HTMLCanvasElement) {
  const box = sourceBox(element)
  ctx.fillStyle = '#101114'
  ctx.fillRect(0, 0, element.width, element.height)
  if (media.value) ctx.drawImage(media.value, box.x, box.y, box.w, box.h)
  const crop = store.composition.crop
  const rect = {
    x: box.x + crop.x * box.w,
    y: box.y + crop.y * box.h,
    w: crop.w * box.w,
    h: crop.h * box.h,
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, element.width, element.height)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h)
  if (media.value) ctx.drawImage(media.value, box.x, box.y, box.w, box.h)
  ctx.restore()
  ctx.strokeStyle = '#ffcc33'
  ctx.lineWidth = 2
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
}

function drawHandles(ctx: CanvasRenderingContext2D, element: HTMLCanvasElement) {
  const corners = imageCorners().map((point) => forward(point.x, point.y, element))
  ctx.strokeStyle = '#ffcc33'
  ctx.lineWidth = 2
  ctx.beginPath()
  corners.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
  ctx.closePath()
  ctx.stroke()
  for (const point of corners) {
    ctx.fillStyle = '#101114'
    ctx.strokeStyle = '#ffcc33'
    ctx.fillRect(point.x - 6, point.y - 6, 12, 12)
    ctx.strokeRect(point.x - 6, point.y - 6, 12, 12)
  }
  const top = forward(store.composition.x + store.composition.width / 2, store.composition.y, element)
  const knob = { x: top.x, y: top.y - 28 }
  ctx.beginPath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(knob.x, knob.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(knob.x, knob.y, 7, 0, Math.PI * 2)
  ctx.fillStyle = '#ffcc33'
  ctx.fill()
}

function sourceBox(element: HTMLCanvasElement) {
  const scale = Math.min(element.width / mediaWidth.value, element.height / mediaHeight.value)
  const w = mediaWidth.value * scale
  const h = mediaHeight.value * scale
  return { x: (element.width - w) / 2, y: (element.height - h) / 2, w, h }
}

function imageCorners() {
  const composition = store.composition
  const cx = composition.x + composition.width / 2
  const cy = composition.y + composition.height / 2
  const hw = composition.width / 2
  const hh = composition.height / 2
  const rad = (composition.rotation * Math.PI) / 180
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([lx, ly]) => ({
    x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
  }))
}

function forward(nx: number, ny: number, element: HTMLCanvasElement) {
  const cx = element.width / 2
  const cy = element.height / 2
  return {
    x: (nx * element.width - cx) * zoom.value + cx + panX.value * element.width,
    y: (ny * element.height - cy) * zoom.value + cy + panY.value * element.height,
  }
}

function normFromEvent(event: PointerEvent): { x: number; y: number } | null {
  const element = overlayCanvas.value
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * element.width
  const y = ((event.clientY - rect.top) / rect.height) * element.height
  const cx = element.width / 2
  const cy = element.height / 2
  const px = (x - cx - panX.value * element.width) / zoom.value + cx
  const py = (y - cy - panY.value * element.height) / zoom.value + cy
  return { x: px / element.width, y: py / element.height }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.pointerType === 'mouse') return
  store.setPreviewInteracting(true)
  shell.value?.focus()
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    pinch = { dist: pointerDistance(), zoom: zoom.value }
    gesture = null
    return
  }
  const element = overlayCanvas.value
  if (!element || !shell.value) return
  try {
    shell.value.setPointerCapture(event.pointerId)
  } catch {
    // A pointer that cannot be captured still delivers move and up through the shell.
  }
  if (store.cropEditing) {
    startCrop(event)
    return
  }
  const point = normFromEvent(event)
  if (!point) return
  const handle = hitHandle(event)
  if (handle === 'rotate') {
    const centerX = store.composition.x + store.composition.width / 2
    const centerY = store.composition.y + store.composition.height / 2
    gesture = {
      kind: 'rotate',
      startX: point.x,
      startY: point.y,
      originX: store.composition.x,
      originY: store.composition.y,
      originW: store.composition.width,
      originH: store.composition.height,
      originRot: store.composition.rotation,
      startAngle: Math.atan2(point.y - centerY, point.x - centerX),
    }
    selected.value = true
    return
  }
  if (handle === 'scale') {
    gesture = {
      kind: 'scale',
      startX: point.x,
      startY: point.y,
      originX: store.composition.x,
      originY: store.composition.y,
      originW: store.composition.width,
      originH: store.composition.height,
      originRot: store.composition.rotation,
      startAngle: 0,
    }
    selected.value = true
    return
  }
  if (imageContains(store.composition, point.x, point.y)) {
    selected.value = true
    gesture = {
      kind: 'move',
      startX: point.x,
      startY: point.y,
      originX: store.composition.x,
      originY: store.composition.y,
      originW: store.composition.width,
      originH: store.composition.height,
      originRot: store.composition.rotation,
      startAngle: 0,
    }
  }
}

function onPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch && pointers.size >= 2) {
    const dist = pointerDistance()
    if (pinch.dist > 0) zoom.value = clamp(pinch.zoom * (dist / pinch.dist), 0.25, 4)
    draw()
    return
  }
  if (cropGesture) {
    moveCrop(event)
    return
  }
  if (!gesture) return
  const point = normFromEvent(event)
  if (!point) return
  const composition = { ...store.composition }
  if (gesture.kind === 'move') {
    composition.x = gesture.originX + (point.x - gesture.startX)
    composition.y = gesture.originY + (point.y - gesture.startY)
  } else if (gesture.kind === 'scale') {
    const centerX = gesture.originX + gesture.originW / 2
    const centerY = gesture.originY + gesture.originH / 2
    const start = Math.hypot(gesture.startX - centerX, gesture.startY - centerY) || 0.001
    const next = Math.hypot(point.x - centerX, point.y - centerY)
    const factor = clamp(next / start, 0.05, 8)
    composition.width = gesture.originW * factor
    composition.height = gesture.originH * factor
    composition.x = centerX - composition.width / 2
    composition.y = centerY - composition.height / 2
  } else {
    const centerX = gesture.originX + gesture.originW / 2
    const centerY = gesture.originY + gesture.originH / 2
    const angle = Math.atan2(point.y - centerY, point.x - centerX)
    let rotation = gesture.originRot + ((angle - gesture.startAngle) * 180) / Math.PI
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
    composition.rotation = clamp(rotation, -180, 180)
  }
  store.replaceComposition(composition)
  draw()
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinch = null
  if (gesture || cropGesture) store.commitComposition()
  gesture = null
  cropGesture = null
  if (pointers.size === 0) store.setPreviewInteracting(false)
}

function hitHandle(event: PointerEvent): 'scale' | 'rotate' | null {
  const element = overlayCanvas.value
  if (!element || !selected.value) return null
  const rect = element.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * element.width
  const y = ((event.clientY - rect.top) / rect.height) * element.height
  const corners = imageCorners().map((point) => forward(point.x, point.y, element))
  if (corners.some((point) => Math.hypot(point.x - x, point.y - y) < 16)) return 'scale'
  const top = forward(store.composition.x + store.composition.width / 2, store.composition.y, element)
  if (Math.hypot(top.x - x, top.y - 28 - y) < 16) return 'rotate'
  return null
}

function startCrop(event: PointerEvent) {
  const element = overlayCanvas.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * element.width
  const y = ((event.clientY - rect.top) / rect.height) * element.height
  const box = sourceBox(element)
  const crop = store.composition.crop
  const left = box.x + crop.x * box.w
  const top = box.y + crop.y * box.h
  const right = left + crop.w * box.w
  const bottom = top + crop.h * box.h
  const near = (px: number, py: number) => Math.hypot(px - x, py - y) < 18
  let handle = ''
  if (near(left, top)) handle = 'nw'
  else if (near(right, top)) handle = 'ne'
  else if (near(right, bottom)) handle = 'se'
  else if (near(left, bottom)) handle = 'sw'
  cropGesture = {
    kind: handle ? 'resize' : 'move',
    handle,
    start: { ...crop },
    pointer: { x, y },
  }
}

function moveCrop(event: PointerEvent) {
  const element = overlayCanvas.value
  if (!element || !cropGesture) return
  const rect = element.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * element.width
  const y = ((event.clientY - rect.top) / rect.height) * element.height
  const box = sourceBox(element)
  const dx = (x - cropGesture.pointer.x) / box.w
  const dy = (y - cropGesture.pointer.y) / box.h
  const start = cropGesture.start
  let next = { ...start }
  if (cropGesture.kind === 'move') {
    next.x = clamp(start.x + dx, 0, 1 - start.w)
    next.y = clamp(start.y + dy, 0, 1 - start.h)
  } else {
    if (cropGesture.handle.includes('e')) next.w = clamp(start.w + dx, 0.05, 1 - start.x)
    if (cropGesture.handle.includes('s')) next.h = clamp(start.h + dy, 0.05, 1 - start.y)
    if (cropGesture.handle.includes('w')) {
      next.x = clamp(start.x + dx, 0, start.x + start.w - 0.05)
      next.w = start.w + (start.x - next.x)
    }
    if (cropGesture.handle.includes('n')) {
      next.y = clamp(start.y + dy, 0, start.y + start.h - 0.05)
      next.h = start.h + (start.y - next.y)
    }
    next = lockCrop(next)
  }
  store.replaceComposition({ ...store.composition, crop: next })
  draw()
}

function lockCrop(crop: { x: number; y: number; w: number; h: number }) {
  const ratio = store.cropRatio(mediaWidth.value, mediaHeight.value)
  if (!ratio) return crop
  const pixelRatio = ratio * (mediaHeight.value / Math.max(1, mediaWidth.value))
  let w = crop.w
  let h = w / pixelRatio
  if (h > 1) {
    h = 1
    w = h * pixelRatio
  }
  if (w > 1) {
    w = 1
    h = w / pixelRatio
  }
  return {
    x: clamp(crop.x, 0, 1 - w),
    y: clamp(crop.y, 0, 1 - h),
    w,
    h,
  }
}

function pointerDistance(): number {
  const points = [...pointers.values()]
  if (points.length < 2) return 0
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const next = zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)
  zoom.value = clamp(next, 0.25, 4)
  draw()
}

function nudge(event: KeyboardEvent) {
  if (document.activeElement !== shell.value) return
  if (!event.key.startsWith('Arrow')) return
  event.preventDefault()
  const step = (event.shiftKey ? 10 : 1) / store.outputWidth
  const composition = { ...store.composition }
  if (event.key === 'ArrowLeft') composition.x -= step
  if (event.key === 'ArrowRight') composition.x += step
  if (event.key === 'ArrowUp') composition.y -= step
  if (event.key === 'ArrowDown') composition.y += step
  store.replaceComposition(composition)
  store.commitComposition()
  draw()
}

function resetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  draw()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

watch(
  () => [store.audioUrl, store.audioMode, store.audioVolume, store.loopAudio] as const,
  () => {
    const audio = audioRef.value
    if (!audio) return
    if (store.audioUrl && store.audioMode === 'upload') {
      if (audio.src !== store.audioUrl) audio.src = store.audioUrl
      audio.loop = store.loopAudio
      audio.volume = store.audioVolume
    } else {
      audio.removeAttribute('src')
    }
  },
)
watch(
  () => [store.objectUrl, store.mediaKind] as const,
  ([url, kind]) => loadMedia(url, kind),
  { immediate: true },
)
watch(
  () => [store.composition, store.compareAdjustments, store.cropEditing, store.outputWidth, store.outputHeight, store.frameImage],
  () => draw(),
  { deep: true },
)
watch(previewRenderer, () => {
  void remountPreviewRenderer()
})

let observer: ResizeObserver | null = null
onMounted(() => {
  void remountPreviewRenderer()
  observer = new ResizeObserver(() => resize())
  if (shell.value) observer.observe(shell.value)
  shell.value?.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', nudge)
})
onBeforeUnmount(() => {
  scheduler.cancel()
  renderer?.dispose()
  renderer = null
  observer?.disconnect()
  shell.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('keydown', nudge)
})
</script>

<template>
  <div class="flex w-full flex-col">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <span class="text-xs text-zinc-500">{{ viewLabel }}</span>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Zoom out" title="Zoom out" @click="zoom = clamp(zoom - 0.1, 0.25, 4); draw()">
        <ZoomOut :size="16" />
      </button>
      <input v-model.number="zoom" class="w-28 cursor-pointer" type="range" min="0.25" max="4" step="0.05" aria-label="View zoom" @input="draw" />
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Zoom in" title="Zoom in" @click="zoom = clamp(zoom + 0.1, 0.25, 4); draw()">
        <ZoomIn :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Fit view" title="Fit view" @click="resetView">
        <Scan :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Reset zoom" title="Reset zoom" @click="resetView">
        <RotateCcw :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Fit image" title="Fit image" @click="store.fitContain(); selected = true">
        <Shrink :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Fill canvas" title="Fill canvas" @click="store.fitCover(); selected = true">
        <Expand :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Center horizontal" title="Center horizontal" @click="store.centerHorizontal()">
        <AlignHorizontalJustifyCenter :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Center vertical" title="Center vertical" @click="store.centerVertical()">
        <AlignVerticalJustifyCenter :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Reset" title="Reset" @click="store.resetTransform()">
        <RefreshCw :size="16" />
      </button>
      <button class="btn cursor-pointer px-2 py-1" :class="store.cropEditing ? 'btn-primary' : 'btn-ghost'" type="button" :aria-label="store.cropEditing ? 'Done cropping' : 'Crop'" :title="store.cropEditing ? 'Done cropping' : 'Crop'" @click="store.cropEditing = !store.cropEditing">
        <Check v-if="store.cropEditing" :size="16" />
        <Crop v-else :size="16" />
      </button>
      <button v-if="store.mediaKind === 'video'" class="btn btn-primary cursor-pointer px-2 py-1" type="button" :aria-label="playing ? 'Pause' : 'Play'" :title="playing ? 'Pause' : 'Play'" @click="togglePlay">
        <Pause v-if="playing" :size="16" />
        <Play v-else :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Undo" title="Undo" @click="store.undo()">
        <Undo2 :size="16" />
      </button>
      <button class="btn btn-ghost cursor-pointer px-2 py-1" type="button" aria-label="Redo" title="Redo" @click="store.redo()">
        <Redo2 :size="16" />
      </button>
    </div>
    <div
      v-if="store.cropEditing"
      class="mb-2 flex flex-wrap items-center gap-2"
    >
      <button
        v-for="item in cropAspects"
        :key="item[0]"
        class="btn cursor-pointer text-xs"
        :class="store.composition.cropAspect === item[0] ? 'btn-primary' : 'btn-ghost'"
        type="button"
        @click="store.setCropAspect(item[0], mediaWidth, mediaHeight)"
      >
        {{ item[1] }}
      </button>
      <template v-if="store.composition.cropAspect === 'custom'">
        <input v-model.number="store.composition.customAspectW" class="field w-16" type="number" min="1" max="100" @change="store.setCropAspect('custom', mediaWidth, mediaHeight)" />
        <input v-model.number="store.composition.customAspectH" class="field w-16" type="number" min="1" max="100" @change="store.setCropAspect('custom', mediaWidth, mediaHeight)" />
      </template>
      <button class="btn btn-ghost cursor-pointer text-xs" type="button" @click="store.resetCrop()">Reset crop</button>
    </div>
    <div
      ref="shell"
      class="relative flex w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800"
      :style="{ height: `${shellHeight}px`, touchAction: 'none' }"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <canvas
        :key="previewCanvasKey"
        ref="previewCanvas"
        class="absolute inset-0 mx-auto block max-h-full max-w-full"
      />
      <canvas ref="overlayCanvas" class="absolute inset-0 mx-auto block max-h-full max-w-full touch-none" />
      <p v-if="!store.objectUrl" class="pointer-events-none absolute inset-0 grid place-items-center text-sm text-zinc-500">Upload media to preview</p>
    </div>
    <audio ref="audioRef" class="hidden" />
    <p class="mt-2 text-xs text-zinc-500">View zoom does not change the export. Drag the image to place it. Corner handles scale it. The round handle rotates it.</p>
  </div>
</template>
