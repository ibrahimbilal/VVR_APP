<script setup lang="ts">
import { Bell, CircleX, Download, ExternalLink, Loader2, Trash2, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { formatClock } from '../../lib/format'
import { renderAppIcon, renderAppLabel, type RenderAppId } from '../../lib/renderNotifications'
import { requestOpenScreensaverProject } from '../../apps/frame-screensaver/lib/screensaverProjectEvents'
import { BRAND } from '../../lib/brand'
import { triggerDownload } from '../../lib/triggerDownload'
import { usePlatformStore, type ActiveRenderJob, type RenderReadyNotification } from '../../stores/platform'

const platform = usePlatformStore()
const router = useRouter()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const cancellingIds = ref<string[]>([])
const leavingCount = ref(0)

type NotificationDividerRow = { kind: 'divider'; id: 'notif-divider-ready' }
type NotificationRenderingRow = { kind: 'rendering'; id: string; job: ActiveRenderJob }
type NotificationReadyRow = { kind: 'ready'; id: string; item: RenderReadyNotification }
type NotificationRow = NotificationDividerRow | NotificationRenderingRow | NotificationReadyRow

const notificationRows = computed((): NotificationRow[] => {
  const jobs = platform.activeRenderJobs
  const ready = platform.renderNotifications
  const rows: NotificationRow[] = jobs.map((job) => ({ kind: 'rendering', id: job.id, job }))
  if (jobs.length > 0 && ready.length > 0) {
    rows.push({ kind: 'divider', id: 'notif-divider-ready' })
  }
  for (const item of ready) {
    rows.push({ kind: 'ready', id: item.id, item })
  }
  return rows
})

const showReadyHeadingAboveList = computed(
  () => platform.renderNotifications.length > 0 && platform.activeRenderJobs.length === 0,
)

const showList = computed(
  () => notificationRows.value.length > 0 || leavingCount.value > 0,
)

function onItemLeaveStart(): void {
  leavingCount.value += 1
}

function onItemLeaveEnd(): void {
  leavingCount.value = Math.max(0, leavingCount.value - 1)
}

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

function formatRemaining(etaSec: number | null): string {
  if (etaSec == null || !Number.isFinite(etaSec)) return 'Estimating…'
  return `${formatClock(etaSec)} left`
}

function openApp(app: RenderAppId, route: string, projectId?: string | null): void {
  if (app === 'screensaver' && projectId) requestOpenScreensaverProject(projectId)
  void router.push(route)
  open.value = false
}

function readyDetail(item: RenderReadyNotification): string {
  if (item.outcome === 'failed') return item.error || 'Rendering failed'
  if (item.outcome === 'cancelled') return 'Rendering cancelled'
  return `Ready to download · ${formatWhen(item.createdAt)}`
}

function download(item: RenderReadyNotification): void {
  triggerDownload(item.downloadUrl, item.filename)
}

function cancelRender(trackId: string): void {
  if (cancellingIds.value.includes(trackId)) return
  cancellingIds.value = [...cancellingIds.value, trackId]
  platform.cancelActiveRenderJob(trackId)
}

watch(
  () => platform.activeRenderJobs.map((job) => job.id),
  (activeIds) => {
    cancellingIds.value = cancellingIds.value.filter((id) => activeIds.includes(id))
  },
)

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="focus-ring relative grid h-9 w-9 cursor-pointer place-items-center rounded-sm"
      type="button"
      aria-label="Notifications"
      :aria-expanded="open"
      @click="togglePanel"
    >
      <Bell v-if="!hasOperations" :size="18" />
      <template v-else>
        <svg class="absolute inset-0 h-9 w-9 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" :r="RING_RADIUS" fill="none" stroke="var(--color-field)" stroke-width="3" />
          <circle
            cx="18"
            cy="18"
            :r="RING_RADIUS"
            fill="none"
            :stroke="BRAND"
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
      class="notif-panel-enter absolute right-0 top-[calc(100%+0.35rem)] z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-elevated shadow-xl"
      role="dialog"
      aria-label="Notifications"
    >
      <div class="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Notifications</h2>
        <button
          class="cursor-pointer text-zinc-500 hover:text-zinc-300"
          type="button"
          title="Close"
          aria-label="Close"
          @click="open = false"
        >
          <X :size="16" />
        </button>
      </div>

      <div class="relative max-h-80 overflow-y-auto">
        <div v-if="!showList" class="px-3 py-8 text-center text-sm text-zinc-500">
          No notifications yet. Renders in progress and finished exports appear here.
        </div>

        <template v-else>
          <p
            v-if="platform.activeRenderJobs.length > 0"
            class="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
          >
            Rendering
          </p>
          <p
            v-if="showReadyHeadingAboveList"
            class="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
          >
            Ready
          </p>
          <TransitionGroup
            name="notif-item"
            tag="ul"
            class="notif-item-list"
            @before-leave="onItemLeaveStart"
            @after-leave="onItemLeaveEnd"
          >
            <li
              v-for="row in notificationRows"
              :key="row.id"
              class="relative"
              :class="
                row.kind === 'divider'
                  ? 'notif-item-divider'
                  : [
                      'border-t border-zinc-800/60 px-3 py-3 first:border-t-0',
                      row.kind === 'ready' && (row.item.read ? 'bg-transparent' : 'bg-unread'),
                    ]
              "
            >
              <p
                v-if="row.kind === 'divider'"
                class="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
              >
                Ready
              </p>
              <Transition v-else name="notif-status" mode="out-in">
                <div v-if="row.kind === 'rendering'" key="rendering" class="notif-item-body">
                  <div class="flex gap-2.5">
                    <div
                      class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-800/80 text-zinc-300"
                      :title="renderAppLabel(row.job.app)"
                    >
                      <component :is="renderAppIcon(row.job.app)" :size="16" aria-hidden="true" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-zinc-100">{{ row.job.projectName }}</p>
                      <p class="mt-0.5 text-xs text-zinc-400">{{ row.job.message }}</p>
                    </div>
                    <button
                      class="focus-ring grid h-8 w-8 shrink-0 cursor-pointer place-items-center self-start rounded-sm text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                      type="button"
                      :title="`Open ${renderAppLabel(row.job.app)}`"
                      :aria-label="`Open ${renderAppLabel(row.job.app)}`"
                      @click="openApp(row.job.app, row.job.route, row.job.projectId)"
                    >
                      <ExternalLink :size="15" aria-hidden="true" />
                    </button>
                  </div>
                  <div class="mt-2.5 flex items-center gap-1.5">
                    <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        class="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
                        :style="{ width: `${Math.round(Math.min(1, Math.max(0, row.job.progress)) * 100)}%` }"
                      />
                    </div>
                    <button
                      class="focus-ring grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-sm text-red-300/90 hover:bg-white/5 hover:text-red-200 disabled:cursor-default disabled:opacity-80"
                      type="button"
                      :disabled="cancellingIds.includes(row.job.id)"
                      :title="cancellingIds.includes(row.job.id) ? 'Cancelling export' : 'Cancel export'"
                      :aria-label="cancellingIds.includes(row.job.id) ? 'Cancelling export' : 'Cancel export'"
                      @click="cancelRender(row.job.id)"
                    >
                      <Loader2
                        v-if="cancellingIds.includes(row.job.id)"
                        :size="14"
                        class="animate-spin"
                        aria-hidden="true"
                      />
                      <CircleX v-else :size="14" aria-hidden="true" />
                    </button>
                    <span class="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-400">{{
                      formatPercent(row.job.progress)
                    }}</span>
                    <span class="shrink-0 text-[11px] tabular-nums text-zinc-500">{{ formatRemaining(row.job.etaSec) }}</span>
                  </div>
                </div>
                <div v-else key="ready" class="notif-item-body">
                  <div class="flex gap-2.5">
                    <div
                      class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-800/80 text-zinc-300"
                      :title="renderAppLabel(row.item.app)"
                    >
                      <component :is="renderAppIcon(row.item.app)" :size="16" aria-hidden="true" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-zinc-100">{{ row.item.projectName }}</p>
                      <p class="mt-0.5 text-xs text-zinc-400">{{ readyDetail(row.item) }}</p>
                      <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          v-if="row.item.outcome !== 'failed' && row.item.outcome !== 'cancelled'"
                          class="btn btn-primary cursor-pointer py-1 text-xs"
                          type="button"
                          @click="download(row.item)"
                        >
                          <Download :size="14" />
                          Download
                        </button>
                        <button
                          class="focus-ring grid h-8 w-8 cursor-pointer place-items-center rounded-sm text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                          type="button"
                          :title="`Open ${renderAppLabel(row.item.app)}`"
                          :aria-label="`Open ${renderAppLabel(row.item.app)}`"
                          @click="openApp(row.item.app, row.item.route, row.item.projectId)"
                        >
                          <ExternalLink :size="15" aria-hidden="true" />
                        </button>
                        <button
                          class="focus-ring grid h-8 w-8 cursor-pointer place-items-center rounded-sm text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                          type="button"
                          title="Dismiss notification"
                          aria-label="Dismiss notification"
                          @click="platform.dismissNotification(row.item.id)"
                        >
                          <Trash2 :size="15" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </li>
          </TransitionGroup>
        </template>
      </div>
    </div>
  </div>
</template>
