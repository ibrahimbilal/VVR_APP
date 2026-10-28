<script setup lang="ts">
import { anchorFactors } from '@shared/thumbnailLayout'
import { badgeAnchorPoint, type ThumbnailBadge } from '@shared/thumbnailProject'
import { computed } from 'vue'
import { BADGE_WIDTH_RATIO, badgeMarkup } from '../lib/badgeHtml'

const props = defineProps<{ badge: ThumbnailBadge; frameWidth: number }>()

const html = computed(() =>
  badgeMarkup(props.badge.appearance.styleId, props.badge.text, Math.max(48, props.frameWidth * BADGE_WIDTH_RATIO), props.badge.appearance.scale),
)

const position = computed(() => {
  const point = badgeAnchorPoint(props.badge)
  const anchor = props.badge.anchor === 'free' || props.badge.deliberate ? 'free' : props.badge.anchor
  const { ax, ay } = anchorFactors(anchor)
  return {
    left: `${point.x * 100}%`,
    top: `${point.y * 100}%`,
    transform: `translate(${-ax * 100}%, ${-ay * 100}%)`,
  }
})
</script>

<template>
  <div
    v-if="badge.enabled && badge.text.trim()"
    class="absolute z-10 touch-none select-none"
    :style="position"
    v-html="html"
  />
</template>
