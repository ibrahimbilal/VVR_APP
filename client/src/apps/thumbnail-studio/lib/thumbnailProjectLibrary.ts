import {
  parseThumbnailDocument,
  THUMBNAIL_DOCUMENT_KEY,
  type ThumbnailDocument,
} from '@shared/thumbnailProject'
import * as idb from '../../../lib/idb'

export const THUMBNAIL_CATALOG_KEY = 'catalog'

export interface ThumbnailProjectMeta {
  downloadedFingerprint: string | null
  configFingerprint: string
}

export interface ThumbnailLibrary {
  activeId: string | null
  projects: ThumbnailDocument[]
  meta: Map<string, ThumbnailProjectMeta>
}

export function thumbnailProjectKey(id: string): string {
  return `project:${id}`
}

export function thumbnailMetaKey(id: string): string {
  return `meta:${id}`
}

const defaultMeta = (): ThumbnailProjectMeta => ({
  downloadedFingerprint: null,
  configFingerprint: '',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function parseMeta(value: unknown): ThumbnailProjectMeta {
  if (!isRecord(value)) return defaultMeta()
  return {
    downloadedFingerprint: typeof value.downloadedFingerprint === 'string' ? value.downloadedFingerprint : null,
    configFingerprint: typeof value.configFingerprint === 'string' ? value.configFingerprint : '',
  }
}

export async function migrateLegacyThumbnailDocument(): Promise<void> {
  const legacy = await idb.loadThumbnailValue<unknown>(THUMBNAIL_DOCUMENT_KEY)
  if (!legacy) return
  const parsed = parseThumbnailDocument(legacy)
  if (!parsed?.id) {
    await idb.deleteThumbnailValue(THUMBNAIL_DOCUMENT_KEY)
    return
  }
  const existing = await idb.loadThumbnailValue<unknown>(thumbnailProjectKey(parsed.id))
  if (!existing) {
    await idb.saveThumbnailValue(thumbnailProjectKey(parsed.id), parsed)
    await idb.saveThumbnailValue(THUMBNAIL_CATALOG_KEY, { activeId: parsed.id })
  }
  await idb.deleteThumbnailValue(THUMBNAIL_DOCUMENT_KEY)
}

export async function loadThumbnailLibrary(): Promise<ThumbnailLibrary> {
  await migrateLegacyThumbnailDocument()
  const entries = await idb.readThumbnailEntries()
  const projects: ThumbnailDocument[] = []
  const meta = new Map<string, ThumbnailProjectMeta>()
  let activeId: string | null = null

  for (const entry of entries) {
    if (entry.key === THUMBNAIL_CATALOG_KEY && isRecord(entry.value) && typeof entry.value.activeId === 'string') {
      activeId = entry.value.activeId
      continue
    }
    if (entry.key.startsWith('project:')) {
      const id = entry.key.slice('project:'.length)
      const parsed = parseThumbnailDocument(entry.value)
      if (id && parsed) projects.push({ ...parsed, id: parsed.id || id })
      continue
    }
    if (entry.key.startsWith('meta:')) {
      const id = entry.key.slice('meta:'.length)
      if (id) meta.set(id, parseMeta(entry.value))
    }
  }

  return { activeId, projects, meta }
}

export async function saveThumbnailProjectRecord(project: ThumbnailDocument): Promise<void> {
  await idb.saveThumbnailValue(thumbnailProjectKey(project.id), project)
}

export async function loadThumbnailProjectRecord(id: string): Promise<ThumbnailDocument | null> {
  const saved = await idb.loadThumbnailValue<unknown>(thumbnailProjectKey(id))
  return parseThumbnailDocument(saved)
}

export async function saveThumbnailProjectMeta(id: string, value: ThumbnailProjectMeta): Promise<void> {
  await idb.saveThumbnailValue(thumbnailMetaKey(id), value)
}

export async function loadThumbnailProjectMeta(id: string): Promise<ThumbnailProjectMeta> {
  const saved = await idb.loadThumbnailValue<unknown>(thumbnailMetaKey(id))
  return parseMeta(saved)
}

export async function saveThumbnailActiveId(id: string): Promise<void> {
  await idb.saveThumbnailValue(THUMBNAIL_CATALOG_KEY, { activeId: id })
}

export async function deleteThumbnailProjectData(id: string): Promise<void> {
  await idb.deleteThumbnailKeys([thumbnailProjectKey(id), thumbnailMetaKey(id)])
}
