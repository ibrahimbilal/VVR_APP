import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Probe } from './probe'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const tmpDir = path.join(root, 'tmp')
export const clipsDir = path.join(tmpDir, 'clips')
export const jobsDir = path.join(tmpDir, 'jobs')
export const outputsDir = path.join(tmpDir, 'outputs')
export const incomingDir = path.join(tmpDir, 'incoming')
const registryPath = path.join(tmpDir, 'registry.json')

export interface StoredClip {
  id: string
  path: string
  originalName: string
  createdAt: number
  duration: number
  width: number
  height: number
  hasAudio: boolean
  size: number
}

const clips = new Map<string, StoredClip>()
const retainCounts = new Map<string, number>()

export async function ensureStorage(): Promise<void> {
  await mkdir(clipsDir, { recursive: true })
  await mkdir(jobsDir, { recursive: true })
  await mkdir(outputsDir, { recursive: true })
  await mkdir(incomingDir, { recursive: true })
  await loadRegistry()
}

export function getClip(id: string): StoredClip | undefined {
  return clips.get(id)
}

export async function addClip(filePath: string, originalName: string, probe: Probe): Promise<StoredClip> {
  const id = randomUUID()
  const ext = safeVideoExt(originalName)
  const finalPath = path.join(clipsDir, `${id}${ext}`)
  await rename(filePath, finalPath)
  const stored: StoredClip = {
    id,
    path: finalPath,
    originalName: path.basename(originalName).slice(0, 180),
    createdAt: Date.now(),
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    hasAudio: probe.hasAudio,
    size: probe.size,
  }
  clips.set(id, stored)
  await saveRegistry()
  return stored
}

export async function removeStoredClip(id: string): Promise<boolean> {
  const stored = clips.get(id)
  if (!stored) return false
  if ((retainCounts.get(id) ?? 0) > 0) return false
  clips.delete(id)
  await rm(stored.path, { force: true })
  await saveRegistry()
  return true
}

export function retainClips(ids: string[]): void {
  for (const id of ids) retainCounts.set(id, (retainCounts.get(id) ?? 0) + 1)
}

export function releaseClips(ids: string[]): void {
  for (const id of ids) {
    const next = (retainCounts.get(id) ?? 1) - 1
    if (next <= 0) retainCounts.delete(id)
    else retainCounts.set(id, next)
  }
}

export function clipIsBusy(id: string): boolean {
  return (retainCounts.get(id) ?? 0) > 0
}

export async function sweepStorage(): Promise<void> {
  const now = Date.now()
  await deleteOlder(outputsDir, now - 2 * 60 * 60 * 1000)
  await deleteOlder(jobsDir, now - 6 * 60 * 60 * 1000)
  await deleteOlder(incomingDir, now - 6 * 60 * 60 * 1000)
  const week = now - 7 * 24 * 60 * 60 * 1000
  for (const stored of [...clips.values()]) {
    if (stored.createdAt < week && !clipIsBusy(stored.id)) {
      clips.delete(stored.id)
      await rm(stored.path, { force: true })
    }
  }
  await saveRegistry()
}

export function safeVideoExt(name: string): string {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.mp4' || ext === '.mov' || ext === '.webm' || ext === '.m4v') return ext
  return '.mp4'
}

export function safeAudioExt(name: string): string {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.mp3' || ext === '.wav' || ext === '.m4a' || ext === '.aac' || ext === '.ogg') return ext
  return ''
}

export function safeDownloadName(name: string): string {
  const cleaned = name.replace(/[^\w\s.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return cleaned || 'ranking'
}

async function loadRegistry(): Promise<void> {
  let raw = ''
  try {
    raw = await readFile(registryPath, 'utf8')
  } catch {
    return
  }
  let parsed: Record<string, StoredClip> = {}
  try {
    parsed = JSON.parse(raw) as Record<string, StoredClip>
  } catch {
    return
  }
  for (const stored of Object.values(parsed)) {
    if (!stored?.id || !stored.path) continue
    try {
      await stat(stored.path)
      clips.set(stored.id, stored)
    } catch {
      // Drop registry rows whose files were already removed.
    }
  }
}

async function saveRegistry(): Promise<void> {
  const data = Object.fromEntries(clips)
  await writeFile(registryPath, JSON.stringify(data))
}

async function deleteOlder(directory: string, olderThan: number): Promise<void> {
  const { readdir } = await import('node:fs/promises')
  let names: string[] = []
  try {
    names = await readdir(directory)
  } catch {
    return
  }
  for (const name of names) {
    const full = path.join(directory, name)
    try {
      const info = await stat(full)
      if (info.mtimeMs < olderThan) await rm(full, { recursive: true, force: true })
    } catch {
      // Ignore files that disappear mid-sweep.
    }
  }
}
