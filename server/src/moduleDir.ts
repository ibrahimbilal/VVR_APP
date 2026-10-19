import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function moduleDir(metaUrl?: string): string {
  if (metaUrl) return path.dirname(fileURLToPath(metaUrl))
  return path.dirname(__filename)
}
