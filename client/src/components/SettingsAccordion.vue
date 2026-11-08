<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ title: string; open?: boolean }>(), {
  open: false,
})

const isOpen = ref(props.open)

watch(
  () => props.open,
  (value) => {
    isOpen.value = value
  },
)

function toggle(): void {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="settings-accordion border-b border-zinc-800 last:border-b-0">
    <button
      class="settings-accordion__summary focus-ring flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
      type="button"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <span class="section-label">{{ title }}</span>
      <ChevronDown
        class="settings-accordion__chevron shrink-0 text-zinc-500"
        :class="{ 'is-open': isOpen }"
        :size="16"
        aria-hidden="true"
      />
    </button>
    <div class="settings-accordion__collapse" :class="{ 'is-open': isOpen }" :inert="!isOpen">
      <div class="settings-accordion__inner">
        <div class="px-4 pb-4 space-y-3">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
