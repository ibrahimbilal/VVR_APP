import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const buildScript = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'launcher', 'build.mjs')
const result = spawnSync(process.execPath, [buildScript], { stdio: 'inherit' })
process.exit(result.status ?? 1)
