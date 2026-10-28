export interface AssetRef {
  id: string
  refs: string[]
}

export function syncAssetRefs(assets: AssetRef[], projectId: string, nextIds: string[]): { assets: AssetRef[]; removed: string[] } {
  const wanted = new Set(nextIds)
  const removed: string[] = []
  const updated = assets.map((asset) => {
    const refs = asset.refs.filter((ref) => ref !== projectId)
    if (wanted.has(asset.id) && !refs.includes(projectId)) refs.push(projectId)
    return { id: asset.id, refs }
  })
  const kept = updated.filter((asset) => {
    if (asset.refs.length === 0) {
      removed.push(asset.id)
      return false
    }
    return true
  })
  return { assets: kept, removed }
}

/** Move a temporary ref (a pending transfer) onto a saved project id. */
export function moveAssetRefs(assets: AssetRef[], from: string, to: string): { assets: AssetRef[]; removed: string[] } {
  const removed: string[] = []
  const updated = assets.map((asset) => {
    if (!asset.refs.includes(from)) return { id: asset.id, refs: [...asset.refs] }
    const refs = asset.refs.filter((ref) => ref !== from)
    if (to && !refs.includes(to)) refs.push(to)
    return { id: asset.id, refs }
  })
  const kept = updated.filter((asset) => {
    if (asset.refs.length === 0) {
      removed.push(asset.id)
      return false
    }
    return true
  })
  return { assets: kept, removed }
}
