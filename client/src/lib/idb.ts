import type { PersistedClip, PresetId, ProjectStyle, TitleSpan } from '../types'

const DB_NAME = 'vvr'
const DB_VERSION = 1

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
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
      if (!db.objectStoreNames.contains('music')) db.createObjectStore('music')
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

export async function loadProject(): Promise<SavedProject | null> {
  const db = await openDb()
  try {
    const saved = await requestToPromise(db.transaction('meta', 'readonly').objectStore('meta').get('current'))
    if (!saved || typeof saved !== 'object') return null
    return saved as SavedProject
  } finally {
    db.close()
  }
}

export async function saveProject(project: SavedProject): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction('meta', 'readwrite')
    transaction.objectStore('meta').put(project, 'current')
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

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

export async function clearSavedProject(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction(['meta', 'files', 'music'], 'readwrite')
    transaction.objectStore('meta').clear()
    transaction.objectStore('files').clear()
    transaction.objectStore('music').clear()
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}
