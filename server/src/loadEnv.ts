/**
 * Load repo-root `.env` before other server code reads `process.env`.
 * Does not override variables already set in the environment.
 * Clears optional keys that are empty (`KEY=`) so they behave like unset (standalone auto-detect).
 */
import { config } from 'dotenv'
import path from 'node:path'
import { riboProjectRootFromThisModule } from './projectRoot'

const OPTIONAL_EMPTY_CLEAR = [
  'RIBO_REALESRGAN_BINARY',
  'RIBO_REALESRGAN_MODEL_DIR',
  'RIBO_REALESRGAN_ENGINE_DIR',
  'RIBO_REALESRGAN_PROJECT_ROOT',
] as const

/** Map pre-rebrand `VVR_*` keys onto `RIBO_*` when the new key is unset. */
function promoteLegacyEnvKeys(): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('VVR_') || value === undefined) continue
    const riboKey = `RIBO_${key.slice(4)}`
    const existing = process.env[riboKey]
    if (existing !== undefined && String(existing).trim() !== '') continue
    process.env[riboKey] = value
  }
}

const root = riboProjectRootFromThisModule(import.meta.url)
if (root) {
  config({ path: path.join(root, '.env') })
  promoteLegacyEnvKeys()
  for (const key of OPTIONAL_EMPTY_CLEAR) {
    if (process.env[key] !== undefined && String(process.env[key]).trim() === '') {
      delete process.env[key]
    }
  }
}
