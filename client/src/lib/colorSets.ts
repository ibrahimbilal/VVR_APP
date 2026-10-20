export interface ColorSet {
  id: string
  name: string
  colors: string[]
}

const STORAGE_KEY = 'vvr-color-sets'
const HEX = /^#[0-9a-fA-F]{6}$/

export function defaultColorSets(): ColorSet[] {
  return [
    { id: 'classic', name: 'Classic', colors: ['#ffe14a', '#ff3b3b', '#3ee0ff', '#ffffff'] },
    { id: 'warm', name: 'Warm', colors: ['#ff6b2c', '#ff3b3b', '#ffe14a', '#fff4d6'] },
    { id: 'cool', name: 'Cool', colors: ['#3ee0ff', '#6d8bff', '#b8ff6a', '#ffffff'] },
    { id: 'mono', name: 'Mono', colors: ['#ffffff', '#d4d4d8', '#71717a', '#000000'] },
  ]
}

export function loadColorSets(): { sets: ColorSet[]; activeId: string } {
  const fallback = { sets: defaultColorSets(), activeId: 'classic' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const data = JSON.parse(raw) as { sets?: unknown; activeId?: unknown }
    if (!Array.isArray(data.sets)) return fallback
    const sets = data.sets.map(parseSet).filter((set): set is ColorSet => set !== null)
    if (sets.length === 0) return fallback
    const activeId = typeof data.activeId === 'string' && sets.some((set) => set.id === data.activeId) ? data.activeId : sets[0]!.id
    return { sets, activeId }
  } catch {
    return fallback
  }
}

export function saveColorSets(sets: ColorSet[], activeId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sets, activeId }))
  } catch {
    // Private browsing can reject storage. The sets still work for this visit.
  }
}

function parseSet(value: unknown): ColorSet | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { id?: unknown; name?: unknown; colors?: unknown }
  if (typeof record.id !== 'string' || typeof record.name !== 'string' || !Array.isArray(record.colors)) return null
  const colors = record.colors.filter((color): color is string => typeof color === 'string' && HEX.test(color)).map((color) => color.toLowerCase())
  if (colors.length === 0) return null
  return { id: record.id, name: record.name.slice(0, 40), colors }
}
