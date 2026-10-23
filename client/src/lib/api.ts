export interface ServerClip {
  id: string
  duration: number
  width: number
  height: number
  hasAudio: boolean
  size: number
  codec?: string | null
}

export interface ImportResult {
  ok: true
  platform: 'youtube' | 'tiktok' | 'instagram'
  url: string
  title: string | null
  thumbnail: string | null
  canDownload: false
  message: string
}

export interface JobStatus {
  id: string
  status: 'queued' | 'preparing' | 'rendering' | 'verifying' | 'done' | 'error' | 'cancelled'
  progress: number
  message: string
  error: string | null
  warning: string | null
  outputBytes: number | null
  outputDuration: number | null
  queuePosition: number
  downloadName: string
  encoder?: string | null
  hardware?: boolean | null
  encodeFps?: number | null
  encodeSpeed?: number | null
  elapsedSec?: number | null
  etaSec?: number | null
  stage?: string | null
}

export interface EncoderCatalog {
  version: string
  encoders: { id: string; label: string; hardware: boolean; listed: boolean; verified: boolean; detail: string | null }[]
  autoStill: string | null
  autoMotion: string | null
}

export async function health(): Promise<boolean> {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return false
    const data = (await response.json()) as { ok?: boolean; ffmpeg?: boolean }
    return Boolean(data.ok && data.ffmpeg)
  } catch {
    return false
  }
}

export function uploadClip(file: File, onProgress: (fraction: number) => void): Promise<ServerClip> {
  const body = new FormData()
  body.append('file', file, file.name)
  return sendForm<ServerClip>('/api/clips', body, onProgress)
}

export async function clipExists(id: string): Promise<boolean> {
  const response = await fetch(`/api/clips/${id}`)
  return response.ok
}

export async function deleteClip(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(`/api/clips/${id}`, { method: 'DELETE' })
  if (response.ok) return { ok: true }
  return { ok: false, error: await readError(response) }
}

export async function importUrl(url: string): Promise<ImportResult> {
  const response = await fetch('/api/import-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as ImportResult
}

export function startExport(body: FormData, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<{ jobId: string }> {
  return sendForm('/api/export', body, onProgress, signal)
}

export interface ScreensaverMedia {
  id: string
  kind: 'image' | 'video'
  duration: number | null
  width: number
  height: number
  hasAudio: boolean
  size: number
}

export function uploadScreensaverMedia(file: File, onProgress: (fraction: number) => void): Promise<ScreensaverMedia> {
  const body = new FormData()
  body.append('file', file, file.name)
  return sendForm<ScreensaverMedia>('/api/screensaver/media', body, onProgress)
}

export interface ScreensaverFrame {
  id: string
  name: string
  width: number
  height: number
}

export function screensaverFrameUrl(id: string): string {
  return `/api/screensaver/frames/${id}`
}

export async function listScreensaverFrames(): Promise<ScreensaverFrame[]> {
  const response = await fetch('/api/screensaver/frames')
  if (!response.ok) throw new Error(await readError(response))
  const data = (await response.json()) as { frames?: ScreensaverFrame[] }
  return data.frames ?? []
}

export function uploadScreensaverFrame(file: File): Promise<ScreensaverFrame> {
  const body = new FormData()
  body.append('file', file, file.name)
  return sendForm<ScreensaverFrame>('/api/screensaver/frames', body)
}

export async function deleteScreensaverFrame(id: string): Promise<void> {
  const response = await fetch(`/api/screensaver/frames/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readError(response))
}

export interface ServerUploadCleanup {
  /** When true (default), remove frames, clips, and export outputs on the server. */
  purgeAll?: boolean
  /** Finished export job to delete from server/tmp/outputs immediately. */
  jobId?: string | null
  mediaId?: string | null
  frameIds?: string[]
}

/** @deprecated Use ServerUploadCleanup */
export type ScreensaverUploadCleanup = ServerUploadCleanup

const UPLOAD_CLEANUP_URL = '/api/uploads/cleanup'

export async function cleanupServerUploads(payload: ServerUploadCleanup): Promise<void> {
  const response = await fetch(UPLOAD_CLEANUP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await readError(response))
}

export function beaconCleanupServerUploads(payload: ServerUploadCleanup): void {
  const body = JSON.stringify(payload)
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(UPLOAD_CLEANUP_URL, new Blob([body], { type: 'application/json' }))
    return
  }
  void fetch(UPLOAD_CLEANUP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}

export const cleanupScreensaverUploads = cleanupServerUploads
export const beaconCleanupScreensaverUploads = beaconCleanupServerUploads

export async function screensaverEncoders(): Promise<EncoderCatalog> {
  const response = await fetch('/api/screensaver/encoders')
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as EncoderCatalog
}

export function startScreensaverExport(
  body: FormData,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<{ jobId: string }> {
  return sendForm('/api/screensaver/export', body, onProgress, signal)
}

export async function getJob(id: string): Promise<JobStatus> {
  const response = await fetch(`/api/jobs/${id}`)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as JobStatus
}

export async function cancelJob(id: string): Promise<void> {
  await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' }).catch(() => undefined)
}

function sendForm<T>(url: string, body: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fail = (error: Error) => reject(error)
    xhr.open('POST', url)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / Math.max(1, event.total))
    }
    xhr.onload = () => {
      const data = (xhr.response ?? parseJson(xhr.responseText)) as { error?: string }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T)
        return
      }
      fail(new Error(data?.error || `Request failed (${xhr.status}).`))
    }
    xhr.onerror = () => fail(new Error('Cannot reach the renderer. Make sure the server is running.'))
    xhr.onabort = () => fail(new DOMException('The upload was cancelled.', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
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

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
