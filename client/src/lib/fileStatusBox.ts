export type FileStatusBoxStatus = 'ready' | 'uploading' | 'error' | 'processing'

export const FILE_STATUS_DEFAULT_LABELS: Record<FileStatusBoxStatus, string> = {
  ready: 'Uploaded',
  uploading: 'Uploading',
  error: 'Upload failed',
  processing: 'Processing',
}

/** Optional override for the status line; null keeps FileStatusBox defaults. */
export function fileStatusBoxLabel(
  status: FileStatusBoxStatus,
  options?: {
    uploadProgress?: number
    processingMessage?: string
  },
): string | null {
  if (status === 'uploading') {
    if (options?.uploadProgress != null) {
      return `Uploading ${Math.round(options.uploadProgress * 100)}%`
    }
    return null
  }
  if (status === 'processing' && options?.processingMessage) {
    return options.processingMessage
  }
  return null
}
