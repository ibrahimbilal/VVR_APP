import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpDir } from './storage'

export const framesDir = path.join(tmpDir, 'frames')
const registryPath = path.join(tmpDir, 'frames.json')

export interface StoredFrame {
  id: string
  path: string
  originalName: string
  createdAt: number
  width: number
  height: number
  size: number
}

const frames = new Map<string, StoredFrame>()

export async function ensureFrames(): Promise<void> {
  await mkdir(framesDir, { recursive: true })
  await loadRegistry()
}

export function listFrames(): StoredFrame[] {
  return [...frames.values()].sort((a, b) => b.createdAt - a.createdAt)
}

export function getFrame(id: string): StoredFrame | undefined {
  return frames.get(id)
}

export async function addFrame(
  filePath: string,
  originalName: string,
  image: { width: number; height: number },
): Promise<StoredFrame> {
  const id = randomUUID()
  const finalPath = path.join(framesDir, `${id}.png`)
  await rename(filePath, finalPath)
  const info = await stat(finalPath)
  const stored: StoredFrame = {
    id,
    path: finalPath,
    originalName: path.basename(originalName).slice(0, 180) || 'frame.png',
    createdAt: Date.now(),
    width: image.width,
    height: image.height,
    size: info.size,
  }
  frames.set(id, stored)
  await saveRegistry()
  return stored
}

export async function removeFrame(id: string): Promise<boolean> {
  const stored = frames.get(id)
  if (!stored) return false
  frames.delete(id)
  await rm(stored.path, { force: true })
  await saveRegistry()
  return true
}

export async function removeAllFrames(): Promise<void> {
  for (const stored of [...frames.values()]) {
    frames.delete(stored.id)
    await rm(stored.path, { force: true }).catch(() => undefined)
  }
  await saveRegistry()
}

async function loadRegistry(): Promise<void> {
  let raw = ''
  try {
    raw = await readFile(registryPath, 'utf8')
  } catch {
    return
  }
  let parsed: Record<string, StoredFrame> = {}
  try {
    parsed = JSON.parse(raw) as Record<string, StoredFrame>
  } catch {
    return
  }
  for (const stored of Object.values(parsed)) {
    if (!stored?.id || !stored.path) continue
    try {
      await stat(stored.path)
      frames.set(stored.id, stored)
    } catch {
      // Drop registry rows whose files were already removed.
    }
  }
}

async function saveRegistry(): Promise<void> {
  const data = Object.fromEntries(frames)
  await writeFile(registryPath, JSON.stringify(data))
}
