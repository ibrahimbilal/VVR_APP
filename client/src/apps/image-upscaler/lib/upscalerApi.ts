import type { PublicUpscaleJob, UpscaleOptions, UpscalerCapabilities } from '@shared/imageUpscaler'

export function itemDownloadUrl(jobId: string, itemId: string): string {
  return `/api/image-upscaler/jobs/${jobId}/items/${itemId}/download`
}

export function itemInlineUrl(jobId: string, itemId: string): string {
  return `${itemDownloadUrl(jobId, itemId)}?inline=1`
}

export function itemPreviewUrl(jobId: string, itemId: string): string {
  return `/api/image-upscaler/jobs/${jobId}/items/${itemId}/preview`
}

export function zipDownloadUrl(jobId: string): string {
  return `/api/image-upscaler/jobs/${jobId}/download`
}

export async function fetchUpscalerCapabilities(): Promise<UpscalerCapabilities | null> {
  try {
    const response = await fetch('/api/image-upscaler/capabilities')
    if (!response.ok) return null
    const data = (await response.json()) as UpscalerCapabilities
    if (typeof data?.engines?.['realesrgan-lite']?.available !== 'boolean') return null
    return data
  } catch {
    return null
  }
}

export async function startUpscale(files: File[], options: UpscaleOptions): Promise<PublicUpscaleJob> {
  const body = new FormData()
  body.append('options', JSON.stringify(options))
  if (files.length === 1) {
    const file = files[0]
    if (!file) throw new Error('Choose an image.')
    body.append('file', file, file.name)
    return readJob(await fetch('/api/image-upscaler/process', { method: 'POST', body }))
  }
  for (const file of files) body.append('files', file, file.name)
  return readJob(await fetch('/api/image-upscaler/batch', { method: 'POST', body }))
}

export async function getUpscaleJob(id: string): Promise<PublicUpscaleJob> {
  return readJob(await fetch(`/api/image-upscaler/jobs/${id}`))
}

export async function cancelUpscaleJob(id: string, purge = false): Promise<void> {
  const response = await fetch(`/api/image-upscaler/jobs/${id}${purge ? '?purge=1' : ''}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readError(response))
}

export async function fetchUpscaledBlob(jobId: string, itemId: string): Promise<Blob> {
  const response = await fetch(itemDownloadUrl(jobId, itemId))
  if (!response.ok) throw new Error(await readError(response))
  return response.blob()
}

async function readJob(response: Response): Promise<PublicUpscaleJob> {
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as PublicUpscaleJob
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string }
    if (data.error) return data.error
  } catch {
    // The body was not JSON.
  }
  return `Request failed (${response.status}).`
}
