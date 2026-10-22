<script setup lang="ts">
import { Film, X } from '@lucide/vue'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { navItems } from '../../app/navigation'
import { usePlatformStore } from '../../stores/platform'

const platform = usePlatformStore()
const route = useRoute()
const panelRef = ref<HTMLElement | null>(null)
let triggerEl: HTMLElement | null = null

const props = defineProps<{ open: boolean; trigger?: HTMLElement | null }>()
const emit = defineEmits<{ close: [] }>()

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    event.preventDefault()
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) {
      triggerEl = props.trigger ?? null
      window.setTimeout(() => {
        const first = panelRef.value?.querySelector<HTMLElement>('a, button')
        first?.focus()
      }, 50)
    } else if (triggerEl) {
      triggerEl.focus()
      triggerEl = null
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  document.body.style.overflow = ''
})

function onBackdropClick() {
  emit('close')
}

function onNavigate() {
  emit('close')
}

</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 xl:hidden">
      <div class="absolute inset-0 bg-black/60" aria-hidden="true" @click="onBackdropClick" />
      <div
        ref="panelRef"
        class="absolute left-0 top-0 flex h-full w-[min(280px,85vw)] flex-col border-r border-zinc-800 bg-[#0c0d10] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div class="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <div class="flex items-center gap-2">
            <span class="grid h-8 w-8 place-items-center rounded-sm bg-amber-300 text-black">
              <Film :size="16" />
            </span>
            <span class="text-sm font-black tracking-[0.06em]">Video's Factory</span>
          </div>
          <button class="btn btn-ghost cursor-pointer" type="button" aria-label="Close menu" @click="emit('close')">
            <X :size="20" />
          </button>
        </div>
        <nav class="flex flex-col gap-1 p-3">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors"
            :class="
              isActive(item.path)
                ? 'bg-amber-300/15 text-amber-300'
                : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100'
            "
            @click="onNavigate"
          >
            <component :is="item.icon" :size="18" />
            {{ item.label }}
          </RouterLink>
        </nav>
      </div>
    </div>
  </Teleport>
</template>
