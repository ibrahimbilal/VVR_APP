<script setup lang="ts">
import { Bell, CircleX, Download, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { renderAppLabel, type RenderAppId } from '../../lib/renderNotifications'
import { triggerDownload } from '../../lib/triggerDownload'
import { usePlatformStore, type RenderReadyNotification } from '../../stores/platform'

const platform = usePlatformStore()
const router = useRouter()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const operationCount = computed(() => platform.notificationOperationCount)
const ringProgress = computed(() => platform.notificationRingProgress)
const hasOperations = computed(() => operationCount.value > 0)

const RING_RADIUS = 14
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const ringDashOffset = computed(() => RING_CIRCUMFERENCE * (1 - ringProgress.value))
const countLabel = computed(() => {
  const count = operationCount.value
  return count > 9 ? '9+' : String(count)
})

function togglePanel(): void {
  open.value = !open.value
  if (open.value) platform.markAllNotificationsRead()
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!open.value || !root.value) return
  const target = event.target
  if (target instanceof Node && root.value.contains(target)) return
  open.value = false
}

function formatWhen(createdAt: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - createdAt) / 1000))
  if (diffSec < 60) return 'Just now'
  const minutes = Math.floor(diffSec / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(createdAt).toLocaleDateString()
}

function formatPercent(progress: number): string {
  return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`
}

function openApp(app: RenderAppId, route: string): void {
  void router.push(route)
  open.value = false
}

function download(item: RenderReadyNotification): void {
  triggerDownload(item.downloadUrl, item.filename)
  platform.dismissNotification(item.id)
}

function cancelRender(trackId: string): void {
  platform.cancelActiveRenderJob(trackId)
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="relative grid h-9 w-9 cursor-pointer place-items-center rounded-sm"
      type="button"
      aria-label="Notifications"
      :aria-expanded="open"
      @click="togglePanel"
    >
      <Bell v-if="!hasOperations" :size="18" />
      <template v-else>
        <svg class="absolute inset-0 h-9 w-9 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" :r="RING_RADIUS" fill="none" stroke="#343841" stroke-width="3" />
          <circle
            cx="18"
            cy="18"
            :r="RING_RADIUS"
            fill="none"
            stroke="#ffcc33"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`"
            :stroke-dashoffset="ringDashOffset"
            class="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
        <span class="relative text-[11px] font-bold tabular-nums text-zinc-100">{{ countLabel }}</span>
      </template>
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-[calc(100%+0.35rem)] z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#14161c] shadow-xl"
      role="dialog"
      aria-label="Notifications"
    >
      <div class="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Notifications</h2>
        <button class="cursor-pointer text-zinc-500 hover:text-zinc-300" type="button" aria-label="Close" @click="open = false">
          <X :size="16" />
        </button>
      </div>

      <div
        v-if="platform.activeRenderJobs.length === 0 && platform.renderNotifications.length === 0"
        class="px-3 py-8 text-center text-sm text-zinc-500"
      >
        No notifications yet. Renders in progress and finished exports appear here.
      </div>

      <div v-else class="max-h-80 overflow-y-auto">
        <section v-if="platform.activeRenderJobs.length > 0" class="border-b border-zinc-800/80">
          <p class="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Rendering</p>
          <ul>
            <li
              v-for="job in platform.activeRenderJobs"
              :key="job.id"
              class="border-t border-zinc-800/60 px-3 py-3 first:border-t-0"
            >
              <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                {{ renderAppLabel(job.app) }}
              </p>
              <p class="mt-0.5 text-sm font-medium text-zinc-100">{{ job.projectName }}</p>
              <p class="mt-0.5 text-xs text-zinc-400">{{ job.message }}</p>
              <div class="mt-2 flex items-center gap-2">
                <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    class="h-full rounded-full bg-[#ffcc33] transition-[width] duration-300 ease-out"
                    :style="{ width: `${Math.round(Math.min(1, Math.max(0, job.progress)) * 100)}%` }"
                  />
                </div>
                <span class="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-400">{{ formatPercent(job.progress) }}</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button class="btn btn-ghost cursor-pointer py-1 text-xs" type="button" @click="openApp(job.app, job.route)">
                  Open app
                </button>
                <button
                  class="btn btn-ghost cursor-pointer py-1 text-xs text-red-300/90 hover:text-red-200"
                  type="button"
                  @click="cancelRender(job.id)"
                >
                  <CircleX :size="14" />
                  Cancel
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="platform.renderNotifications.length > 0">
          <p class="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Ready</p>
          <ul>
            <li
              v-for="item in platform.renderNotifications"
              :key="item.id"
              class="border-t border-zinc-800/60 px-3 py-3 first:border-t-0"
              :class="item.read ? 'bg-transparent' : 'bg-[#1a1d24]'"
            >
              <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                {{ renderAppLabel(item.app) }}
              </p>
              <p class="mt-0.5 text-sm font-medium text-zinc-100">{{ item.projectName }}</p>
              <p class="mt-0.5 text-xs text-zinc-400">Ready to download · {{ formatWhen(item.createdAt) }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button class="btn btn-primary cursor-pointer py-1 text-xs" type="button" @click="download(item)">
                  <Download :size="14" />
                  Download
                </button>
                <button class="btn btn-ghost cursor-pointer py-1 text-xs" type="button" @click="openApp(item.app, item.route)">
                  Open app
                </button>
                <button
                  class="btn btn-ghost cursor-pointer py-1 text-xs text-zinc-500"
                  type="button"
                  aria-label="Dismiss"
                  @click="platform.dismissNotification(item.id)"
                >
                  Dismiss
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
