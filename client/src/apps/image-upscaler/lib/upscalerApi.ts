import type { PublicUpscaleJob, UpscaleOptions, UpscalerCapabilities } from '@shared/imageUpscaler'

export function upscaleOutputCacheStamp(
  revision: number | null | undefined,
  bytes: number | null | undefined,
): number | null {
  if (revision != null && Number.isFinite(revision) && revision > 0) return Math.round(revision)
  if (bytes != null && Number.isFinite(bytes)) return Math.round(bytes)
  return null
}

export function itemDownloadUrl(jobId: string, itemId: string, cacheStamp?: number | null): string {
  const base = `/api/image-upscaler/jobs/${jobId}/items/${itemId}/download`
  if (cacheStamp == null || !Number.isFinite(cacheStamp)) return base
  return `${base}?v=${Math.round(cacheStamp)}`
}

export function itemInlineUrl(jobId: string, itemId: string, cacheStamp?: number | null): string {
  let url = `/api/image-upscaler/jobs/${jobId}/items/${itemId}/download?inline=1`
  if (cacheStamp != null && Number.isFinite(cacheStamp)) url += `&v=${Math.round(cacheStamp)}`
  return url
}

export function itemPreviewUrl(jobId: string, itemId: string, cacheStamp?: number | null): string {
  const base = `/api/image-upscaler/jobs/${jobId}/items/${itemId}/preview`
  if (cacheStamp == null || !Number.isFinite(cacheStamp)) return base
  return `${base}?v=${Math.round(cacheStamp)}`
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

export async function reexportUpscaleJob(id: string, options: UpscaleOptions): Promise<PublicUpscaleJob> {
  const response = await fetch(`/api/image-upscaler/jobs/${id}/re-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options }),
  })
  return readJob(response)
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
