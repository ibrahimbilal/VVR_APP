import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'scripts', 'sea-config.json')
const blobPath = path.join(root, 'dist', 'sea-prep.blob')
const outExe = path.join(root, 'dist', 'VVR-Dev.exe')
const postjectCli = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js')
const seaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

fs.mkdirSync(path.join(root, 'dist'), { recursive: true })

console.log('[build:launcher] Generating SEA blob...')
execFileSync(process.execPath, ['--experimental-sea-config', configPath], {
  cwd: root,
  stdio: 'inherit',
})

if (!fs.existsSync(blobPath)) {
  console.error('[build:launcher] Missing blob:', blobPath)
  process.exit(1)
}

console.log('[build:launcher] Copying Node binary to', outExe)
fs.copyFileSync(process.execPath, outExe)

console.log('[build:launcher] Injecting blob into executable...')
execFileSync(
  process.execPath,
  [
    postjectCli,
    outExe,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    seaFuse,
    '--overwrite',
  ],
  { cwd: root, stdio: 'inherit' },
)

console.log('[build:launcher] Done:', outExe)
