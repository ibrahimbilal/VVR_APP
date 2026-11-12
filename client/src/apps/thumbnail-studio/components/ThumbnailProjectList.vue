<script setup lang="ts">
import { Copy, Download, Info, Pencil, Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import { formatBytes } from '../../../lib/format'
import { audioFormatLabel } from '../../../lib/media'
import AppDialog from '../../../components/ui/AppDialog.vue'
import { useThumbnailStore } from '../stores/thumbnail'

const store = useThumbnailStore()
const renameId = ref<string | null>(null)
const renameValue = ref('')
const deleteId = ref<string | null>(null)
const deleteAllOpen = ref(false)
const downloadingAll = ref(false)
const infoTip = ref<{ id: string; x: number; y: number; above: boolean } | null>(null)

const deleteTarget = computed(() => store.projects.find((item) => item.id === deleteId.value) ?? null)
const infoProject = computed(() => store.projects.find((item) => item.id === infoTip.value?.id) ?? null)

function uploadIconClass(state: 'uploading' | 'processing' | 'ready' | 'error'): string {
  if (state === 'uploading' || state === 'processing') return 'text-brand'
  if (state === 'error') return 'text-red-300'
  return 'text-emerald-300'
}

function uploadStatusLabel(project: (typeof store.projects)[number]): string {
  if (project.upload.state === 'uploading') return 'Uploading…'
  if (project.upload.state === 'processing') return 'Reading image…'
  if (project.upload.state === 'error') return 'Upload failed'
  return 'Uploaded'
}

function uploadMeta(project: (typeof store.projects)[number]): string {
  const parts: string[] = []
  if (project.upload.fileName) parts.push(audioFormatLabel(project.upload.fileName))
  if (project.upload.fileSize != null && project.upload.fileSize > 0) parts.push(formatBytes(project.upload.fileSize))
  if (project.upload.width > 0 && project.upload.height > 0) parts.push(`${project.upload.width}×${project.upload.height}`)
  return parts.join(' · ')
}

function formatUpdated(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function showUploadInfo(event: MouseEvent | FocusEvent, id: string) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const above = rect.bottom + 132 > window.innerHeight
  infoTip.value = {
    id,
    x: Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
    y: above ? rect.top - 8 : rect.bottom + 8,
    above,
  }
}

function hideUploadInfo() {
  infoTip.value = null
}

function startRename(id: string, name: string) {
  renameId.value = id
  renameValue.value = name
}

function closeRename() {
  renameId.value = null
}

async function confirmRename() {
  if (!renameId.value) return
  await store.renameProject(renameId.value, renameValue.value)
  renameId.value = null
}

function startDelete(id: string) {
  deleteId.value = id
}

function closeDelete() {
  deleteId.value = null
}

async function confirmDelete() {
  if (!deleteId.value) return
  const id = deleteId.value
  deleteId.value = null
  await store.deleteProject(id)
}

function closeDeleteAll() {
  deleteAllOpen.value = false
}

async function confirmDeleteAll() {
  deleteAllOpen.value = false
  await store.deleteAllProjects()
}

async function downloadAll() {
  if (downloadingAll.value || store.exporting) return
  downloadingAll.value = true
  try {
    await store.downloadAllProjects()
  } finally {
    downloadingAll.value = false
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <div class="mb-3 flex shrink-0 items-center justify-between gap-2">
      <h3 class="section-label">Projects</h3>
      <button
        class="btn btn-ghost cursor-pointer px-2 py-1 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        :disabled="store.projects.length === 0"
        @click="deleteAllOpen = true"
      >
        <Trash2 :size="14" />
        Delete all
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto">
      <p v-if="store.projects.length === 0" class="text-sm text-zinc-500">Drop an image to create a project.</p>

      <article
        v-for="project in store.projects"
        :key="project.id"
        class="cursor-pointer rounded-lg border bg-inset p-2 transition-opacity"
        :class="[
          project.id === store.projectId ? 'border-brand' : 'border-zinc-800',
          project.downloadedUnchanged ? 'opacity-50' : 'opacity-100',
        ]"
        :data-project-id="project.id"
        :aria-current="project.id === store.projectId ? 'true' : undefined"
        @click="store.openProject(project.id)"
      >
        <div class="flex gap-2">
          <div class="h-14 w-24 shrink-0 overflow-hidden rounded bg-zinc-900">
            <img v-if="project.previewUrl" :src="project.previewUrl" alt="" class="h-full w-full object-cover" />
            <span v-else class="flex h-full items-center justify-center text-[10px] text-zinc-600">No image</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-zinc-100" :title="project.name">{{ project.name }}</p>
            <p class="mt-0.5 truncate text-xs text-zinc-500">{{ project.exportLabel }}</p>
            <p class="mt-0.5 text-xs text-zinc-500">{{ formatUpdated(project.updatedAt) }}</p>
          </div>
        </div>

        <div class="mt-2 flex" @click.stop>
          <button
            class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            :class="uploadIconClass(project.upload.state)"
            type="button"
            aria-label="Upload details"
            @mouseenter="showUploadInfo($event, project.id)"
            @mouseleave="hideUploadInfo"
            @focus="showUploadInfo($event, project.id)"
            @blur="hideUploadInfo"
          >
            <Info :size="15" />
          </button>
          <button
            class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            type="button"
            aria-label="Rename project"
            title="Rename"
            @click="startRename(project.id, project.name)"
          >
            <Pencil :size="15" />
          </button>
          <button
            class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            type="button"
            aria-label="Duplicate project"
            title="Duplicate"
            @click="store.duplicateProject(project.id)"
          >
            <Copy :size="15" />
          </button>
          <button
            class="rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            type="button"
            aria-label="Download thumbnail"
            title="Download"
            @click="store.downloadProject(project.id)"
          >
            <Download :size="15" />
          </button>
          <button
            class="ml-auto rounded-sm inline-flex size-7 cursor-pointer items-center justify-center bg-transparent text-red-300 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            type="button"
            aria-label="Delete project"
            title="Delete"
            @click="startDelete(project.id)"
          >
            <Trash2 :size="15" />
          </button>
        </div>
      </article>
    </div>

    <div class="sticky bottom-0 z-10 shrink-0 border-t border-zinc-800 bg-zinc-950 pt-2">
      <button
        class="btn btn-primary w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        :disabled="store.projects.length === 0 || downloadingAll || store.exporting"
        @click="downloadAll"
      >
        <Download :size="16" />
        Download all
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="infoTip && infoProject"
        class="pointer-events-none fixed z-50 w-56 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-200 shadow-lg"
        :style="{
          left: `${infoTip.x}px`,
          top: `${infoTip.y}px`,
          transform: infoTip.above ? 'translateY(-100%)' : undefined,
        }"
      >
        <p class="font-semibold" :class="uploadIconClass(infoProject.upload.state)">{{ uploadStatusLabel(infoProject) }}</p>
        <p v-if="infoProject.upload.fileName" class="mt-1 truncate text-zinc-100">{{ infoProject.upload.fileName }}</p>
        <p v-if="uploadMeta(infoProject)" class="mt-1 text-zinc-400">{{ uploadMeta(infoProject) }}</p>
        <p v-if="infoProject.upload.error" class="mt-1 text-red-300">{{ infoProject.upload.error }}</p>
      </div>
    </Teleport>

    <AppDialog :open="renameId !== null" title="Rename project" @cancel="closeRename">
      <label class="block">
        <span class="section-label mb-1 block">Name</span>
        <input v-model="renameValue" class="field text-sm" type="text" maxlength="80" @keydown.enter.prevent="confirmRename" />
      </label>
      <template #actions>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="closeRename">Cancel</button>
        <button class="btn btn-primary cursor-pointer" type="button" @click="confirmRename">Save</button>
      </template>
    </AppDialog>

    <AppDialog :open="deleteTarget !== null" title="Delete project" @cancel="closeDelete">
      <p class="text-sm text-zinc-300">Delete “{{ deleteTarget?.name }}”? The project is removed from this browser.</p>
      <template #actions>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="closeDelete">Cancel</button>
        <button class="btn btn-danger cursor-pointer" type="button" @click="confirmDelete">Delete</button>
      </template>
    </AppDialog>

    <AppDialog :open="deleteAllOpen" title="Delete all projects" @cancel="closeDeleteAll">
      <p class="text-sm text-zinc-300">Delete every thumbnail project saved in this browser?</p>
      <template #actions>
        <button class="btn btn-ghost cursor-pointer" type="button" @click="closeDeleteAll">Cancel</button>
        <button class="btn btn-danger cursor-pointer" type="button" @click="confirmDeleteAll">Delete all</button>
      </template>
    </AppDialog>
  </section>
</template>
