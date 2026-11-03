import type { UpscaleItemStatus } from '@shared/imageUpscaler'

export type { PublicUpscaleItem, PublicUpscaleJob, UpscaleOptions, UpscaleItemStatus } from '@shared/imageUpscaler'

export interface LocalUpscaleItem {
  localId: string
  file: File
  name: string
  previewUrl: string
  width: number
  height: number
  bytes: number
  status: 'ready' | UpscaleItemStatus
  error: string | null
  warning: string | null
  serverItemId: string | null
  outputName: string | null
  outputBytes: number | null
  outputWidth: number | null
  outputHeight: number | null
  skippedResize: boolean
}
