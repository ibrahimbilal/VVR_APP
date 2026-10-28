<script setup lang="ts">
import type { BadgeId } from '@shared/thumbnailProject'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ensureThumbnailFonts, renderThumbnail } from '../lib/renderThumbnail'
import { useThumbnailStore } from '../stores/thumbnail'
import ThumbnailBadge from './ThumbnailBadge.vue'

const store = useThumbnailStore()
const stage = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const display = ref({ width: 640, height: 360 })
const dragging = ref<BadgeId | null>(null)
const badgeIds = ['resolution', 'duration'] as const
let drag: { id: BadgeId; grabX: number; grabY: number } | null = null
let observer: ResizeObserver | null = null

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas || !store.hydrated) return
  const rendered = renderThumbnail(store.doc, store.renderAssets(), { preview: true })
  canvas.width = rendered.width
  canvas.height = rendered.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(rendered, 0, 0)
  fit()
}

function fit(): void {
  const stageEl = stage.value
  if (!stageEl) return
  const style = getComputedStyle(stageEl)
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const boundsWidth = stageEl.clientWidth - padX
  const boundsHeight = stageEl.clientHeight - padY
  if (boundsWidth < 8 || boundsHeight < 8) return
  const aspect = store.doc.export.width / store.doc.export.height
  let width = boundsWidth
  let height = width / aspect
  if (height > boundsHeight) {
    height = boundsHeight
    width = height * aspect
  }
  display.value = { width: Math.max(1, width), height: Math.max(1, height) }
}

function framePoint(event: PointerEvent): { x: number; y: number } | null {
  const rect = frame.value?.getBoundingClientRect()
  if (!rect || rect.width < 1 || rect.height < 1) return null
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
}

function onPointerDown(id: BadgeId, event: PointerEvent): void {
  const frameEl = frame.value
  const target = event.currentTarget as HTMLElement | null
  if (!frameEl || !target) return
  const frameRect = frameEl.getBoundingClientRect()
  const badgeRect = target.getBoundingClientRect()
  const at = framePoint(event)
  if (!at || frameRect.width < 1) return
  const centerX = (badgeRect.left + badgeRect.width / 2 - frameRect.left) / frameRect.width
  const centerY = (badgeRect.top + badgeRect.height / 2 - frameRect.top) / frameRect.height
  drag = { id, grabX: at.x - centerX, grabY: at.y - centerY }
  dragging.value = id
  target.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return
  const at = framePoint(event)
  if (!at) return
  store.moveBadge(drag.id, at.x - drag.grabX, at.y - drag.grabY)
}

function onPointerUp(): void {
  drag = null
  dragging.value = null
}

watch(
  () => [store.doc, store.assetEpoch, store.hydrated],
  () => draw(),
  { deep: true },
)

onMounted(async () => {
  await ensureThumbnailFonts()
  draw()
  observer = new ResizeObserver(() => fit())
  if (stage.value) observer.observe(stage.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="stage" class="relative grid min-h-[240px] min-w-0 flex-1 place-items-center overflow-hidden bg-[#0c0d10] p-4">
    <div ref="frame" class="relative" :style="{ width: `${display.width}px`, height: `${display.height}px` }">
      <canvas ref="canvasRef" class="block h-full w-full rounded-sm shadow-2xl" />
      <ThumbnailBadge
        v-for="id in badgeIds"
        :key="id"
        :badge="store.doc[id]"
        :frame-width="display.width"
        :export-width="store.doc.export.width"
        :export-height="store.doc.export.height"
        :class="dragging === id ? 'cursor-grabbing' : ''"
        @pointerdown="onPointerDown(id, $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
    </div>
    <p v-if="store.hydrated && !store.hasImage" class="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-xs text-zinc-500">
      Upload a PNG, JPEG, or WebP image.
    </p>
  </div>
</template>
