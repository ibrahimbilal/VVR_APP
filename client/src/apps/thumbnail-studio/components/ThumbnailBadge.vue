<script setup lang="ts">
import { anchorFactors } from '@shared/thumbnailLayout'
import { badgeAnchorPoint, clampBadgeScale, type ThumbnailBadge } from '@shared/thumbnailProject'
import { computed } from 'vue'
import { BADGE_WIDTH_RATIO, badgeLayoutMetrics, badgeSvgUrl } from '../lib/badgeAssets'

const props = defineProps<{ badge: ThumbnailBadge; frameWidth: number; exportWidth: number; exportHeight: number }>()

const src = computed(() => badgeSvgUrl(props.badge.appearance.styleId, props.badge.text))

const layoutBox = computed(() => {
  const layout = badgeLayoutMetrics(props.badge.appearance.styleId)
  const reference = Math.max(48, props.frameWidth * BADGE_WIDTH_RATIO)
  const safe = clampBadgeScale(props.badge.appearance.scale)
  const contentWidth = reference * safe
  const contentHeight = contentWidth * (layout.contentH / layout.contentW)
  const assetScale = contentWidth / layout.contentW
  const assetWidth = layout.assetW * assetScale
  const assetHeight = layout.assetH * assetScale
  const padX = layout.padX * assetScale
  const padY = layout.padY * assetScale
  return { contentWidth, contentHeight, assetWidth, assetHeight, padX, padY }
})

const position = computed(() => {
  const point = badgeAnchorPoint(props.badge, props.exportWidth, props.exportHeight)
  const anchor = props.badge.anchor === 'free' || props.badge.deliberate ? 'free' : props.badge.anchor
  const { ax, ay } = anchorFactors(anchor)
  const { contentWidth, contentHeight, assetWidth, assetHeight, padX, padY } = layoutBox.value
  return {
    left: `calc(${point.x * 100}% - ${padX + contentWidth * ax}px)`,
    top: `calc(${point.y * 100}% - ${padY + contentHeight * ay}px)`,
    width: `${assetWidth}px`,
    height: `${assetHeight}px`,
  }
})
</script>

<template>
  <img
    v-if="badge.enabled && badge.text.trim() && src"
    :src="src"
    alt=""
    draggable="false"
    class="absolute z-10 cursor-grab touch-none select-none"
    :style="position"
  />
</template>
