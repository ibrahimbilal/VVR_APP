import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Walks upward from `startDir` until it finds a package.json with `"name": "ribo-studio"`.
 */
export function findRiboProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root
  while (dir !== root) {
    const pkgPath = path.join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg.name === 'ribo-studio') return dir
      } catch {
        /* ignore */
      }
    }
    dir = path.dirname(dir)
  }
  return null
}

/** Repo root based on this module file (`server/src/*.ts` or `server/dist/*.js`). */
export function riboProjectRootFromThisModule(metaUrl: string): string | null {
  return findRiboProjectRoot(path.dirname(fileURLToPath(metaUrl)))
}
