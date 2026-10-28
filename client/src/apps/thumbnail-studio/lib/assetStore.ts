import { moveAssetRefs, syncAssetRefs } from '@shared/thumbnailAssets'
import { PENDING_ASSET_REF } from '@shared/thumbnailProject'
import {
  deleteImageAsset,
  findImageAssetByHash,
  getImageAsset,
  saveImageAsset,
  type StoredImageAsset,
} from '../../../lib/idb'

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function storeImageBlob(blob: Blob, name: string, ref: string): Promise<StoredImageAsset> {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const mime = normalizeImageMime(blob.type, header)
  if (!mime || !ALLOWED.has(mime)) throw new Error('Use a PNG, JPEG, or WebP image.')
  const sha256 = await sha256Hex(blob)
  const existing = await findImageAssetByHash(sha256)
  if (existing) {
    const refs = existing.refs.includes(ref) ? existing.refs : [...existing.refs, ref]
    const next = { ...existing, refs }
    await saveImageAsset(next)
    return next
  }
  const bitmap = await createImageBitmap(blob)
  const record: StoredImageAsset = {
    id: crypto.randomUUID(),
    name: name.trim() || 'image',
    mime,
    width: bitmap.width,
    height: bitmap.height,
    byteLength: blob.size,
    sha256,
    refs: [ref],
    blob,
    createdAt: Date.now(),
  }
  bitmap.close()
  await saveImageAsset(record)
  return record
}

export async function syncProjectAssets(projectId: string, previousIds: string[], nextIds: string[]): Promise<string[]> {
  const ids = [...new Set([...previousIds, ...nextIds])]
  const records: StoredImageAsset[] = []
  for (const id of ids) {
    const asset = await getImageAsset(id)
    if (asset) records.push(asset)
  }
  const result = syncAssetRefs(records, projectId, nextIds)
  const removed = new Set(result.removed)
  for (const asset of result.assets) {
    const original = records.find((item) => item.id === asset.id)
    if (!original) continue
    if (original.refs.join('|') === asset.refs.join('|')) continue
    await saveImageAsset({ ...original, refs: asset.refs })
  }
  for (const id of removed) await deleteImageAsset(id)
  return [...removed]
}

export async function movePendingAssets(ids: string[], projectId: string): Promise<void> {
  for (const id of ids) {
    const asset = await getImageAsset(id)
    if (!asset) continue
    const result = moveAssetRefs([asset], PENDING_ASSET_REF, projectId)
    if (result.removed.includes(id)) await deleteImageAsset(id)
    else if (result.assets[0]) await saveImageAsset({ ...asset, refs: result.assets[0].refs })
  }
}

export async function releasePendingAssets(ids: string[]): Promise<void> {
  for (const id of ids) {
    const asset = await getImageAsset(id)
    if (!asset) continue
    const result = syncAssetRefs([asset], PENDING_ASSET_REF, [])
    if (result.removed.includes(id)) await deleteImageAsset(id)
    else if (result.assets[0]) await saveImageAsset({ ...asset, refs: result.assets[0].refs })
  }
}

export function normalizeImageMime(type: string, bytes: Uint8Array): string | null {
  const lower = type.toLowerCase()
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg'
  if (ALLOWED.has(lower)) return lower
  return sniffImageMime(bytes)
}

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
