import { sanitizeSubscribeAnimation } from '@shared/screensaverSubscribeAnimation'
import * as idb from '../../../lib/idb'
import type { SavedScreensaverProject } from '../types'
import { draftRender, type ScreensaverRenderState } from './screensaverProjectModel'

const CATALOG_KEY = 'catalog'

export interface ScreensaverLibrary {
  activeId: string | null
  projects: SavedScreensaverProject[]
  renders: Map<string, ScreensaverRenderState>
  sourceIds: Set<string>
  audioIds: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isProject(value: unknown): value is SavedScreensaverProject {
  if (!isRecord(value)) return false
  return (value.version === 1 || value.version === 2 || value.version === 3) && typeof value.name === 'string' && typeof value.mode === 'string'
}

function isRender(value: unknown): value is ScreensaverRenderState {
  if (!isRecord(value)) return false
  return typeof value.status === 'string' && typeof value.progress === 'number'
}

export async function migrateLegacyScreensaverProject(): Promise<void> {
  const legacy = await idb.loadScreensaverProject<SavedScreensaverProject>()
  if (!legacy || legacy.id) return
  const id = crypto.randomUUID()
  const now = Date.now()
  const project: SavedScreensaverProject = {
    ...legacy,
    version: 3,
    id,
    createdAt: legacy.createdAt ?? now,
    updatedAt: legacy.updatedAt ?? now,
    subscribeAnimation: legacy.subscribeAnimation
      ? sanitizeSubscribeAnimation(legacy.subscribeAnimation)
      : undefined,
  }
  await idb.putScreensaverValue(idb.screensaverProjectKey(id), project)
  const source = await idb.loadScreensaverSource()
  if (source) await idb.putScreensaverValue(idb.screensaverSourceKey(id), source)
  const audio = await idb.loadScreensaverAudio()
  if (audio) await idb.putScreensaverValue(idb.screensaverAudioKey(id), audio)
  await idb.clearScreensaverProject()
  await idb.putScreensaverValue(CATALOG_KEY, { activeId: id })
}

export async function loadScreensaverLibrary(): Promise<ScreensaverLibrary> {
  await migrateLegacyScreensaverProject()
  const entries = await idb.readScreensaverEntries()
  const projects: SavedScreensaverProject[] = []
  const renders = new Map<string, ScreensaverRenderState>()
  const sourceIds = new Set<string>()
  const audioIds = new Set<string>()
  let activeId: string | null = null

  for (const entry of entries) {
    if (entry.key === CATALOG_KEY && isRecord(entry.value) && typeof entry.value.activeId === 'string') {
      activeId = entry.value.activeId
      continue
    }
    if (entry.key.startsWith('project:')) {
      const id = entry.key.slice('project:'.length)
      if (!id || !isProject(entry.value)) continue
      projects.push({ ...entry.value, id: entry.value.id || id, version: 3 })
      continue
    }
    if (entry.key.startsWith('render:')) {
      const id = entry.key.slice('render:'.length)
      if (id && isRender(entry.value)) {
        renders.set(id, {
          ...entry.value,
          downloadedFingerprint:
            typeof entry.value.downloadedFingerprint === 'string' ? entry.value.downloadedFingerprint : null,
          outputMissing: Boolean(entry.value.outputMissing),
        })
      }
      continue
    }
    if (entry.key.startsWith('source:')) {
      const id = entry.key.slice('source:'.length)
      if (id) sourceIds.add(id)
      continue
    }
    if (entry.key.startsWith('audio:')) {
      const id = entry.key.slice('audio:'.length)
      if (id) audioIds.add(id)
    }
  }

  return { activeId, projects, renders, sourceIds, audioIds }
}

export async function saveScreensaverProjectRecord(project: SavedScreensaverProject): Promise<void> {
  if (!project.id) throw new Error('Screensaver project is missing an id.')
  await idb.putScreensaverValue(idb.screensaverProjectKey(project.id), project)
}

export async function loadScreensaverProjectRecord(id: string): Promise<SavedScreensaverProject | null> {
  const saved = await idb.getScreensaverValue<SavedScreensaverProject>(idb.screensaverProjectKey(id))
  if (!saved || !isProject(saved)) return null
  return { ...saved, id }
}

export async function saveScreensaverRenderState(id: string, render: ScreensaverRenderState): Promise<void> {
  await idb.putScreensaverValue(idb.screensaverRenderKey(id), render)
}

export async function loadScreensaverRenderState(id: string): Promise<ScreensaverRenderState | null> {
  const saved = await idb.getScreensaverValue<ScreensaverRenderState>(idb.screensaverRenderKey(id))
  if (!saved || !isRender(saved)) return null
  return {
    ...saved,
    downloadedFingerprint: typeof saved.downloadedFingerprint === 'string' ? saved.downloadedFingerprint : null,
  }
}

export async function saveScreensaverActiveId(id: string): Promise<void> {
  await idb.putScreensaverValue(CATALOG_KEY, { activeId: id })
}

export async function saveScreensaverProjectFile(id: string, kind: 'source' | 'audio', file: File): Promise<void> {
  const key = kind === 'source' ? idb.screensaverSourceKey(id) : idb.screensaverAudioKey(id)
  await idb.putScreensaverValue(key, { name: file.name, type: file.type, blob: file })
}

export async function loadScreensaverProjectFile(id: string, kind: 'source' | 'audio'): Promise<{ name: string; type: string; blob: Blob } | null> {
  const key = kind === 'source' ? idb.screensaverSourceKey(id) : idb.screensaverAudioKey(id)
  const stored = await idb.getScreensaverValue<{ name?: string; type?: string; blob?: Blob }>(key)
  if (!stored?.blob) return null
  return {
    name: typeof stored.name === 'string' ? stored.name : 'file',
    type: typeof stored.type === 'string' ? stored.type : '',
    blob: stored.blob,
  }
}

export async function deleteScreensaverProjectData(id: string): Promise<void> {
  await idb.deleteScreensaverKeys([
    idb.screensaverProjectKey(id),
    idb.screensaverSourceKey(id),
    idb.screensaverAudioKey(id),
    idb.screensaverRenderKey(id),
  ])
}

export function renderOrDraft(renders: Map<string, ScreensaverRenderState>, id: string): ScreensaverRenderState {
  return renders.get(id) ?? draftRender()
}
