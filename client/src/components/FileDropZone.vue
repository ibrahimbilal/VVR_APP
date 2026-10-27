<script setup lang="ts">
import { Upload } from '@lucide/vue'
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    accept: string
    multiple?: boolean
    disabled?: boolean
    compact?: boolean
    label: string
    dropLabel?: string
    busyLabel?: string
    hint?: string
    formats?: string
    ignoreTypes?: string[]
    highlighted?: boolean
  }>(),
  {
    multiple: false,
    disabled: false,
    compact: false,
    dropLabel: 'Drop to upload',
    hint: 'or click to browse',
  },
)

const emit = defineEmits<{
  files: [files: File[]]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const fileDrag = ref(false)
let dragDepth = 0

const active = computed(() => props.highlighted === true || fileDrag.value)
const title = computed(() => {
  if (props.disabled && props.busyLabel) return props.busyLabel
  if (active.value) return props.dropLabel
  return props.label
})

function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  const list = Array.from(types)
  if (!list.includes('Files')) return false
  return !(props.ignoreTypes ?? []).some((type) => list.includes(type))
}

function onFileDragEnter(event: DragEvent) {
  if (props.disabled || !isFileDrag(event)) return
  dragDepth += 1
  fileDrag.value = true
}

function onFileDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) fileDrag.value = false
}

function takeFiles(list: FileList | undefined | null) {
  if (!list || list.length === 0) return
  emit('files', Array.from(list))
}

function onDrop(event: DragEvent) {
  event.stopPropagation()
  dragDepth = 0
  fileDrag.value = false
  if (props.disabled || !isFileDrag(event)) return
  takeFiles(event.dataTransfer?.files)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  takeFiles(input.files)
  input.value = ''
}

function openPicker() {
  if (props.disabled) return
  fileInput.value?.click()
}
</script>

<template>
  <div>
    <button
      class="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-3 text-sm font-semibold transition-shadow disabled:cursor-wait disabled:opacity-60"
      :class="[
        active ? 'border-amber-300 bg-amber-300/10 text-amber-100' : 'border-zinc-600 bg-[#101114] text-zinc-100',
        compact ? 'py-4' : 'py-8',
      ]"
      type="button"
      :disabled="disabled"
      @click="openPicker"
      @dragenter.prevent="onFileDragEnter"
      @dragover.prevent
      @dragleave.prevent="onFileDragLeave"
      @drop.prevent="onDrop"
    >
      <Upload :size="compact ? 16 : 18" />
      <span>{{ title }}</span>
      <span v-if="hint" class="text-[11px] font-normal text-zinc-500">{{ hint }}</span>
      <span v-if="formats" class="mt-1 text-[11px] font-normal text-zinc-600">{{ formats }}</span>
    </button>
    <input ref="fileInput" class="hidden" type="file" :accept="accept" :multiple="multiple" @change="onFileChange" />
  </div>
</template>
