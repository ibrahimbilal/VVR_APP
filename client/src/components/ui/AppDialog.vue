<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  wide?: boolean
}>()

const emit = defineEmits<{
  cancel: []
}>()

const titleId = useId()
const panelRef = ref<HTMLElement | null>(null)
let restore: HTMLElement | null = null

function onKey(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  emit('cancel')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
      window.addEventListener('keydown', onKey)
      await nextTick()
      panelRef.value
        ?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ?.focus()
    } else {
      window.removeEventListener('keydown', onKey)
      restore?.focus()
      restore = null
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog-backdrop" @click.self="emit('cancel')">
        <div
          ref="panelRef"
          class="dialog-card"
          :class="{ 'dialog-card--wide': wide }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <h2 :id="titleId" class="text-lg font-bold text-zinc-100">{{ title }}</h2>
          <div class="mt-2">
            <slot />
          </div>
          <div v-if="$slots.actions" class="mt-4 flex flex-wrap gap-2">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
