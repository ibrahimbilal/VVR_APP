import type { ImageMotionProject } from '@shared/imageMotion'
import type { PersistedClip, PresetId, ProjectStyle, TitleSpan } from '../types'

const DB_NAME = 'vvr'
const DB_VERSION = 4
const IMAGE_MOTION_META_KEY = 'project'
const IMAGE_MOTION_SCREENSAVER_LINKS_KEY = 'screensaver-links'
const IMAGE_MOTION_MUSIC_KEY = 'music'
const RANKING_META_KEY = 'ranking-videos'
const LEGACY_META_KEY = 'current'

export interface SavedProject {
  version: 1
  name: string
  titleText: string
  spans: TitleSpan[]
  style: ProjectStyle
  activePreset: PresetId
  clips: PersistedClip[]
  musicName: string | null
}

interface StoredFile {
  name: string
  type: string
  blob: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
      if (!db.objectStoreNames.contains('music')) db.createObjectStore('music')
      if (!db.objectStoreNames.contains('screensaver')) db.createObjectStore('screensaver')
      if (!db.objectStoreNames.contains('assets')) {
        const assets = db.createObjectStore('assets', { keyPath: 'id' })
        assets.createIndex('sha256', 'sha256', { unique: false })
      }
      if (!db.objectStoreNames.contains('thumbnail')) db.createObjectStore('thumbnail')
      if (!db.objectStoreNames.contains('image-motion')) db.createObjectStore('image-motion')
      const oldVersion = event.oldVersion
      if (oldVersion > 0 && oldVersion < 2) {
        const tx = request.transaction
        if (tx) {
          const meta = tx.objectStore('meta')
          const legacy = meta.get(LEGACY_META_KEY)
          legacy.onsuccess = () => {
            const value = legacy.result
            if (value && typeof value === 'object') {
              meta.put(value, RANKING_META_KEY)
            }
          }
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local project storage.'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local project storage failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Local project storage failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Local project storage was interrupted.'))
  })
}

async function migrateLegacyRankingMeta(db: IDBDatabase): Promise<void> {
  const ranked = await requestToPromise(db.transaction('meta', 'readonly').objectStore('meta').get(RANKING_META_KEY))
  if (ranked) return
  const legacy = await requestToPromise(db.transaction('meta', 'readonly').objectStore('meta').get(LEGACY_META_KEY))
  if (!legacy || typeof legacy !== 'object') return
  const transaction = db.transaction('meta', 'readwrite')
  transaction.objectStore('meta').put(legacy, RANKING_META_KEY)
  await transactionDone(transaction)
}

export async function loadRankingProject(): Promise<SavedProject | null> {
  const db = await openDb()
  try {
    await migrateLegacyRankingMeta(db)
    const saved = await requestToPromise(db.transaction('meta', 'readonly').objectStore('meta').get(RANKING_META_KEY))
    if (!saved || typeof saved !== 'object') return null
    return saved as SavedProject
  } finally {
    db.close()
  }
}

/** @deprecated Use loadRankingProject */
export const loadProject = loadRankingProject

export async function saveRankingProject(project: SavedProject): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('meta', 'readwrite')
    transaction.objectStore('meta').put(project, RANKING_META_KEY)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

/** @deprecated Use saveRankingProject */
export const saveProject = saveRankingProject

export async function saveClipFile(id: string, file: File): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('files', 'readwrite')
    transaction.objectStore('files').put({ name: file.name, type: file.type, blob: file }, id)
    await transactionDone(transaction)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('This browser ran out of space for a local copy.')
    }
    throw error
  } finally {
    db.close()
  }
}

export async function loadClipFile(id: string): Promise<StoredFile | null> {
  const db = await openDb()
  try {
    const stored = await requestToPromise(db.transaction('files', 'readonly').objectStore('files').get(id))
    return (stored as StoredFile | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function deleteClipFile(id: string): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('files', 'readwrite')
    transaction.objectStore('files').delete(id)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function saveMusicFile(file: File): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('music', 'readwrite')
    transaction.objectStore('music').put({ name: file.name, type: file.type, blob: file }, 'track')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadMusicFile(): Promise<StoredFile | null> {
  const db = await openDb()
  try {
    const stored = await requestToPromise(db.transaction('music', 'readonly').objectStore('music').get('track'))
    return (stored as StoredFile | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function clearMusicFile(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('music', 'readwrite')
    transaction.objectStore('music').delete('track')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function clearRankingProject(): Promise<void> {
  const db = await openDb()
  try {
    const meta = await requestToPromise(
      db.transaction('meta', 'readonly').objectStore('meta').get(RANKING_META_KEY),
    ) as SavedProject | undefined
    const clipIds = meta?.clips?.map((clip) => clip.id) ?? []
    const transaction = db.transaction(['meta', 'files', 'music'], 'readwrite')
    transaction.objectStore('meta').delete(RANKING_META_KEY)
    transaction.objectStore('meta').delete(LEGACY_META_KEY)
    const files = transaction.objectStore('files')
    for (const id of clipIds) files.delete(id)
    transaction.objectStore('music').delete('track')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

/** @deprecated Use clearRankingProject */
export const clearSavedProject = clearRankingProject

export async function saveScreensaverProject<T>(project: T): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    transaction.objectStore('screensaver').put(project, 'project')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function clearScreensaverProject(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    const store = transaction.objectStore('screensaver')
    store.delete('project')
    store.delete('source')
    store.delete('audio')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadScreensaverProject<T>(): Promise<T | null> {
  const db = await openDb()
  try {
    const saved = await requestToPromise(db.transaction('screensaver', 'readonly').objectStore('screensaver').get('project'))
    if (!saved || typeof saved !== 'object') return null
    return saved as T
  } finally {
    db.close()
  }
}

export async function saveScreensaverSource(file: File): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    transaction.objectStore('screensaver').put({ name: file.name, type: file.type, blob: file }, 'source')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadScreensaverSource(): Promise<StoredFile | null> {
  const db = await openDb()
  try {
    const stored = await requestToPromise(db.transaction('screensaver', 'readonly').objectStore('screensaver').get('source'))
    return (stored as StoredFile | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function clearScreensaverSource(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    transaction.objectStore('screensaver').delete('source')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function saveScreensaverAudio(file: File): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    transaction.objectStore('screensaver').put({ name: file.name, type: file.type, blob: file }, 'audio')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadScreensaverAudio(): Promise<StoredFile | null> {
  const db = await openDb()
  try {
    const stored = await requestToPromise(db.transaction('screensaver', 'readonly').objectStore('screensaver').get('audio'))
    return (stored as StoredFile | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function clearScreensaverAudio(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    transaction.objectStore('screensaver').delete('audio')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export function screensaverProjectKey(id: string): string {
  return `project:${id}`
}

export function screensaverSourceKey(id: string): string {
  return `source:${id}`
}

export function screensaverAudioKey(id: string): string {
  return `audio:${id}`
}

export function screensaverRenderKey(id: string): string {
  return `render:${id}`
}

export interface ScreensaverStoreEntry {
  key: string
  value: unknown
}

export async function readScreensaverEntries(): Promise<ScreensaverStoreEntry[]> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const items: ScreensaverStoreEntry[] = []
      const request = db.transaction('screensaver', 'readonly').objectStore('screensaver').openCursor()
      request.onerror = () => reject(request.error ?? new Error('Local project storage failed.'))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve(items)
          return
        }
        items.push({ key: String(cursor.key), value: cursor.value })
        cursor.continue()
      }
    })
  } finally {
    db.close()
  }
}

export async function putScreensaverValue(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    transaction.objectStore('screensaver').put(value, key)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function getScreensaverValue<T>(key: string): Promise<T | null> {
  const db = await openDb()
  try {
    const saved = await requestToPromise(db.transaction('screensaver', 'readonly').objectStore('screensaver').get(key))
    return (saved as T | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function deleteScreensaverKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    const store = transaction.objectStore('screensaver')
    for (const key of keys) store.delete(key)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export interface StoredImageAsset {
  id: string
  name: string
  mime: string
  width: number
  height: number
  byteLength: number
  sha256: string
  refs: string[]
  blob: Blob
  createdAt: number
}

export async function loadThumbnailValue<T>(key: string): Promise<T | null> {
  const db = await openDb()
  try {
    const saved = await requestToPromise(db.transaction('thumbnail', 'readonly').objectStore('thumbnail').get(key))
    return (saved as T | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function saveThumbnailValue<T>(key: string, value: T): Promise<void> {
  const plain = JSON.parse(JSON.stringify(value)) as T
  const db = await openDb()
  try {
    const transaction = db.transaction('thumbnail', 'readwrite')
    transaction.objectStore('thumbnail').put(plain, key)
    await transactionDone(transaction)
  } catch (error) {
    throw storageError(error)
  } finally {
    db.close()
  }
}

export async function deleteThumbnailValue(key: string): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('thumbnail', 'readwrite')
    transaction.objectStore('thumbnail').delete(key)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function listThumbnailKeys(): Promise<string[]> {
  const db = await openDb()
  try {
    const keys = await requestToPromise(db.transaction('thumbnail', 'readonly').objectStore('thumbnail').getAllKeys())
    return keys.filter((key): key is string => typeof key === 'string')
  } finally {
    db.close()
  }
}

export type ThumbnailStoreEntry = { key: string; value: unknown }

export async function readThumbnailEntries(): Promise<ThumbnailStoreEntry[]> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const items: ThumbnailStoreEntry[] = []
      const request = db.transaction('thumbnail', 'readonly').objectStore('thumbnail').openCursor()
      request.onerror = () => reject(request.error ?? new Error('Local thumbnail storage failed.'))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve(items)
          return
        }
        items.push({ key: String(cursor.key), value: cursor.value })
        cursor.continue()
      }
    })
  } finally {
    db.close()
  }
}

export async function deleteThumbnailKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const db = await openDb()
  try {
    const transaction = db.transaction('thumbnail', 'readwrite')
    const store = transaction.objectStore('thumbnail')
    for (const key of keys) store.delete(key)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function getImageAsset(id: string): Promise<StoredImageAsset | null> {
  const db = await openDb()
  try {
    const saved = await requestToPromise(db.transaction('assets', 'readonly').objectStore('assets').get(id))
    return (saved as StoredImageAsset | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function findImageAssetByHash(sha256: string): Promise<StoredImageAsset | null> {
  const db = await openDb()
  try {
    const index = db.transaction('assets', 'readonly').objectStore('assets').index('sha256')
    const saved = await requestToPromise(index.get(sha256))
    return (saved as StoredImageAsset | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function saveImageAsset(asset: StoredImageAsset): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('assets', 'readwrite')
    transaction.objectStore('assets').put(asset)
    await transactionDone(transaction)
  } catch (error) {
    throw storageError(error)
  } finally {
    db.close()
  }
}

export async function deleteImageAsset(id: string): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('assets', 'readwrite')
    transaction.objectStore('assets').delete(id)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export type SavedImageMotionProject = Omit<ImageMotionProject, 'segments'> & {
  segments: ImageMotionProject['segments']
  selectedSegmentId: string | null
  musicName: string | null
}

export async function loadImageMotionProject(): Promise<SavedImageMotionProject | null> {
  const db = await openDb()
  try {
    const saved = await requestToPromise(
      db.transaction('image-motion', 'readonly').objectStore('image-motion').get(IMAGE_MOTION_META_KEY),
    )
    if (!saved || typeof saved !== 'object') return null
    return saved as SavedImageMotionProject
  } finally {
    db.close()
  }
}

export async function saveImageMotionProject(project: SavedImageMotionProject): Promise<void> {
  const plain = JSON.parse(JSON.stringify(project)) as SavedImageMotionProject
  const db = await openDb()
  try {
    const transaction = db.transaction('image-motion', 'readwrite')
    transaction.objectStore('image-motion').put(plain, IMAGE_MOTION_META_KEY)
    await transactionDone(transaction)
  } catch (error) {
    throw storageError(error)
  } finally {
    db.close()
  }
}

export async function saveImageMotionFile(id: string, file: File): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('image-motion', 'readwrite')
    transaction.objectStore('image-motion').put({ name: file.name, type: file.type, blob: file }, `file:${id}`)
    await transactionDone(transaction)
  } catch (error) {
    throw storageError(error)
  } finally {
    db.close()
  }
}

export async function loadImageMotionFile(id: string): Promise<StoredFile | null> {
  const db = await openDb()
  try {
    const stored = await requestToPromise(
      db.transaction('image-motion', 'readonly').objectStore('image-motion').get(`file:${id}`),
    )
    return (stored as StoredFile | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function deleteImageMotionFile(id: string): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('image-motion', 'readwrite')
    transaction.objectStore('image-motion').delete(`file:${id}`)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function saveImageMotionMusicFile(file: File): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('image-motion', 'readwrite')
    transaction.objectStore('image-motion').put({ name: file.name, type: file.type, blob: file }, IMAGE_MOTION_MUSIC_KEY)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadImageMotionMusicFile(): Promise<StoredFile | null> {
  const db = await openDb()
  try {
    const stored = await requestToPromise(
      db.transaction('image-motion', 'readonly').objectStore('image-motion').get(IMAGE_MOTION_MUSIC_KEY),
    )
    return (stored as StoredFile | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function clearImageMotionMusicFile(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('image-motion', 'readwrite')
    transaction.objectStore('image-motion').delete(IMAGE_MOTION_MUSIC_KEY)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadImageMotionScreensaverLinks(): Promise<Record<string, string>> {
  const db = await openDb()
  try {
    const saved = await requestToPromise(
      db.transaction('image-motion', 'readonly').objectStore('image-motion').get(IMAGE_MOTION_SCREENSAVER_LINKS_KEY),
    )
    if (!saved || typeof saved !== 'object') return {}
    const links: Record<string, string> = {}
    for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) links[key] = value.trim()
    }
    return links
  } finally {
    db.close()
  }
}

export async function saveImageMotionScreensaverLinks(links: Record<string, string>): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('image-motion', 'readwrite')
    transaction.objectStore('image-motion').put(links, IMAGE_MOTION_SCREENSAVER_LINKS_KEY)
    await transactionDone(transaction)
  } catch (error) {
    throw storageError(error)
  } finally {
    db.close()
  }
}

export async function clearImageMotionProject(): Promise<void> {
  const db = await openDb()
  try {
    const meta = await requestToPromise(
      db.transaction('image-motion', 'readonly').objectStore('image-motion').get(IMAGE_MOTION_META_KEY),
    ) as SavedImageMotionProject | undefined
    const segmentIds = meta?.segments?.map((segment) => segment.id) ?? []
    const transaction = db.transaction('image-motion', 'readwrite')
    const store = transaction.objectStore('image-motion')
    store.delete(IMAGE_MOTION_META_KEY)
    store.delete(IMAGE_MOTION_MUSIC_KEY)
    store.delete(IMAGE_MOTION_SCREENSAVER_LINKS_KEY)
    for (const id of segmentIds) store.delete(`file:${id}`)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

function storageError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error('This browser ran out of space for local images.')
  }
  return error instanceof Error ? error : new Error('Local project storage failed.')
}

/** Clears cached main media, background audio, and any legacy active-frame entry (full page reload). */
export async function clearScreensaverPreviewCache(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('screensaver', 'readwrite')
    const store = transaction.objectStore('screensaver')
    store.delete('source')
    store.delete('audio')
    store.delete('active-frame')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}
