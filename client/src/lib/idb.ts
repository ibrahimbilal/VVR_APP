import type { PersistedClip, PresetId, ProjectStyle, TitleSpan } from '../types'

const DB_NAME = 'vvr'
const DB_VERSION = 2
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
