/**
 * Load repo-root `.env` before other server code reads `process.env`.
 * Does not override variables already set in the environment.
 * Clears optional keys that are empty (`KEY=`) so they behave like unset (standalone auto-detect).
 */
import { config } from 'dotenv'
import path from 'node:path'
import { vvrProjectRootFromThisModule } from './projectRoot'

const OPTIONAL_EMPTY_CLEAR = [
  'VVR_REALESRGAN_BINARY',
  'VVR_REALESRGAN_MODEL_DIR',
  'VVR_REALESRGAN_ENGINE_DIR',
  'VVR_REALESRGAN_PROJECT_ROOT',
] as const

const root = vvrProjectRootFromThisModule(import.meta.url)
if (root) {
  config({ path: path.join(root, '.env') })
  for (const key of OPTIONAL_EMPTY_CLEAR) {
    if (process.env[key] !== undefined && String(process.env[key]).trim() === '') {
      delete process.env[key]
    }
  }
}
