import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CfrEncodeSettings } from './encodingConfig'
import { cacheKeyParts } from './encodingConfig'

export interface SegmentCache {
  dir: string
  get(key: string): Promise<string | null>
  put(key: string, sourcePath: string): Promise<string>
  key(parts: Record<string, unknown>): string
  clear(): Promise<void>
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  return hash.digest('hex')
}

export function hashKey(parts: Record<string, unknown>): string {
  const normalized = JSON.stringify(parts, Object.keys(parts).sort())
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

export async function createSegmentCache(workDir: string): Promise<SegmentCache> {
  const dir = path.join(workDir, 'cfr-cache')
  await mkdir(dir, { recursive: true })

  return {
    dir,
    key(parts) {
      return hashKey(parts)
    },
    async get(key) {
      const target = path.join(dir, `${key}.mp4`)
      if (!(await fileExists(target))) return null
      const info = await stat(target)
      if (info.size < 64) {
        await rm(target, { force: true }).catch(() => undefined)
        return null
      }
      return target
    },
    async put(key, sourcePath) {
      const target = path.join(dir, `${key}.mp4`)
      if (path.resolve(sourcePath) === path.resolve(target)) return target
      const { copyFile } = await import('node:fs/promises')
      await copyFile(sourcePath, target)
      return target
    },
    async clear() {
      const entries = await readdir(dir).catch(() => [])
      await Promise.all(entries.map((name) => rm(path.join(dir, name), { force: true }).catch(() => undefined)))
    },
  }
}

export async function compositionContentHash(compositionPath: string): Promise<string> {
  return hashFile(compositionPath)
}

export function staticSegmentCacheKey(options: {
  compositionHash: string
  settings: CfrEncodeSettings
  frameCount: number
  still: boolean
}): string {
  return hashKey({
    kind: 'static',
    composition: options.compositionHash,
    ...cacheKeyParts(options.settings, options.still, options.frameCount),
  })
}

export function dynamicSegmentCacheKey(options: {
  compositionHash: string
  animationFingerprint: string
  settings: CfrEncodeSettings
  frameCount: number
  overlayX: number
  overlayY: number
}): string {
  return hashKey({
    kind: 'dynamic',
    composition: options.compositionHash,
    animation: options.animationFingerprint,
    overlayX: options.overlayX,
    overlayY: options.overlayY,
    ...cacheKeyParts(options.settings, false, options.frameCount),
  })
}

/** Fingerprint animation PNGs by count + first/last file hashes (full-folder hash is too slow for long uploads). */
export async function animationFingerprint(animationDir: string, frameCount: number): Promise<string> {
  const first = path.join(animationDir, `${String(1).padStart(4, '0')}.png`)
  const last = path.join(animationDir, `${String(frameCount).padStart(4, '0')}.png`)
  const midIndex = Math.max(1, Math.ceil(frameCount / 2))
  const mid = path.join(animationDir, `${String(midIndex).padStart(4, '0')}.png`)
  const parts = [String(frameCount), await hashFile(first), await hashFile(mid), await hashFile(last)]
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

export async function writeCacheManifest(cache: SegmentCache, entries: Record<string, string>): Promise<void> {
  await writeFile(path.join(cache.dir, 'manifest.json'), JSON.stringify(entries, null, 2))
}
